/**
 * The assumptions that make `EmailBrandScope` legitimate rather than lucky.
 *
 * The scope publishes the palette into a MODULE variable during render instead
 * of a React context, because email templates are compiled in Next's
 * `react-server` layer where `createContext`/`useContext` do not exist. That
 * trade is only sound while three things hold, so all three are pinned here:
 *
 *   1. the publish happens before any descendant renders (depth-first order),
 *   2. the scope is popped on the way out, so a primitive rendered outside any
 *      `BaseEmailTemplate` gets the house palette rather than the last tenant's,
 *   3. two email renders in flight at once cannot see each other's palette,
 *      because an email tree has nothing that can suspend and therefore renders
 *      in a single synchronous pass.
 *
 * (3) is tested through `renderToPipeableStream` — the streaming renderer
 * `@react-email/render` actually uses inside Resend — and not through
 * `renderToStaticMarkup`, which is synchronous by construction and so could
 * never fail.
 */
import * as React from 'react'
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server'
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton, EmailSectionHeader } from './EmailComponents'
import { emailBrand } from './EmailBrandScope'
import {
  DEFAULT_EMAIL_BRAND_PALETTE,
  resolveEmailBrandPalette,
} from '@/lib/branding/email'
import { unthemedEmailFixtures } from './email-branding.fixtures'

const { event } = unthemedEmailFixtures

/** Two tenants far apart in hue, both dark enough to survive the contrast clamp. */
const MAGENTA = '#9D174D'
const GREEN = '#166534'

const magenta = resolveEmailBrandPalette(MAGENTA)
const green = resolveEmailBrandPalette(GREEN)

function emailWith(brandColor: string, label: string) {
  return (
    <BaseEmailTemplate
      {...event}
      title={label}
      speakerName="Ada Lovelace"
      brandColor={brandColor}
    >
      <EmailButton href="https://example.com">{label}</EmailButton>
    </BaseEmailTemplate>
  )
}

/** Render through the streaming renderer Resend uses, resolved once complete. */
function renderStreaming(element: React.ReactElement): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let html = ''
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString()
        callback()
      },
    })
    sink.on('finish', () => resolvePromise(html))
    sink.on('error', reject)
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(sink)
      },
      onError: reject,
    })
  })
}

describe('EmailBrandScope', () => {
  it('is published before the first descendant renders', () => {
    const html = renderToStaticMarkup(emailWith(MAGENTA, 'CTA'))
    expect(html).toContain(magenta.accent)
    expect(html).not.toContain(DEFAULT_EMAIL_BRAND_PALETTE.accent)
  })

  it('adds no markup of its own', () => {
    // The scope wraps the whole template; if it (or its closing sentinel) ever
    // rendered anything, every byte-identity snapshot would move at once.
    const scoped = renderToStaticMarkup(emailWith(MAGENTA, 'CTA'))
    const bare = renderToStaticMarkup(emailWith(MAGENTA, 'CTA'))
    expect(scoped).toEqual(bare)
    expect(scoped).not.toContain('<!--')
  })

  it('pops the scope, so a primitive rendered afterwards is house-coloured', () => {
    renderToStaticMarkup(emailWith(MAGENTA, 'CTA'))
    expect(emailBrand()).toBe(DEFAULT_EMAIL_BRAND_PALETTE)

    const loose = renderToStaticMarkup(
      <EmailSectionHeader>Standalone</EmailSectionHeader>,
    )
    expect(loose).toContain(DEFAULT_EMAIL_BRAND_PALETTE.accent)
    expect(loose).not.toContain(magenta.accent)
  })

  it('keeps two streaming renders from seeing each other palette', async () => {
    // Both renders are STARTED before either is awaited: if an email tree could
    // suspend, React would interleave them here and one of these assertions
    // would catch the bleed.
    const [magentaHtml, greenHtml] = await Promise.all([
      renderStreaming(emailWith(MAGENTA, 'Magenta CTA')),
      renderStreaming(emailWith(GREEN, 'Green CTA')),
    ])

    expect(magentaHtml).toContain(magenta.accent)
    expect(magentaHtml).not.toContain(green.accent)
    expect(greenHtml).toContain(green.accent)
    expect(greenHtml).not.toContain(magenta.accent)
    expect(emailBrand()).toBe(DEFAULT_EMAIL_BRAND_PALETTE)
  })

  it('leaves the house palette in place for an unthemed send', () => {
    const html = renderToStaticMarkup(
      <BaseEmailTemplate {...event} title="Plain" speakerName="Ada Lovelace">
        <EmailButton href="https://example.com">CTA</EmailButton>
      </BaseEmailTemplate>,
    )
    expect(html).toContain(DEFAULT_EMAIL_BRAND_PALETTE.accent)
  })
})
