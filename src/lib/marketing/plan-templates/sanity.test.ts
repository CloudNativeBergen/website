// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({ docs: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.docs, params })).get(),
  },
  clientWrite: {
    transaction: () => {
      const writes: (() => void)[] = []
      const tx = {
        create: (doc: Record<string, unknown>) => {
          writes.push(() => {
            if (h.docs.some((d) => d._id === doc._id))
              throw Object.assign(new Error('document already exists'), {
                statusCode: 409,
              })
            h.docs.push(doc)
          })
          return tx
        },
        patch: (id: string, fn: (p: unknown) => unknown) => {
          const p = {
            set: (fields: Record<string, unknown>) => {
              writes.push(() =>
                Object.assign(
                  h.docs.find((d) => d._id === id)!,
                  fields,
                ),
              )
              return p
            },
          }
          fn(p)
          return tx
        },
        delete: (id: string) => {
          writes.push(() => {
            h.docs = h.docs.filter((d) => d._id !== id)
          })
          return tx
        },
        commit: async () => {
          writes.forEach((w) => w())
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
  h.docs = [
    { _id: 'conf-A', _type: 'conference', title: 'CNB 2026' },
    { _id: 'sp-1', _type: 'speaker', name: 'Ada' },
  ]
})

describe('Template Versions in Sanity', () => {
  it('writes one organization-owned document per version and reads the Campaigns back as Recipes', async () => {
    expect(await save()).toBe(true)
    expect(h.docs.at(-1)).toMatchObject({
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
    expect(await renameTemplate('org-A', T1, 'Conference playbook')).toBe(2)
    expect(await renameTemplate('org-B', T1, 'Stolen')).toBe(0)
    expect(
      h.docs.filter((d) => d._type === 'planTemplate').map((d) => d.name),
    ).toEqual(['Conference playbook', 'Conference playbook', 'Meetups'])
  })
  it('delete removes every version of that Template, in that organization only', async () => {
    await save()
    await save({ version: 2 })
    await save({ templateId: T2, name: 'Meetups' })
    expect(await deleteTemplate('org-B', T1)).toBe(0)
    expect(await deleteTemplate('org-A', T1)).toBe(2)
    expect(
      h.docs.filter((d) => d._type === 'planTemplate').map((d) => d._id),
    ).toEqual([templateDocId(T2, 1)])
  })
})
