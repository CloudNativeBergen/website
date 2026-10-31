/**
 * @vitest-environment node
 *
 * The "no raw Sanity image in <img src>" rule (#1639), proven against the
 * REAL `eslint.config.js`. A raw image field serves the full-size original.
 */
import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const eslint = new ESLint({ cwd: root })

async function restricted(code: string): Promise<number> {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(root, 'src/components/Example.tsx'),
  })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax')
    .length
}

const img = (src: string) =>
  `export const A = ({ speaker }: { speaker: { image: string } }) => <img src=${src} alt="" />\n`

describe('raw Sanity image URLs in <img src>', () => {
  it.each([
    '{speaker.image}',
    '{speaker.imageURL}',
    '"https://cdn.sanity.io/images/p/d/abc-1x1.jpg"',
  ])('refuses src=%s', async (src) => {
    expect(await restricted(img(src))).toBe(1)
  })

  it('allows a resized URL', async () => {
    expect(await restricted(img('{speakerImageUrl(speaker.image)}'))).toBe(0)
  })
})
