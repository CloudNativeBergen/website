/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import type { ScheduleTrack } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { StreamSponsors } from '@/components/stream/StreamSponsors'

const logo = `<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40"/></svg>`

const sponsor = (_id: string, name: string): ConferenceSponsor => ({
  sponsor: { _id, name, website: `https://${_id}.example`, logo },
  tier: { title: 'Partner', tagline: '' },
})

const sponsors = [
  sponsor('proact', 'Proact IT Norge AS'),
  sponsor('sopra', 'Sopra Steria'),
  sponsor('bekk', 'Bekk'),
]

const track = (sponsorRef?: string): ScheduleTrack => ({
  trackTitle: 'Proact IT - Lillesalen',
  trackDescription: '',
  talks: [],
  sponsor: sponsorRef ? { _ref: sponsorRef } : null,
})

/** Every sponsor the screen links to, by its link's accessible name. */
const linkedSponsors = () =>
  [
    ...new Set(
      screen
        .queryAllByRole('link')
        .map((a) => a.getAttribute('aria-label') ?? ''),
    ),
  ].sort()

describe('StreamSponsors', () => {
  it('a sponsored track shows its sponsor alone, as "Track sponsored by"', () => {
    render(<StreamSponsors track={track('proact')} sponsors={sponsors} />)
    expect(
      screen.getByRole('region', { name: 'Track sponsored by' }),
    ).toHaveTextContent('Track sponsored byProact IT Norge AS')
    expect(linkedSponsors()).toEqual(['Visit Proact IT Norge AS website'])
    expect(screen.queryByText('Thank you to:')).toBeNull()
  })

  it('a track without a sponsor thanks every sponsor in the loop', () => {
    render(<StreamSponsors track={track()} sponsors={sponsors} />)
    expect(screen.getByText('Thank you to:')).toBeVisible()
    expect(linkedSponsors()).toEqual([
      'Visit Bekk website',
      'Visit Proact IT Norge AS website',
      'Visit Sopra Steria website',
    ])
  })

  it('a track whose sponsor is no longer public falls back to the loop', () => {
    render(
      <StreamSponsors
        track={track('proact')}
        sponsors={sponsors.filter((s) => s.sponsor._id !== 'proact')}
      />,
    )
    expect(screen.getByText('Thank you to:')).toBeVisible()
    expect(linkedSponsors()).toEqual([
      'Visit Bekk website',
      'Visit Sopra Steria website',
    ])
  })
})
