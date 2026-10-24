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

const root = path.resolve(__dirname, '../../..')
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

  // Every specifier that reaches the Image component: the two public
  // entries, with the `.js` that resolves to the same file, and the
  // `next/dist` modules they re-export (CommonJS and `esm/`).
  const SPECIFIERS = [
    'next/legacy/image',
    'next/image.js',
    'next/legacy/image.js',
    'next/dist/shared/lib/image-external',
    'next/dist/shared/lib/image-external.js',
    'next/dist/client/image-component',
    'next/dist/client/legacy/image',
    'next/dist/esm/shared/lib/image-external.js',
    'next/dist/esm/client/image-component.js',
    'next/dist/esm/client/legacy/image.js',
  ]

  it.each(SPECIFIERS)('refuses %s', async (specifier) => {
    // A real module of the installed Next, not an invented spelling.
    expect(() => require.resolve(specifier)).not.toThrow()
    const code = `import Image from '${specifier}'\nexport const x = Image\n`
    expect(
      await restricted('src/components/photo-wall/wall/WallBoard.tsx', code),
    ).toEqual([expect.stringContaining('never next/image')])
  })

  it('refuses a re-export of it', async () => {
    const code = `export { default } from 'next/image'\n`
    expect(
      await restricted('src/components/photo-wall/wall/index.ts', code),
    ).toEqual([expect.stringContaining('never next/image')])
  })

  it.each([
    'next/link',
    'next/navigation',
    'next/dist/shared/lib/image-config',
  ])('allows %s, which is not the Image component', async (specifier) => {
    const code = `import * as m from '${specifier}'\nexport const x = m\n`
    expect(
      await restricted('src/components/photo-wall/wall/WallBoard.tsx', code),
    ).toEqual([])
  })

  it('leaves the rest of the site alone', async () => {
    expect(
      await restricted('src/components/gallery/Photo.tsx', NEXT_IMAGE),
    ).toEqual([])
  })
})
