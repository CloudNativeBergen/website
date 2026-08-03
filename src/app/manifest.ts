import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { normalizeDomain } from '@/lib/conference/domains'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { DEFAULT_PRIMARY_COLOR, manifestThemeColor } from '@/lib/branding/theme'
import { PLATFORM_NAME } from '@/lib/branding/platform'

/**
 * Web app manifest (Next.js metadata route → `/manifest.webmanifest`).
 *
 * Next injects `<link rel="manifest">` automatically. Each tenant domain is its
 * own PWA origin and the install identity (`id`/`scope`/`start_url`) is
 * path-based, so per-host `name`/`short_name` are SAFE — a device only ever
 * sees one host's manifest. `name` therefore reflects the conference resolved
 * for the request host; when no conference resolves (e.g. localhost) it falls
 * back to the platform defaults below.
 *
 * `id`/`scope`/`start_url` are intentionally left host-invariant: `id`/`scope`
 * anchor the installed app identity and `start_url` points at `/launch` (a
 * role-aware redirect dispatcher — see `src/app/launch/route.ts`).
 *
 * `theme_color` follows the per-tenant brand theme (THEMING L1): the resolved
 * conference's primary hex, or the house blue when it has no theme (or no
 * conference resolves). It is safe per-host for the same reason `name` is — a
 * device only ever sees one host's manifest.
 *
 * Icons resolve per host via the dynamic `/pwa/icon/*` routes (each
 * conference's own `logomarkBright`, with a static fallback).
 */

// Platform-default launcher label. Must stay consistent with PLATFORM_NAME:
// a platform install showing name 'Konf' but short_name 'CND' is mixed
// branding. Short enough already that no truncation helper is needed.
const PLATFORM_SHORT_NAME = 'Konf'
// Platform-default description, shown only when no conference resolves for the
// host. Must describe the PLATFORM, not any one conference's subject matter —
// it used to describe Nordic Kubernetes events specifically.
const PLATFORM_DESCRIPTION = `${PLATFORM_NAME} — run your conference: call for papers, program, speakers and tickets.`

/** Max length for a PWA `short_name` (kept tight so launchers never truncate). */
const SHORT_NAME_MAX = 12

/** Derive a `short_name` from a full title by truncating on a word boundary. */
function toShortName(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length <= SHORT_NAME_MAX) return trimmed

  const slice = trimmed.slice(0, SHORT_NAME_MAX)
  // Only back off to the last word boundary when the budget cuts THROUGH a word
  // (the next char is not whitespace). A clean fit like "Cloud Native" is kept.
  if (trimmed[SHORT_NAME_MAX] !== ' ') {
    const lastSpace = slice.lastIndexOf(' ')
    if (lastSpace > 0) return slice.slice(0, lastSpace).trim()
  }
  return slice.trim()
}

/**
 * Resolve the host-specific manifest identity. Cached per host (keyed on the
 * `domain` argument and tagged `domain:<host>`) so it revalidates with the same
 * `content:conferences` invalidation as the rest of the per-host surface, while
 * `manifest()` itself stays a thin dynamic wrapper that only reads the host.
 */
async function resolveManifestIdentity(host: string): Promise<{
  name: string
  shortName: string
  description: string
  themeColor: string
}> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:conferences')
  cacheTag(`domain:${host}`)

  try {
    const { conference, error } = await getConferenceForDomain(host)
    // Tag with the resolved conference so a branding/theme save — which
    // revalidates `conferenceTag(id)` — busts this cached manifest too;
    // without it the theme_color would lag by up to the cacheLife window.
    if (conference?._id) {
      cacheTag(conferenceTag(conference._id))
    }
    if (error || !conference?.title) {
      return {
        name: PLATFORM_NAME,
        shortName: PLATFORM_SHORT_NAME,
        description: PLATFORM_DESCRIPTION,
        themeColor: DEFAULT_PRIMARY_COLOR,
      }
    }
    return {
      name: conference.title,
      shortName: toShortName(conference.title),
      description: conference.description || PLATFORM_DESCRIPTION,
      themeColor: manifestThemeColor(conference.theme),
    }
  } catch {
    // A misconfigured/unreachable Sanity must never break the manifest; fall
    // back to the platform identity so installs still succeed.
    return {
      name: PLATFORM_NAME,
      shortName: PLATFORM_SHORT_NAME,
      description: PLATFORM_DESCRIPTION,
      themeColor: DEFAULT_PRIMARY_COLOR,
    }
  }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Normalize BEFORE the cached resolver: the raw Host header can vary in
  // case/whitespace, and the cache key + domain:<host> tag must match the
  // normalized form the rest of the per-host surface (and revalidations) use.
  const host = normalizeDomain((await headers()).get('host') || '')
  const { name, shortName, description, themeColor } =
    await resolveManifestIdentity(host)

  return {
    id: '/',
    name,
    short_name: shortName,
    description,
    start_url: '/launch',
    scope: '/',
    display: 'standalone',
    theme_color: themeColor,
    background_color: '#0b1220',
    icons: [
      {
        src: '/pwa/icon/192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/icon/192-maskable',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/pwa/icon/512-maskable',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
