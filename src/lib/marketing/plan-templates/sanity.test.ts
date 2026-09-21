// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  docs: [] as Record<string, unknown>[],
  revs: 0,
  /** Runs once, just before the NEXT commit: another organizer's write. */
  beforeCommit: null as null | (() => Promise<unknown>),
  /** The document ids each committed transaction touched, in order. */
  committed: [] as string[][],
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.docs, params })).get(),
  },
  clientWrite: {
    transaction: () => {
      const writes: (() => void)[] = []
      const touched: string[] = []
      // Guards run before any write: a Sanity transaction is all or nothing.
      const checks: (() => void)[] = []
      const tx = {
        create: (doc: Record<string, unknown>) => {
          touched.push(String(doc._id))
          checks.push(() => {
            if (h.docs.some((d) => d._id === doc._id))
              throw Object.assign(new Error('document already exists'), {
                statusCode: 409,
              })
          })
          writes.push(() => {
            h.docs.push({ ...doc, _rev: `r${++h.revs}` })
          })
          return tx
        },
        patch: (id: string, fn: (p: unknown) => unknown) => {
          touched.push(id)
          const target = () => {
            const doc = h.docs.find((d) => d._id === id)
            if (!doc)
              throw Object.assign(new Error('document not found'), {
                statusCode: 409,
              })
            return doc
          }
          const p = {
            ifRevisionId: (rev: string) => {
              checks.push(() => {
                if (target()._rev !== rev)
                  throw Object.assign(new Error('revision mismatch'), {
                    statusCode: 409,
                  })
              })
              return p
            },
            setIfMissing: () => {
              checks.push(() => void target())
              return p
            },
            set: (fields: Record<string, unknown>) => {
              writes.push(() =>
                Object.assign(target(), fields, { _rev: `r${++h.revs}` }),
              )
              return p
            },
          }
          fn(p)
          return tx
        },
        delete: (id: string) => {
          touched.push(id)
          writes.push(() => {
            h.docs = h.docs.filter((d) => d._id !== id)
          })
          return tx
        },
        commit: async () => {
          const interleave = h.beforeCommit
          h.beforeCommit = null
          await interleave?.()
          checks.forEach((c) => c())
          writes.forEach((w) => w())
          h.committed.push(touched)
          return {}
        },
      }
      return tx
    },
  },
}))

import { recipesFromStored } from '../recipes'
import { BUILTIN_TEMPLATE } from '../template'
import {
  createTemplateVersion,
  deleteTemplate,
  getTemplateVersion,
  listTemplateVersions,
  listTemplates,
  readTemplateHead,
  renameTemplate,
  templateDocId,
  templateNameTaken,
} from './sanity'

const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const cfp = BUILTIN_TEMPLATE.campaigns.filter((c) => c.key === 'cfp')
const save = (
  over: Partial<Parameters<typeof createTemplateVersion>[0]> = {},
) =>
  createTemplateVersion({
    orgId: 'org-A',
    templateId: T1,
    name: 'Our playbook',
    version: 1,
    campaigns: cfp,
    savedFrom: 'conf-A',
    savedBy: 'sp-1',
    savedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  })

beforeEach(() => {
  h.committed = []
  h.docs = [
    { _id: 'conf-A', _type: 'conference', title: 'CNB 2026' },
    { _id: 'sp-1', _type: 'speaker', name: 'Ada' },
  ]
})

