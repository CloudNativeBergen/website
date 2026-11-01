import { describe, expect, it } from 'vitest'
import {
  backfillFor,
  type SpeakerDoc,
} from '../../migrations/059-speaker-known-emails-backfill'

const speaker = (fields: Partial<SpeakerDoc>): SpeakerDoc => ({
  _id: 's1',
  _rev: 'r1',
  _type: 'speaker',
  ...fields,
})

describe('059 knownEmails backfill', () => {
  it('seeds the normalized display email on a signed-in speaker without knownEmails', () => {
    expect(
      backfillFor(
        speaker({ email: ' Ola@Example.com ', providers: ['github:1'] }),
      ),
    ).toEqual(['ola@example.com'])
    expect(
      backfillFor(
        speaker({ email: 'a@b.no', providers: ['github:1'], knownEmails: [] }),
      ),
    ).toEqual(['a@b.no'])
  })

  it('leaves placeholders, speakers with knownEmails and speakers without email alone', () => {
    expect(backfillFor(speaker({ email: 'a@b.no' }))).toBeNull()
    expect(backfillFor(speaker({ email: 'a@b.no', providers: [] }))).toBeNull()
    expect(
      backfillFor(
        speaker({
          email: 'a@b.no',
          providers: ['g:1'],
          knownEmails: ['x@y.no'],
        }),
      ),
    ).toBeNull()
    expect(backfillFor(speaker({ providers: ['g:1'] }))).toBeNull()
  })
})
