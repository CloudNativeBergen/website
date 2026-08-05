/**
 * @vitest-environment jsdom
 *
 * SEEDING THE MERGE MODAL FROM THE DUPLICATE PANEL (#267).
 *
 * The panel's "Merge into the kept document" button hands a pair to this modal.
 * Seeding it only at MOUNT was wrong in a way that broke the exact flow the
 * feature exists to add: closing the modal clears its selection
 * (`resetAndClose`), so opening a suggested pair, closing it without merging,
 * and clicking the SAME pair again produced an empty modal — a click that
 * visibly does nothing. A remount `key` derived from the pair does not fix it,
 * because an identical key is not a remount.
 *
 * These drive the real component through a harness that behaves like the page:
 * one `isOpen` flag, one seed, and buttons that mimic the panel and the
 * "Merge Duplicates" header action.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      admin: {
        mergePreview: {
          useQuery: () => ({
            data: undefined,
            isLoading: false,
            isError: false,
            error: null,
          }),
        },
        merge: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
    },
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('./NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

import { SpeakerMergeModal, type MergeCandidate } from './SpeakerMergeModal'

const SPEAKERS: MergeCandidate[] = [
  {
    _id: 'spk-keep',
    name: 'Ganesh Vasudevan',
    email: 'ganesh.vasudev@gmail.com',
    providers: ['linkedin:2mtSWuh1kA'],
  },
  {
    _id: 'spk-dupe',
    name: 'Ganesh Vasudevan',
    email: 'ganesh.vasudevan@ericsson.com',
    providers: ['github:23187057'],
  },
  {
    _id: 'spk-other',
    name: 'Marcus Noble',
    email: 'marcus@example.com',
    providers: ['github:5'],
  },
  {
    _id: 'spk-other-dupe',
    name: 'Marcus Noble',
    email: 'm.noble@example.com',
    providers: [],
  },
]

const PAIR_A = { survivorId: 'spk-keep', loserId: 'spk-dupe' }
const PAIR_B = { survivorId: 'spk-other', loserId: 'spk-other-dupe' }

/** Mimics `SpeakersPageClient`: one open flag, one seed, panel-style buttons. */
function Harness() {
  const [isOpen, setIsOpen] = useState(false)
  const [seed, setSeed] = useState<{
    survivorId: string
    loserId: string
  } | null>(null)

  return (
    <>
      <button
        onClick={() => {
          setSeed(PAIR_A)
          setIsOpen(true)
        }}
      >
        panel pair A
      </button>
      <button
        onClick={() => {
          setSeed(PAIR_B)
          setIsOpen(true)
        }}
      >
        panel pair B
      </button>
      <button
        onClick={() => {
          setSeed(null)
          setIsOpen(true)
        }}
      >
        manual merge
      </button>
      <SpeakerMergeModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        speakers={SPEAKERS}
        initialSurvivorId={seed?.survivorId}
        initialLoserId={seed?.loserId}
      />
    </>
  )
}

function selects() {
  return {
    survivor: screen.getByRole('combobox', {
      name: /survivor/i,
    }) as HTMLSelectElement,
    duplicate: screen.getByRole('combobox', {
      name: /duplicate/i,
    }) as HTMLSelectElement,
  }
}

function closeModal() {
  fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))
}

afterEach(cleanup)

describe('SpeakerMergeModal — seeding from the duplicate panel', () => {
  it('populates both sides when a pair is handed over', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('panel pair A'))

    const { survivor, duplicate } = selects()
    expect(survivor.value).toBe('spk-keep')
    expect(duplicate.value).toBe('spk-dupe')
  })

  it('re-seeds the SAME pair after closing without merging', () => {
    // The regression: close clears the selection, so a second click on the same
    // suggestion used to open an empty modal.
    render(<Harness />)
    fireEvent.click(screen.getByText('panel pair A'))
    closeModal()
    fireEvent.click(screen.getByText('panel pair A'))

    const { survivor, duplicate } = selects()
    expect(survivor.value).toBe('spk-keep')
    expect(duplicate.value).toBe('spk-dupe')
  })

  it('seeds a DIFFERENT pair after a close, with no stale selection', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('panel pair A'))
    closeModal()
    fireEvent.click(screen.getByText('panel pair B'))

    const { survivor, duplicate } = selects()
    expect(survivor.value).toBe('spk-other')
    expect(duplicate.value).toBe('spk-other-dupe')
  })

  it('clears a previous seed when opened manually', () => {
    // "Merge Duplicates" in the page header is an UNSEEDED open; it must not
    // inherit whatever the panel selected last.
    render(<Harness />)
    fireEvent.click(screen.getByText('panel pair A'))
    closeModal()
    fireEvent.click(screen.getByText('manual merge'))

    const { survivor, duplicate } = selects()
    expect(survivor.value).toBe('')
    expect(duplicate.value).toBe('')
  })
})

describe('SpeakerMergeModal — option labels', () => {
  it('shows the provider so two same-name duplicates are distinguishable', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('manual merge'))

    const { survivor } = selects()
    const labels = Array.from(survivor.options).map((option) => option.text)

    expect(labels).toContain(
      'Ganesh Vasudevan · LinkedIn · ganesh.vasudev@gmail.com',
    )
    expect(labels).toContain(
      'Ganesh Vasudevan · GitHub · ganesh.vasudevan@ericsson.com',
    )
    // The opaque account id is never shown.
    expect(labels.join('|')).not.toContain('23187057')
  })

  it('labels a speaker with no provider as never signed in', () => {
    // An organizer-created placeholder nobody has claimed — a different and
    // safer thing to fold away than a real account.
    render(<Harness />)
    fireEvent.click(screen.getByText('manual merge'))

    const { survivor } = selects()
    const labels = Array.from(survivor.options).map((option) => option.text)
    expect(labels).toContain(
      'Marcus Noble · never signed in · m.noble@example.com',
    )
  })
})