describe('Template Versions in Sanity', () => {
  it('writes one organization-owned document per version and reads the Campaigns back as Recipes', async () => {
    expect(await save()).toBe(true)
    expect(h.docs.find((d) => d._type === 'planTemplate')).toMatchObject({
      _id: templateDocId(T1, 1),
      _type: 'planTemplate',
      organization: { _type: 'reference', _ref: 'org-A' },
      templateId: T1,
      version: 1,
      name: 'Our playbook',
    })
    const read = await getTemplateVersion('org-A', T1, 1)
    expect(read).toMatchObject({
      templateId: T1,
      name: 'Our playbook',
      version: 1,
      // What a restore carries forward as the contents' source edition.
      savedFromId: 'conf-A',
    })
    // As every stored Recipe reads back: empty Prerequisite lists are dropped.
    expect(read!.campaigns).toEqual(
      cfp.map((c) => ({ ...c, recipes: recipesFromStored(c.recipes) })),
    )
    expect(read!.campaigns[0].recipes).toHaveLength(cfp[0].recipes.length)
  })
  it('two saves cannot both become the same version', async () => {
    expect(await save()).toBe(true)
    expect(await save({ name: 'The other save' })).toBe(false)
    expect(h.docs.filter((d) => d._type === 'planTemplate')).toHaveLength(1)
    expect((await getTemplateVersion('org-A', T1, 1))!.name).toBe(
      'Our playbook',
    )
  })
  it('never reads another organization’s Template', async () => {
    await save()
    expect(await getTemplateVersion('org-B', T1, 1)).toBeNull()
    expect(await listTemplates('org-B')).toEqual([])
    expect(await listTemplateVersions('org-B', T1)).toEqual([])
    expect(await templateNameTaken('org-B', 'Our playbook')).toBe(false)
  })
  it('lists each Template once, at its latest version, with who saved it and from where', async () => {
    await save()
    await save({ version: 2, savedAt: '2026-10-01T10:00:00.000Z' })
    await save({ templateId: T2, name: 'Meetups' })
    expect(await listTemplates('org-A')).toEqual([
      {
        templateId: T2,
        name: 'Meetups',
        latestVersion: 1,
        campaigns: 1,
        savedAt: '2026-09-01T10:00:00.000Z',
      },
      {
        templateId: T1,
        name: 'Our playbook',
        latestVersion: 2,
        campaigns: 1,
        savedAt: '2026-10-01T10:00:00.000Z',
      },
    ])
    expect(await listTemplateVersions('org-A', T1)).toEqual([
      {
        version: 2,
        savedAt: '2026-10-01T10:00:00.000Z',
        savedByName: 'Ada',
        savedFromTitle: 'CNB 2026',
        restoredFrom: null,
      },
      {
        version: 1,
        savedAt: '2026-09-01T10:00:00.000Z',
        savedByName: 'Ada',
        savedFromTitle: 'CNB 2026',
        restoredFrom: null,
      },
    ])
  })
  it('ignores a document of the old schema-only shape: a string version and no templateId', async () => {
    await save()
    h.docs.push({
      _id: 'planTemplate.handmade',
      _type: 'planTemplate',
      organization: { _type: 'reference', _ref: 'org-A' },
      name: 'Hand-made in the Studio',
      version: '2026.1',
    })
    expect((await listTemplates('org-A')).map((t) => t.name)).toEqual([
      'Our playbook',
    ])
    expect(await templateNameTaken('org-A', 'Hand-made in the Studio')).toBe(
      false,
    )
  })
  it('knows a taken name case-insensitively, except for the Template that holds it', async () => {
    await save()
    expect(await templateNameTaken('org-A', 'our PLAYBOOK')).toBe(true)
    expect(await templateNameTaken('org-A', 'our PLAYBOOK', T1)).toBe(false)
    expect(await templateNameTaken('org-A', 'Something else')).toBe(false)
  })
  it('rename patches the name on every version, and only of that Template in that organization', async () => {
    await save()
    await save({ version: 2 })
    await save({ templateId: T2, name: 'Meetups' })
    expect(
      await renameTemplate('org-A', T1, 'Conference playbook', 'Our playbook'),
    ).toBe(2)
    expect(await renameTemplate('org-B', T1, 'Stolen', 'Our playbook')).toBe(0)
    expect(
      h.docs.filter((d) => d._type === 'planTemplate').map((d) => d.name),
    ).toEqual(['Conference playbook', 'Conference playbook', 'Meetups'])
  })
  it('delete removes every version of that Template, in that organization only', async () => {
    await save()
    await save({ version: 2 })
    await save({ templateId: T2, name: 'Meetups' })
    expect(await deleteTemplate('org-B', T1, 'Our playbook')).toBe(0)
    expect(await deleteTemplate('org-A', T1, 'Our playbook')).toBe(2)
    expect(
      h.docs.filter((d) => d._type === 'planTemplate').map((d) => d._id),
    ).toEqual([templateDocId(T2, 1)])
  })
  it('writes array members the Studio schema declares', async () => {
    await save({
      campaigns: BUILTIN_TEMPLATE.campaigns.filter((c) => c.key === 'speakers'),
    })
    const [campaign] = h.docs.find((d) => d._type === 'planTemplate')!
      .campaigns as {
      _type: string
      _key: string
      triggers: { _type: string; _key: string }[]
      recipes: { _type: string; _key: string }[]
    }[]
    expect(campaign._type).toBe('planTemplateCampaign')
    expect([...new Set(campaign.triggers.map((t) => t._type))]).toEqual([
      'planTemplateTrigger',
    ])
    expect([...new Set(campaign.recipes.map((r) => r._type))]).toEqual([
      'planTemplateRecipe',
    ])
    expect(campaign.recipes.every((r) => r._key)).toBe(true)
  })
})

