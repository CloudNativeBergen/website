/**
 * @vitest-environment node
 *
 * Subgraph import boundaries (#1800), proven against the REAL
 * `eslint.config.js`: outside `src/data/` a service cannot import the raw D1
 * client, and no service file can import Sanity. The files need not exist;
 * ESLint applies the config by path.
 */
import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')
const eslint = new ESLint({ cwd: root })

async function restricted(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(root, file),
  })
  const fatal = result.messages.filter((m) => m.fatal)
  expect(fatal).toEqual([])
  return result.messages
    .filter(
      (m) =>
        m.ruleId === 'no-restricted-imports' ||
        m.ruleId === 'no-restricted-syntax',
    )
    .map((m) => m.message)
}

const imp = (spec: string) => `import * as m from '${spec}'\nexport { m }\n`
const dyn = (spec: string) => `export const m = import('${spec}')\n`
const req = (spec: string) => `export const m = require('${spec}')\n`
const reexp = (spec: string) => `export { rawDb } from '${spec}'\n`
const reexpAll = (spec: string) => `export * from '${spec}'\n`

describe('raw D1 client stays in the data layer', () => {
  it.each([
    ['services/cfp/src/worker.ts', './data/db'],
    ['services/cfp/src/subgraph.ts', './data/db.ts'],
    ['services/cfp/src/resolvers/talks.ts', '../data/db'],
    ['services/cfp/src/subgraph.ts', 'drizzle-orm/d1'],
    ['services/cfp/src/subgraph.ts', 'drizzle-orm/d1/driver'],
    ['services/cfp/src/subgraph.ts', './data/./db'],
    ['services/cfp/src/subgraph.ts', './data//db'],
    ['services/cfp/src/subgraph.ts', './data/db/index.js'],
    ['services/cfp/src/subgraph.ts', './data/db.mjs'],
    ['services/cfp/src/subgraph.ts', './data/db?raw'],
    ['services/cfp/src/worker.mts', './data/db'],
    ['services/cfp/src/worker.cts', './data/db'],
    ['services/cfp/src/worker.tsx', './data/db'],
    ['services/cfp/src/worker.js', './data/db'],
    ['services/cfp/src/worker.mjs', './data/db'],
  ])('refuses it in %s (%s)', async (file, spec) => {
    expect(await restricted(file, imp(spec))).toEqual([
      expect.stringContaining('raw D1 client'),
    ])
  })

  it.each([
    ['services/cfp/src/data/index.ts', './db'],
    ['services/cfp/src/data/talks/repo.ts', '../db'],
    ['services/cfp/src/data/index.ts', 'drizzle-orm/d1'],
    ['services/cfp/src/subgraph.ts', './data'],
    ['services/cfp/src/subgraph.ts', '@runkonf/tenancy'],
  ])('allows %s to import %s', async (file, spec) => {
    expect(await restricted(file, imp(spec))).toEqual([])
  })
})

describe('raw D1 client: dynamic loads and re-exports', () => {
  it.each([
    ['dynamic import', dyn('./data/db')],
    ['dynamic import, ?raw', dyn('./data/db?raw')],
    ['require', req('./data/./db')],
    ['require drizzle', req('drizzle-orm/d1')],
    ['re-export', reexp('./data/db')],
  ])('refuses %s outside data/', async (_label, code) => {
    expect(await restricted('services/cfp/src/subgraph.ts', code)).toEqual([
      expect.stringContaining('raw D1 client'),
    ])
  })

  it.each([
    ['named', reexp('./db')],
    ['star', reexpAll('./db.ts')],
    ['index', reexp('./db/index.js')],
  ])('refuses a %s re-export of ./db from data/index.ts', async (_l, code) => {
    expect(await restricted('services/cfp/src/data/index.ts', code)).toEqual([
      expect.stringContaining('re-export the raw D1 client'),
    ])
  })

  it('allows data/ to re-export a repository module', async () => {
    expect(
      await restricted('services/cfp/src/data/index.ts', reexp('./talks')),
    ).toEqual([])
  })
})

describe('services never import Sanity', () => {
  it.each([
    ['services/cfp/src/subgraph.ts', '@/lib/sanity/client'],
    ['services/cfp/src/subgraph.ts', '../../../src/lib/sanity/fetch'],
    ['services/cfp/src/data/index.ts', '@/lib/sanity'],
    ['services/cfp/src/data/index.ts', 'next-sanity'],
    ['services/cfp/src/worker.ts', '@sanity/client'],
    ['services/cfp/src/worker.ts', '@sanity/client/stega'],
    ['services/cfp/src/worker.ts', '@sanity/image-url'],
    ['services/cfp/src/worker.ts', 'sanity'],
    ['services/cfp/src/worker.ts', 'sanity/structure'],
    ['services/cfp/src/worker.ts', 'next-sanity/draft-mode'],
    ['services/cfp/src/worker.js', 'next-sanity'],
    ['api/src/index.ts', '@/lib/sanity/client'],
    ['api/src/index.ts', '@sanity/client'],
  ])('refuses it in %s (%s)', async (file, spec) => {
    expect(await restricted(file, imp(spec))).toEqual([
      expect.stringContaining('do not read Sanity'),
    ])
  })

  it.each([
    ['services/cfp/src/subgraph.ts', dyn('@sanity/client')],
    ['services/cfp/src/data/index.ts', req('next-sanity')],
    ['api/src/index.ts', dyn('@/lib/sanity/fetch')],
  ])('refuses dynamic loads in %s', async (file, code) => {
    expect(await restricted(file, code)).toEqual([
      expect.stringContaining('do not read Sanity'),
    ])
  })

  it('does not match look-alike packages', async () => {
    expect(
      await restricted('services/cfp/src/subgraph.ts', imp('sanity-extra')),
    ).toEqual([])
  })

  it('allows pure domain logic from src/lib', async () => {
    expect(
      await restricted(
        'services/cfp/src/subgraph.ts',
        imp('@/lib/proposal/utils/validation'),
      ),
    ).toEqual([])
  })
})
