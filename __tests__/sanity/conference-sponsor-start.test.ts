/**
 * The `conference` schema refuses the same sponsor start times the organizer's
 * save refuses (#1345, spec `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §3),
 * so a time edited in Sanity Studio is checked too.
 *
 * The REAL schema is run through Sanity's own `validateDocument`. The
 * combinations and the two refusal texts are the ones asserted through the
 * router in `__tests__/api/trpc/workshop.registration-window.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { validateDocument } from 'sanity'
import { getCompiledSchema } from './realSchema'

const SPONSOR = '2026-06-01T06:00:00.000Z'
const OFFICIAL = '2026-06-15T06:30:00.000Z'

/** What Studio says about the sponsor start time of a conference with these times. */
async function sponsorStartMarkers(times: Record<string, string | undefined>) {
  const markers = await validateDocument({
    document: { _id: 'conf-1', _type: 'conference', ...times },
    // Minimum viable stand-in for a resolved Studio workspace: the real
    // schema, a passthrough translator, and no client.
    workspace: {
      // Throws rather than validating against a schema that did not compile.
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
    .filter(
      (m: { path?: unknown[] }) =>
        m.path?.[0] === 'workshopRegistrationSponsorStart',
    )
    .map(({ level, message }: { level: string; message: string }) => ({
      level,
      message,
    }))
}

const NOT_EARLIER = [
  {
    level: 'error',
    message:
      'Sponsor early access must start before registration opens for everyone',
  },
]
const NO_OFFICIAL_OPENING = [
  {
    level: 'error',
    message:
      'Sponsor early access needs a time when registration opens for everyone',
  },
]

describe('conference.workshopRegistrationSponsorStart validation', () => {
  it('refuses a sponsor start time equal to the official opening', async () => {
    expect(
      await sponsorStartMarkers({
        workshopRegistrationSponsorStart: OFFICIAL,
        workshopRegistrationStart: OFFICIAL,
      }),
    ).toEqual(NOT_EARLIER)
  })

  it('refuses a sponsor start time later than the official opening', async () => {
    expect(
      await sponsorStartMarkers({
        workshopRegistrationSponsorStart: '2026-06-15T06:30:01.000Z',
        workshopRegistrationStart: OFFICIAL,
      }),
    ).toEqual(NOT_EARLIER)
  })

  it('refuses a sponsor start time with no official opening', async () => {
    expect(
      await sponsorStartMarkers({ workshopRegistrationSponsorStart: SPONSOR }),
    ).toEqual(NO_OFFICIAL_OPENING)
  })

  it('refuses the official opening being cleared while a sponsor start time is set', async () => {
    // In Studio that is the same document as the case above, reached by
    // deleting the other field: the marker sits on the field that is left.
    expect(
      await sponsorStartMarkers({
        workshopRegistrationSponsorStart: SPONSOR,
        workshopRegistrationStart: undefined,
        workshopRegistrationEnd: '2026-07-01T07:00:00.000Z',
      }),
    ).toEqual(NO_OFFICIAL_OPENING)
  })

  it('accepts a sponsor start time earlier than the official opening', async () => {
    expect(
      await sponsorStartMarkers({
        workshopRegistrationSponsorStart: SPONSOR,
        workshopRegistrationStart: OFFICIAL,
      }),
    ).toEqual([])
  })

  it('accepts no sponsor start time, with or without an official opening', async () => {
    expect(
      await sponsorStartMarkers({ workshopRegistrationStart: OFFICIAL }),
    ).toEqual([])
    expect(await sponsorStartMarkers({})).toEqual([])
  })
})
