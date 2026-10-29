/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))

import { ActivationChecklist, roomScreenUrls } from './ActivationChecklist'
import { buildActivationChecklist } from '@/lib/settings/activation'

afterEach(cleanup)

describe('roomScreenUrls', () => {
  it('encodes the room and adds the Photo Wall variant', () => {
    expect(roomScreenUrls('https://x.example', 'Room B/2')).toEqual({
      screen: 'https://x.example/stream/Room%20B%2F2',
      wall: 'https://x.example/stream/Room%20B%2F2?wall=1',
    })
  })
})

describe('Room screens row', () => {
  const checklist = buildActivationChecklist(
    {
      visibility: 'live',
      endDate: '2026-05-02',
      schedules: [{ tracks: [{ trackTitle: 'Main' }] }],
    },
    [],
    { now: new Date('2026-04-20T12:00:00Z') },
  )

  it('lists each room screen link, opening in a new tab, with a copy button', () => {
    render(
      <ActivationChecklist
        checklist={checklist}
        baseUrl="https://cnd.example"
      />,
    )
    for (const href of [
      'https://cnd.example/stream/Main',
      'https://cnd.example/stream/Main?wall=1',
    ]) {
      const link = screen.getByRole('link', { name: href })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
    }
    expect(screen.getAllByRole('button', { name: /copy link/i })).toHaveLength(
      2,
    )
  })

  it('lists no links without a base URL', () => {
    render(<ActivationChecklist checklist={checklist} />)
    expect(screen.queryByRole('link', { name: /\/stream\// })).toBeNull()
  })
})
