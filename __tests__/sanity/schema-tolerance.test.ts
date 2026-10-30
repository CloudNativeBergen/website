/**
 * Studio rules that keep new documents out of shapes the app has to tolerate.
 * Runs the real schema through Sanity's own `validateDocument`.
 */
import { describe, it, expect } from 'vitest'
import { validateDocument } from 'sanity'
import { getCompiledSchema } from './realSchema'

async function markersAt(document: Record<string, unknown>, field: string) {
  const markers = await validateDocument({
    document: { _id: 'doc-1', ...document },
    workspace: {
      schema: getCompiledSchema(),
      i18n: {
        currentLocale: { id: 'en-US' },
        t: (key: string) => key,
        loadNamespaces: async () => {},
      },
      getClient: () => {
        throw new Error('no client expected')
      },
    },
    getDocumentExists: async () => true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  return markers
    .filter((m: { path?: unknown[] }) => m.path?.at(-1) === field)
    .map((m: { level: string }) => m.level)
}

describe('schema tolerance rules', () => {
  it('warns when a tier price has no amount', async () => {
    expect(
      await markersAt(
        { _type: 'sponsorTier', price: [{ _key: 'p', currency: 'NOK' }] },
        'amount',
      ),
    ).toEqual(['warning'])
  })

  it('warns when an approved travel request has no banking details', async () => {
    expect(
      await markersAt(
        { _type: 'travelSupport', status: 'approved' },
        'bankingDetails',
      ),
    ).toEqual(['warning'])
  })

  it('warns when a review has no score', async () => {
    expect(await markersAt({ _type: 'review' }, 'score')).toEqual(['warning'])
  })

  it('warns when a talk has no speakers', async () => {
    expect(await markersAt({ _type: 'talk' }, 'speakers')).toContain('warning')
  })

  it('warns when a publishing task has no channel', async () => {
    expect(
      await markersAt(
        { _type: 'marketingTask', kind: 'publishing' },
        'channel',
      ),
    ).toEqual(['warning'])
  })

  it('rejects a recipe target page that is not a site path', async () => {
    expect(
      await markersAt(
        {
          _type: 'marketingCampaign',
          recipes: [{ _key: 'r', kind: 'checklist', targetPage: 'tickets' }],
        },
        'targetPage',
      ),
    ).toEqual(['error'])
  })

  it('rejects a schedule slot that ends before it starts', async () => {
    expect(
      await markersAt(
        {
          _type: 'schedule',
          tracks: [
            {
              _key: 't',
              talks: [{ _key: 's', startTime: '15:00', endTime: '14:00' }],
            },
          ],
        },
        'endTime',
      ),
    ).toEqual(['error'])
  })

  it('rejects a conference that ends before it starts', async () => {
    expect(
      await markersAt(
        {
          _type: 'conference',
          startDate: '2026-10-30',
          endDate: '2026-10-25',
        },
        'endDate',
      ),
    ).toEqual(['error'])
  })
})
