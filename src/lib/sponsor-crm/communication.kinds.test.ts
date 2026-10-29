/**
 * @vitest-environment node
 *
 * A KIND OF SPONSOR EMAIL IS LISTED IN FOUR PLACES that the type system does
 * not tie together (#1347): the kinds and their labels, the zod enum the Send
 * action and the Communications filter accept, and the list Sanity Studio
 * shows on the audit record. A kind added to one and not the others is a send
 * the server refuses, a filter chip that finds nothing, or a record Studio
 * shows as an unknown value.
 */
import { describe, expect, it } from 'vitest'
import sponsorActivity from '../../../sanity/schemaTypes/sponsorActivity'
import {
  CommunicationKindSchema,
  SendCommunicationSchema,
} from '@/server/schemas/sponsorForConference'
import {
  COMMUNICATION_KINDS,
  COMMUNICATION_KIND_LABELS,
  describeCommunication,
} from './communication'

const studioList = () => {
  const field = (
    sponsorActivity.fields as Array<{
      name: string
      options?: { list?: Array<{ title: string; value: string }> }
    }>
  ).find((f) => f.name === 'communicationKind')
  return field?.options?.list ?? []
}

describe('the kinds of sponsor email', () => {
  it('are these five, with these labels', () => {
    expect(
      COMMUNICATION_KINDS.map((k) => [k, COMMUNICATION_KIND_LABELS[k]]),
    ).toEqual([
      ['information', 'Information'],
      ['contract', 'Contract'],
      ['registration', 'Registration'],
      ['discount', 'Discount codes'],
      ['workshop-early-access', 'Workshop early access'],
    ])
  })

  it('are the ones the Send action and the Communications filter accept', () => {
    expect([...CommunicationKindSchema.options].sort()).toEqual(
      [...COMMUNICATION_KINDS].sort(),
    )
    expect([...SendCommunicationSchema.shape.kind.options].sort()).toEqual(
      [...COMMUNICATION_KINDS].sort(),
    )
  })

  it('are the ones Sanity Studio lists on the audit record, under the same labels', () => {
    expect(studioList().map((item) => [item.value, item.title])).toEqual(
      COMMUNICATION_KINDS.map((k) => [k, COMMUNICATION_KIND_LABELS[k]]),
    )
  })

  it('names a workshop early-access send in the timeline', () => {
    expect(
      describeCommunication('workshop-early-access', [
        { name: 'Kari Nordmann' },
        { name: 'Ola Nordmann' },
      ]),
    ).toBe('Workshop early access sent to Kari Nordmann (+1)')
  })
})
