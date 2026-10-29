/**
 * @vitest-environment node
 *
 * A `line-clamp-*` utility sets its own `display: -webkit-box`. Tailwind
 * emits display utilities such as `block` AFTER it, so a className with
 * both renders the whole caption in Safari and Firefox (Chromium's newer
 * line-clamp still clamps, which hides the bug in Storybook captures).
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = __dirname
const DISPLAY =
  /(?:^|\s)(block|inline|inline-block|flex|inline-flex|grid)(?:\s|$)/

function sources(at: string): string[] {
  return readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(at, entry.name)
    if (entry.isDirectory()) return sources(full)
    return /\.tsx$/.test(entry.name) &&
      !/\.(test|stories)\.tsx$/.test(entry.name)
      ? [full]
      : []
  })
}

describe('Photo Wall captions clamp in every browser', () => {
  it('never puts a display utility next to line-clamp', () => {
    const offenders: string[] = []
    for (const file of sources(dir)) {
      for (const [literal] of readFileSync(file, 'utf8').matchAll(
        /(['"`])[^'"`]*line-clamp-\d[^'"`]*\1/g,
      )) {
        if (DISPLAY.test(literal.slice(1, -1))) {
          offenders.push(`${path.relative(dir, file)}: ${literal}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
