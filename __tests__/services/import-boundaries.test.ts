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
    .filter((m) => m.ruleId === 'no-restricted-imports')
    .map((m) => m.message)
}

const imp = (spec: string) => `import * as m from '${spec}'\nexport { m }\n`

describe('raw D1 client stays in the data layer', () => {
  it.each([
    ['services/cfp/src/worker.ts', './data/db'],
    ['services/cfp/src/subgraph.ts', './data/db.ts'],
    ['services/cfp/src/resolvers/talks.ts', '../data/db'],
    ['services/cfp/src/subgraph.ts', 'drizzle-orm/d1'],
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

describe('services never import Sanity', () => {
  it.each([
    ['services/cfp/src/subgraph.ts', '@/lib/sanity/client'],
    ['services/cfp/src/subgraph.ts', '../../../src/lib/sanity/fetch'],
    ['services/cfp/src/data/index.ts', '@/lib/sanity'],
    ['services/cfp/src/data/index.ts', 'next-sanity'],
    ['services/cfp/src/worker.ts', '@sanity/client'],
  ])('refuses it in %s (%s)', async (file, spec) => {
    expect(await restricted(file, imp(spec))).toEqual([
      expect.stringContaining('do not read Sanity'),
    ])
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
