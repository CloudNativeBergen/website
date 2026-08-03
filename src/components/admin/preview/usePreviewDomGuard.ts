'use client'

import { useEffect, type RefObject } from 'react'

/**
 * The preview's DOM guard: the two things that must be true of every node the
 * real section components render inside the composer preview.
 *
 * ## 1. No analytics, ever
 *
 * Pirsch's `pa.js` is loaded by the ROOT layout (`src/app/layout.tsx`), so it is
 * present on every admin route and therefore inside this preview. It binds ONE
 * document-level click listener and, on each click, walks up from the target
 * looking for `data-pirsch-event`. The preview renders the REAL CTAs — hero
 * ticket buttons, the CFP row, the sponsor pitch — every one of which carries
 * that attribute. Without this guard, an organizer nudging their hero copy for
 * ten minutes would post a dozen `cta-tickets-hero` conversions into their own
 * statistics, and nothing downstream could tell those from real visitors.
 *
 * `preventDefault` does NOT help: it stops the navigation, not the analytics
 * listener. The only reliable defence is to make the attribute absent when the
 * click happens, so the listener's `closest()` walk finds nothing. We strip
 * `data-pirsch-event` (and its `data-pirsch-meta-*` companions) from the subtree
 * and keep stripping it: React restores the attribute on every re-render, and a
 * carousel step or an accordion toggle re-renders without any state message, so
 * a post-commit effect alone would leave live windows. A `MutationObserver` on
 * the whole subtree closes them — it fires for exactly the mutation that would
 * have re-armed the attribute.
 *
 * ## 2. Placeholder gallery tiles must not go to the CDN
 *
 * Sample gallery images carry a WELL-FORMED but nonexistent Sanity asset ref —
 * deliberately, because `@sanity/image-url` throws on a malformed ref and
 * `ImageCarousel` calls it unconditionally, which would take the whole band down.
 * The cost of that choice is that the builder produces a real CDN URL which 404s,
 * and the carousel falls into its own broken-image state. The placeholder module
 * ships the honest artwork as a `data:` URI on `imageUrl`, which the carousel
 * does not read.
 *
 * So the guard rewrites them. The mapping is built from the placeholder data
 * ITSELF (asset `_ref` → its `imageUrl`), never from a guessed URL pattern, and
 * it is applied to every `<img>`/`<source>` in the subtree — which covers the
 * carousel's hero image, its thumbnail strip and the fullscreen modal without
 * any of those components knowing the preview exists. Rewriting is idempotent:
 * once the `src` is the data URI it no longer matches, so the observer settles
 * after one pass and cannot loop.
 */
export interface PreviewDomGuardOptions {
  /**
   * Sanity asset `_ref` → the `data:` URI to render instead. Empty in Live mode
   * (no placeholders exist) and rebuilt whenever the placeholder set changes.
   */
  placeholderImages?: ReadonlyMap<string, string>
}

/** The attribute Pirsch's click listener looks for. */
const PIRSCH_EVENT_ATTR = 'data-pirsch-event'
const PIRSCH_META_PREFIX = 'data-pirsch-meta-'

function stripPirsch(root: ParentNode): number {
  let stripped = 0
  const targets = root.querySelectorAll(`[${PIRSCH_EVENT_ATTR}]`)
  for (const element of targets) {
    element.removeAttribute(PIRSCH_EVENT_ATTR)
    // Metadata is inert without the event attribute, but leaving it would make
    // a DOM dump look armed. Copy the list first — removing mutates it.
    for (const name of Array.from(element.attributes).map((a) => a.name)) {
      if (name.startsWith(PIRSCH_META_PREFIX)) element.removeAttribute(name)
    }
    stripped++
  }
  return stripped
}

/**
 * The asset HASH inside a Sanity ref: `image-<hash>-<dims>-<ext>` → `<hash>`.
 *
 * Matching on the hash alone — not on the whole ref — is deliberate. The CDN URL
 * the builder emits spells the same asset differently
 * (`…/<hash>-<dims>.<ext>?w=1200`: a DOT before the extension, plus transform
 * query parameters), so a substring test against the raw `_ref` would never
 * fire. The hash is 40 hex characters and appears verbatim in every form.
 */
function assetHash(assetRef: string): string {
  return assetRef.split('-')[1] ?? assetRef
}

/** Does this URL point at one of the placeholder assets? Returns its data URI. */
function placeholderReplacement(
  url: string | null,
  placeholderImages: ReadonlyMap<string, string>,
): string | null {
  if (!url || url.startsWith('data:')) return null
  for (const [assetRef, dataUri] of placeholderImages) {
    if (url.includes(assetHash(assetRef))) return dataUri
  }
  return null
}

function swapPlaceholderImages(
  root: ParentNode,
  placeholderImages: ReadonlyMap<string, string>,
): number {
  if (placeholderImages.size === 0) return 0
  let swapped = 0
  for (const img of root.querySelectorAll('img')) {
    const replacement = placeholderReplacement(
      img.getAttribute('src'),
      placeholderImages,
    )
    if (!replacement) continue
    // srcset first: a surviving srcset out-ranks src and would re-request the
    // 404 the moment the layout changed.
    img.removeAttribute('srcset')
    img.setAttribute('src', replacement)
    swapped++
  }
  for (const source of root.querySelectorAll('source')) {
    const replacement = placeholderReplacement(
      source.getAttribute('srcset') ?? source.getAttribute('src'),
      placeholderImages,
    )
    if (!replacement) continue
    source.setAttribute('srcset', replacement)
    swapped++
  }
  return swapped
}

/**
 * Run one full pass of the guard over `root`. Exported for tests, and for any
 * caller that needs to assert the guarantee rather than trust it.
 *
 * @returns how many nodes each half of the guard touched.
 */
export function sweepPreviewDom(
  root: ParentNode,
  options: PreviewDomGuardOptions = {},
): { pirschStripped: number; imagesSwapped: number } {
  return {
    pirschStripped: stripPirsch(root),
    imagesSwapped: swapPlaceholderImages(
      root,
      options.placeholderImages ?? new Map(),
    ),
  }
}

/**
 * Install the guard on a subtree for as long as the component is mounted.
 *
 * Sweeps synchronously on mount and on every dependency change, then keeps a
 * `MutationObserver` running so nodes that appear later — a carousel step, an
 * opened gallery modal, a band that re-rendered from a state message — are
 * covered without the preview having to know they happened.
 */
export function usePreviewDomGuard(
  rootRef: RefObject<HTMLElement | null>,
  { placeholderImages }: PreviewDomGuardOptions = {},
): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const images = placeholderImages ?? new Map<string, string>()
    const run = () => sweepPreviewDom(root, { placeholderImages: images })

    run()

    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(() => {
      // The sweep itself mutates the subtree, which re-queues the callback —
      // but only once, because a stripped attribute and a swapped `src` no
      // longer match anything. There is no fixed point to oscillate around.
      run()
    })
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [PIRSCH_EVENT_ATTR, 'src', 'srcset'],
    })
    return () => observer.disconnect()
  }, [rootRef, placeholderImages])
}
