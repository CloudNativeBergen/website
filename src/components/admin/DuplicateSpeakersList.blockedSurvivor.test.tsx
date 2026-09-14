/**
 * @vitest-environment jsdom
 *
 * The SURVIVOR's own merge block has to reach the screen (#742).
 *
 * `merge`/`mergePreview` require EXCLUSIVE standing on the survivor as well as
 * the loser, and `pickSurvivor` favours the document with talks and linked
 * accounts — which is exactly the one another tenant is likeliest to hold too.
 * If the panel renders "Merge into the kept document…" on every sibling, the
 * operator only learns at preview time, via a BAD_REQUEST that names nobody.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen, within } from '@testing-library/react'

import { DuplicateSpeakersList } from './DuplicateSpeakersList'
import {
  findDuplicateSpeakerCandidates,
  type DuplicateCandidateSpeaker,
  type MergeBlockReason,
} from '@/lib/speaker/duplicates'

afterEach(cleanup)

function groupsWith(blocks: Record<string, MergeBlockReason | null>) {
  return findDuplicateSpeakerCandidates<DuplicateCandidateSpeaker>([
    {
      _id: 'keeper',
      name: 'Kristoffer Dalby',
      slug: 'kristoffer-dalby',
      email: 'kristoffer@example.com',
      providers: ['github:77'],
      _createdAt: '2024-04-01T10:00:00Z',
      talkCount: 3,
      confirmedTalkCount: 2,
      mergeBlockedReason: blocks.keeper ?? null,
    },
    {
      _id: 'duplicate',
      name: 'Kristoffer Dalby',
      slug: 'kristoffer-dalby',
      email: 'kd@work.example',
      _createdAt: '2026-01-20T10:00:00Z',
      talkCount: 0,
      confirmedTalkCount: 0,
      mergeBlockedReason: blocks.duplicate ?? null,
    },
  ])
}

function card(id: string) {
  // Each member card carries its document id; walk up to the card itself.
  return screen.getByText(id).closest('div.rounded-lg') as HTMLElement
}

describe('DuplicateSpeakersList, blocked survivor', () => {
  it('shows the block on the survivor card instead of "Keep this one" prose', () => {
    render(
      <DuplicateSpeakersList
        groups={groupsWith({ keeper: 'other-organization' })}
        scannedCount={2}
        onMergePair={vi.fn()}
      />,
    )

    const keeper = card('keeper')
    expect(keeper).toHaveTextContent(
      /Nothing can be merged into this document/i,
    )
    expect(keeper).toHaveTextContent(
      /Another organization also has this speaker/i,
    )
    expect(keeper).not.toHaveTextContent(/Suggested survivor/i)
  })

  it('offers no merge anywhere in the group and says so at group level', () => {
    render(
      <DuplicateSpeakersList
        groups={groupsWith({ keeper: 'other-organization' })}
        scannedCount={2}
        onMergePair={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /Merge into the kept document/i }),
    ).toBeNull()
    expect(
      screen.getByText(/None of these documents can be merged away from here/i),
    ).toBeTruthy()
    expect(card('duplicate')).toHaveTextContent(
      /document we suggest keeping cannot take a merge/i,
    )
  })

  it('still offers the merge when only the survivor is clean', () => {
    render(
      <DuplicateSpeakersList
        groups={groupsWith({})}
        scannedCount={2}
        onMergePair={vi.fn()}
      />,
    )

    expect(card('keeper')).toHaveTextContent(/Suggested survivor/i)
    expect(
      within(card('duplicate')).getByRole('button', {
        name: /Merge into the kept document/i,
      }),
    ).toBeTruthy()
    expect(
      screen.queryByText(/None of these documents can be merged away/i),
    ).toBeNull()
  })
})
