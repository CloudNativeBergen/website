/**
 * @vitest-environment node
 *
 * The Photo Wall's "never `next/image`" rule (spec §5.1, §14), proven
 * against the REAL `eslint.config.js`: a Wall Post photo rendered through
 * `next/image` would keep being served from `/_next/image` for hours after
 * it was removed or deleted. The rule covers the Photo Wall's components and
 * its public routes, where every Wall Post photo is rendered.
 */
import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const eslint = new ESLint({ cwd: root })

/** The `no-restricted-imports` messages ESLint reports for `code` at `file`. */
async function restricted(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(root, file),
  })
  return result.messages
    .filter((m) => m.ruleId === 'no-restricted-imports')
    .map((m) => m.message)
}

const NEXT_IMAGE = `import Image from 'next/image'\nexport const x = Image\n`

describe('Photo Wall photos are never next/image (§5.1, §14)', () => {
  it.each([
    'src/components/photo-wall/wall/WallBoard.tsx',
    'src/components/photo-wall/admin/WallPostCard.tsx',
    'src/components/photo-wall/screen/Pinboard.tsx',
    'src/app/(public)/wall/page.tsx',
    'src/app/(public)/wall/screen/page.tsx',
  ])('refuses next/image in %s', async (file) => {
    expect(await restricted(file, NEXT_IMAGE)).toEqual([
      expect.stringContaining('never next/image'),
    ])
  })

  it('refuses next/legacy/image too', async () => {
    const code = `import Image from 'next/legacy/image'\nexport const x = Image\n`
    expect(
      await restricted('src/components/photo-wall/wall/WallBoard.tsx', code),
    ).toEqual([expect.stringContaining('never next/image')])
  })

  it('leaves the rest of the site alone', async () => {
    expect(
      await restricted('src/components/gallery/Photo.tsx', NEXT_IMAGE),
    ).toEqual([])
  })
})
