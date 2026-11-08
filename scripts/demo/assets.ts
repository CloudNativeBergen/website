/**
 * Visual assets for the demo seed (#2150). Hand-written SVGs under ./assets
 * (KontainerKonf logos, fictional sponsor logos) and generated, abstract
 * speaker avatars. No faces, no downloads, no real brands.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, 'assets')
const read = (file: string) => readFileSync(join(DIR, file), 'utf8').trim()

/** conference.logo* fields are `inlineSvg`: the SVG markup itself. */
export const brandingSvgs = () => ({
  logoBright: read('kontainerkonf-bright.svg'),
  logoDark: read('kontainerkonf-dark.svg'),
  logomarkBright: read('kontainerkonf-mark-bright.svg'),
  logomarkDark: read('kontainerkonf-mark-dark.svg'),
})

/** sponsor.logo is `inlineSvg`. File name: the brand name, ø→o, kebab-case. */
export const sponsorLogoSvg = (name: string) =>
  read(
    `sponsors/${name
      .toLowerCase()
      .replace(/ø/g, 'o')
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}.svg`,
  )

const PALETTE = [
  ['#0f5c8a', '#f2a541'],
  ['#0f766e', '#fde68a'],
  ['#7c3aed', '#c4b5fd'],
  ['#be123c', '#fecdd3'],
  ['#1e3a8a', '#93c5fd'],
  ['#a16207', '#fef3c7'],
  ['#15803d', '#bbf7d0'],
  ['#475569', '#e2e8f0'],
]

const AVATAR_SIZE = 256

/** An abstract portrait: colours and pattern from sha256(key), initials from name. */
export function avatarSvg(key: string, name: string): string {
  const h = createHash('sha256').update(key).digest()
  const [bg, fg] = PALETTE[h[0] % PALETTE.length]
  const a = h[1] % 4
  const b = (n: number) => 32 + (h[n] % 192)
  const shape = [
    `<circle cx="${b(2)}" cy="${b(3)}" r="${60 + (h[4] % 60)}" fill="${fg}" opacity=".35"/><circle cx="${b(5)}" cy="${b(6)}" r="${30 + (h[7] % 40)}" fill="${fg}" opacity=".25"/>`,
    `<path d="M0 ${b(2)}L256 ${b(3)}V256H0Z" fill="${fg}" opacity=".3"/><path d="M0 ${b(4) + 40}L256 ${b(5)}V256H0Z" fill="${fg}" opacity=".2"/>`,
    `<path d="M${b(2)} 0L256 ${b(3)}L${b(4)} 256Z" fill="${fg}" opacity=".3"/>`,
    `<rect x="${b(2) - 60}" y="${b(3) - 60}" width="140" height="140" rx="24" transform="rotate(${h[4] % 90} 128 128)" fill="${fg}" opacity=".3"/>`,
  ][a]
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}"><rect width="256" height="256" fill="${bg}"/>${shape}<text x="128" y="150" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="96" font-weight="700" fill="#fff">${initials}</text></svg>`
}

/**
 * Sanity names an image asset after its content: `image-<sha1>-<w>x<h>-<ext>`.
 * So the reference is known before upload, and an unchanged avatar is never
 * re-uploaded (the seed checks the id exists first, and verifies the id the
 * upload returns).
 */
export function avatarAsset(key: string, name: string) {
  const svg = avatarSvg(key, name)
  const sha1 = createHash('sha1').update(svg).digest('hex')
  return {
    svg,
    filename: `kkdemo-avatar-${key}.svg`,
    assetId: `image-${sha1}-${AVATAR_SIZE}x${AVATAR_SIZE}-svg`,
  }
}
