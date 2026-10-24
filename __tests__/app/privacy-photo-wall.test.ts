/**
 * /privacy discloses the Photo Wall (Photo Wall spec §12) from the slice that
 * first collects it (M3b): its own section at `#photo-wall`, where the
 * composer's consent line links, and its cookie in the cookie inventory.
 * Only what ships is promised: deleting or unticking yourself arrives with My
 * posts (M6).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { PhotoWallCookieNote, PhotoWallPrivacy } from '@/components/legal'

const root = join(__dirname, '..', '..')
const privacy = readFileSync(
  join(root, 'src/app/(main)/privacy/page.tsx'),
  'utf8',
)
const composer = readFileSync(
  join(root, 'src/components/photo-wall/composer/WallComposer.tsx'),
  'utf8',
)
const html = (component: () => React.ReactElement) =>
  renderToStaticMarkup(createElement(component))
const text = (component: () => React.ReactElement) =>
  html(component)
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')

describe('Photo Wall on /privacy', () => {
  it('has its section and its cookie, for every tenant', () => {
    expect(privacy).toMatch(/^\s*<PhotoWallPrivacy \/>$/m)
    expect(privacy).toMatch(/^\s*<PhotoWallCookieNote \/>$/m)
  })

  it('is the anchor the composer’s consent line links to', () => {
    expect(composer).toContain('href="/privacy#photo-wall"')
    expect(html(PhotoWallPrivacy)).toMatch(/^<div id="photo-wall"/)
  })

  it('says what is collected', () => {
    const copy = text(PhotoWallPrivacy)
    for (const item of [
      'the photo (filtered and resized on your phone, with location and other camera data removed)',
      'your caption',
      'your name if you give one',
      'how the photo is cropped on the wall',
      'whether you allow marketing use',
      'a cookie that recognises your phone',
    ]) {
      expect(copy).toContain(item)
    }
  })

  it('says a photo is reachable by its address from upload until deleted (§5)', () => {
    expect(text(PhotoWallPrivacy)).toContain(
      'anyone who has that address can open it, even before approval or after it is taken off the wall, until it is deleted',
    )
  })

  it('gives the 30-day deletion and the cookie’s real lifetime and scope', () => {
    expect(text(PhotoWallPrivacy)).toContain(
      'we delete every Photo Wall post 30 days after the conference',
    )
    expect(text(PhotoWallCookieNote)).toContain('sent only to the wall')
    expect(text(PhotoWallCookieNote)).toContain('30 days after the conference')
  })

  it('promises no self-service My posts before M6 ships it', () => {
    const copy = text(PhotoWallPrivacy)
    expect(copy).not.toMatch(/My posts/)
    expect(copy).toMatch(/to have a post deleted, contact the organizers/)
  })
})
