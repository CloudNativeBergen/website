/**
 * The notice an organizer-created profile sends. ONE template, two acts:
 *
 * - `co-speaker` (default): the talk already existed and the person was added
 *   to it.
 * - `speaker`: the organizer WROTE the proposal and put this person's name on
 *   it. Saying "added you as a speaker on X" would describe a talk that
 *   acquired them, which is not what happened — and the surprising part is
 *   exactly the part the mail exists to state.
 *
 * The claim instruction and the "this is wrong" contact are the same in both,
 * deliberately: the way back does not depend on which seat you were put in.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CoSpeakerAddedTemplate } from '@/components/email/CoSpeakerAddedTemplate'

const base = {
  speakerName: 'Nina Keynote',
  organizerName: 'Ada Organizer',
  contactEmail: 'cfp@cndn.no',
  proposalTitle: 'Scaling Kubernetes',
  dashboardUrl: 'https://cndn.no/cfp/list',
  eventName: 'CNDN',
  eventLocation: 'Bergen, Norway',
  eventDate: '2026-09-01',
  eventUrl: 'https://cndn.no',
  socialLinks: [],
}

describe('CoSpeakerAddedTemplate copy', () => {
  it('tells a primary speaker a proposal was entered in their name', () => {
    const html = renderToStaticMarkup(
      <CoSpeakerAddedTemplate {...base} role="speaker" />,
    )

    expect(html).toContain('has entered a proposal in your name')
    expect(html).toContain('You are listed as its speaker')
    // The co-speaker sentence describes a different act and must not appear.
    expect(html).not.toContain('added you as a co-speaker')
  })

  it('keeps the co-speaker wording unchanged by default', () => {
    const html = renderToStaticMarkup(<CoSpeakerAddedTemplate {...base} />)

    expect(html).toContain('has added you as a co-speaker on')
    expect(html).toContain('created a speaker profile for you')
    expect(html).not.toContain('entered a proposal in your name')
  })

  it('gives both the same way to claim the profile and the same way back', () => {
    for (const role of ['speaker', 'co-speaker'] as const) {
      const html = renderToStaticMarkup(
        <CoSpeakerAddedTemplate {...base} role={role} />,
      )
      expect(html).toContain('sign in with this email address')
      expect(html).toContain('cfp@cndn.no')
    }
  })
})
