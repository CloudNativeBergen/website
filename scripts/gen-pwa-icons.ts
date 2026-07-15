#!/usr/bin/env tsx

/**
 * Generate the committed static PWA icon set from the built-in Cloud Native
 * Days logo mark (`src/lib/pwa/default-mark.ts`, the plain-SVG twin of the
 * `Logomark` component). These files are the fallback the dynamic per-host icon
 * route serves when a conference has no `logomarkBright` or rasterization
 * fails, so an install can never receive a broken icon.
 *
 * They are produced with the SAME composition helper (`renderIconPng`) the
 * dynamic route uses, so the static and dynamic-fallback bytes match.
 *
 * Regenerate with:  pnpm tsx scripts/gen-pwa-icons.ts
 *
 * Emits, into `public/`:
 *   icon-192.png / icon-512.png                 (purpose "any",   transparent)
 *   icon-192-maskable.png / icon-512-maskable.png (purpose "maskable", navy)
 *   apple-touch-icon.png                        (180x180, opaque navy)
 *   favicon-16.png / favicon-32.png             (transparent)
 *   images/default-avatar.png                   (Header fallback avatar)
 *
 * The existing `src/app/favicon.ico` is intentionally left untouched.
 */
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { renderIconPng, ICON_BG_NAVY } from '@/lib/pwa/icons'
import { DEFAULT_LOGOMARK_SVG } from '@/lib/pwa/default-mark'

const PUBLIC_DIR = resolve(process.cwd(), 'public')

function write(relPath: string, bytes: Buffer) {
  const out = resolve(PUBLIC_DIR, relPath)
  writeFileSync(out, bytes)
  console.log(`  ✓ public/${relPath} (${bytes.length} bytes)`)
}

/** Neutral circular avatar: navy disc + white user silhouette. */
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <circle cx="128" cy="128" r="128" fill="${ICON_BG_NAVY}"/>
  <circle cx="128" cy="100" r="44" fill="#94a3b8"/>
  <path d="M44 224a84 84 0 0 1 168 0z" fill="#94a3b8"/>
</svg>`

function main() {
  console.log('Generating static PWA icon set…')

  write(
    'icon-192.png',
    renderIconPng(DEFAULT_LOGOMARK_SVG, { size: 192, variant: 'any' }),
  )
  write(
    'icon-512.png',
    renderIconPng(DEFAULT_LOGOMARK_SVG, { size: 512, variant: 'any' }),
  )
  write(
    'icon-192-maskable.png',
    renderIconPng(DEFAULT_LOGOMARK_SVG, { size: 192, variant: 'maskable' }),
  )
  write(
    'icon-512-maskable.png',
    renderIconPng(DEFAULT_LOGOMARK_SVG, { size: 512, variant: 'maskable' }),
  )
  write(
    'apple-touch-icon.png',
    renderIconPng(DEFAULT_LOGOMARK_SVG, { size: 180, variant: 'apple' }),
  )
  write(
    'favicon-16.png',
    renderIconPng(DEFAULT_LOGOMARK_SVG, { size: 16, variant: 'any' }),
  )
  write(
    'favicon-32.png',
    renderIconPng(DEFAULT_LOGOMARK_SVG, { size: 32, variant: 'any' }),
  )

  mkdirSync(resolve(PUBLIC_DIR, 'images'), { recursive: true })
  const avatar = new Resvg(DEFAULT_AVATAR_SVG, {
    fitTo: { mode: 'width', value: 256 },
  })
    .render()
    .asPng()
  write('images/default-avatar.png', avatar)

  console.log('Done.')
}

main()
