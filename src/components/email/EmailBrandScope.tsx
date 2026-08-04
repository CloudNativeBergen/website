import * as React from 'react'

import {
  DEFAULT_EMAIL_BRAND_PALETTE,
  resolveEmailBrandPalette,
  type EmailBrandPalette,
} from '@/lib/branding/email'

/**
 * INHERIT ONCE.
 *
 * Before this existed, every email primitive took its colour from a hard-coded
 * default and no call site ever overrode it, so every CTA in every email went
 * out in the house blue regardless of the tenant. Threading a `color` prop
 * through ~11 templates to ~11 button call sites would have been the same bug
 * waiting to be reintroduced by the next template.
 *
 * Instead `BaseEmailTemplate` — which every React email already wraps itself in
 * — publishes the resolved palette here, and the primitives read it. A new
 * template gets tenant colours by doing nothing.
 *
 * WHY NOT REACT CONTEXT. This started life as `React.createContext`, and that
 * broke `next build`. Email templates are reachable from server route handlers
 * (`/api/cron/weekly-update` -> `lib/status/summary` -> `lib/proposal/server`
 * -> `lib/proposal/email/notification` -> `components/email` -> here), so they
 * are bundled in Next's `react-server` layer, where `react` resolves to
 * `react.react-server.js`. That build exports neither `createContext` NOR
 * `useContext` — a module-scope `createContext` call dies during page-data
 * collection, and a lazy one would merely move the same crash to send time.
 * `'use client'` is not an escape either: it turns this module into a client
 * REFERENCE, and Resend renders these trees with `react-dom/server`, which
 * cannot render a client reference at all. So the mechanism has to be plain
 * JavaScript that behaves identically in the react-server layer, in Node and in
 * the browser (the admin preview modals import `BroadcastTemplate` too).
 *
 * WHY A MODULE VARIABLE IS SAFE HERE. The publish happens during RENDER, not at
 * element construction, and React renders a tree depth-first: `EmailBrandScope`
 * runs before any descendant, so the palette is in place before the first
 * `EmailButton` asks for it. Two concurrent email renders cannot interleave
 * through it, because an email tree contains no Suspense boundary, no `use()`
 * and no async component — nothing that can suspend — so the streaming
 * renderers render each whole tree in one synchronous pass. That invariant is
 * what makes this work, so it is pinned by a test
 * (`email-branding.scope.test.tsx`) rather than left as a comment.
 *
 * The default is the HOUSE palette, and the trailing {@link RestoreEmailBrand}
 * sentinel pops the scope on the way out, so a primitive rendered OUTSIDE any
 * `BaseEmailTemplate` (Storybook, the admin preview panes) keeps its previous
 * appearance instead of inheriting whichever tenant happened to send last.
 */
let activePalette: EmailBrandPalette = DEFAULT_EMAIL_BRAND_PALETTE

/**
 * The palette for the email currently being rendered.
 *
 * Deliberately NOT named `use…`: it is a plain function read during render, not
 * a React hook, and naming it like one would invite the rules-of-hooks
 * machinery — and the next reader — to assume a subscription that is not there.
 */
export function emailBrand(): EmailBrandPalette {
  return activePalette
}

/**
 * Publishes `brandColor`'s palette for the subtree. Renders no markup of its
 * own, so wrapping a template in it is byte-neutral.
 */
export function EmailBrandScope({
  brandColor,
  children,
}: {
  brandColor?: string
  children: React.ReactNode
}) {
  // Resolution is memoised in `resolveEmailBrandPalette` and returns a stable
  // frozen object per hex, so republishing on every render is free and can
  // never hand two primitives two different objects for the same colour.
  const previous = activePalette
  // `react-hooks/globals` is right that writing a module variable during render
  // is a side effect — but both alternatives it offers are unavailable here.
  // `useState` is a hook and the react-server build ships none, and an effect
  // never runs at all when the tree is rendered to a string by Resend. What
  // makes it safe is that the value is CONSUMED during the same render pass, by
  // descendants that always re-render together with this component: an email
  // tree holds no state of its own, so React cannot re-render an `EmailButton`
  // without re-running the scope above it.
  // eslint-disable-next-line react-hooks/globals
  activePalette = resolveEmailBrandPalette(brandColor)

  return (
    <>
      {children}
      <RestoreEmailBrand palette={previous} />
    </>
  )
}

/**
 * The closing half of the scope: React renders siblings in order, so this runs
 * after the whole subtree above it and restores what was published before.
 * Renders `null` — it exists for its ordering, not its output.
 */
function RestoreEmailBrand({ palette }: { palette: EmailBrandPalette }) {
  // Same deliberate render-phase write as the publish above; see the note there.
  activePalette = palette
  return null
}