describe('the Template head: one name, and a guard a later version is written under', () => {
  it('reads the name, the next version and the revision of version 1', async () => {
    await save()
    await save({ version: 2 })
    expect(await readTemplateHead('org-A', T1)).toEqual({
      name: 'Our playbook',
      nextVersion: 3,
      guard: { id: templateDocId(T1, 1), rev: expect.any(String) },
    })
    expect(await readTemplateHead('org-B', T1)).toBeNull()
  })
  it('a version saved across a DELETE does not land, so no orphan can outlive its Template', async () => {
    await save()
    const head = (await readTemplateHead('org-A', T1))!
    expect(await deleteTemplate('org-A', T1, 'Our playbook')).toBe(1)
    expect(await save({ version: head.nextVersion, guard: head.guard })).toBe(
      false,
    )
    expect(h.docs.filter((d) => d._type === 'planTemplate')).toEqual([])
  })
  it('a version saved across a RENAME does not land under the old name', async () => {
    await save()
    const head = (await readTemplateHead('org-A', T1))!
    await renameTemplate('org-A', T1, 'Conference playbook', 'Our playbook')
    expect(
      await save({
        version: head.nextVersion,
        name: head.name,
        guard: head.guard,
      }),
    ).toBe(false)
    expect(
      h.docs.filter((d) => d._type === 'planTemplate').map((d) => d.name),
    ).toEqual(['Conference playbook'])
  })
  it('lands when nothing moved', async () => {
    await save()
    const head = (await readTemplateHead('org-A', T1))!
    expect(await save({ version: 2, guard: head.guard })).toBe(true)
  })
  it('a version that lands BETWEEN a rename’s read and its write still ends up under the new name', async () => {
    await save()
    const head = (await readTemplateHead('org-A', T1))!
    h.beforeCommit = () => save({ version: 2, guard: head.guard })
    expect(
      await renameTemplate('org-A', T1, 'Conference playbook', 'Our playbook'),
    ).toBe(2)
    expect(
      h.docs.filter((d) => d._type === 'planTemplate').map((d) => d.name),
    ).toEqual(['Conference playbook', 'Conference playbook'])
  })
  it('a version that lands BETWEEN a delete’s read and its write is deleted too: no orphan', async () => {
    await save()
    const head = (await readTemplateHead('org-A', T1))!
    h.beforeCommit = () => save({ version: 2, guard: head.guard })
    expect(await deleteTemplate('org-A', T1, 'Our playbook')).toBe(2)
    expect(h.docs.filter((d) => d._type === 'planTemplate')).toEqual([])
  })
  it('renames and deletes a long history in batches under Sanity’s 50-mutation ceiling, version 1 first', async () => {
    for (let version = 1; version <= 120; version++) await save({ version })
    h.committed = []
    expect(
      await renameTemplate('org-A', T1, 'Conference playbook', 'Our playbook'),
    ).toBe(120)
    // 120 patches + the name lock's create and delete, none over the ceiling.
    expect(h.committed.map((ids) => ids.length)).toEqual([50, 50, 22])
    // Version 1 moves in the FIRST batch: from then on a racing save loses.
    expect(h.committed[0]).toContain(templateDocId(T1, 1))
    expect(
      new Set(
        h.docs.filter((d) => d._type === 'planTemplate').map((d) => d.name),
      ),
    ).toEqual(new Set(['Conference playbook']))
    h.committed = []
    expect(await deleteTemplate('org-A', T1, 'Our playbook')).toBe(120)
    // 120 deletes + the name lock's: room is kept for a two-mutation prelude.
    expect(h.committed.map((ids) => ids.length)).toEqual([49, 50, 22])
    expect(h.committed[0]).toContain(templateDocId(T1, 1))
    expect(h.docs.filter((d) => d._type === 'planTemplate')).toEqual([])
  })
})

describe('a Template name is reserved atomically, per organization', () => {
  const T3 = '33333333-3333-4333-8333-333333333333'
  const names = () =>
    h.docs
      .filter((d) => d._type === 'planTemplate')
      .map((d) => [d.templateId, d.name])
  it('two NEW Templates cannot both take a name, however the pre-check raced — and casing does not get round it', async () => {
    expect(await save()).toBe(true)
    // The friendly pre-check is skipped here on purpose: this is the atom.
    expect(await save({ templateId: T2, name: '  our PLAYBOOK ' })).toBe(false)
    expect(names()).toEqual([[T1, 'Our playbook']])
  })
  it('the same name is free in another organization', async () => {
    await save()
    expect(await save({ orgId: 'org-B', templateId: T2 })).toBe(true)
  })
  it('a rename onto a held name is refused whole: no version is renamed', async () => {
    await save()
    await save({ version: 2 })
    await save({ templateId: T2, name: 'Meetups' })
    expect(await renameTemplate('org-A', T1, 'meetups', 'Our playbook')).toBe(
      'taken',
    )
    expect(names()).toEqual([
      [T1, 'Our playbook'],
      [T1, 'Our playbook'],
      [T2, 'Meetups'],
    ])
  })
  it('a rename frees the old name and holds the new one', async () => {
    await save()
    expect(
      await renameTemplate('org-A', T1, 'Conference playbook', 'Our playbook'),
    ).toBe(1)
    expect(await save({ templateId: T2, name: 'Our playbook' })).toBe(true)
    expect(await save({ templateId: T3, name: 'Conference Playbook' })).toBe(
      false,
    )
  })
  it('a rename that only changes the casing keeps its own reservation', async () => {
    await save()
    expect(
      await renameTemplate('org-A', T1, 'OUR PLAYBOOK', 'Our playbook'),
    ).toBe(1)
    expect(names()).toEqual([[T1, 'OUR PLAYBOOK']])
    expect(await save({ templateId: T2, name: 'our playbook' })).toBe(false)
  })
  it('deleting a Template frees its name', async () => {
    await save()
    expect(await deleteTemplate('org-A', T1, 'Our playbook')).toBe(1)
    expect(await save({ templateId: T2 })).toBe(true)
  })
})
