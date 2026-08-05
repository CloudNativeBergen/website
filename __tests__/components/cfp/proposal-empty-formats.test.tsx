/**
 * @vitest-environment node
 *
 * The SPEAKER-FACING leaves of the proposal path, fed a conference that has not
 * configured any formats. Both used to dereference the field directly —
 * `conference.formats.map(...)` in the sidebar, `allowedFormats.includes(...)`
 * in the details form — so a freshly provisioned tenant (which is created with
 * no `formats`; see `@/lib/onboarding/create.ts`) crashed them.
 *
 * These are deliberately tested WITHOUT the conference data boundary in the
 * loop: both take a `Conference` as a prop and are rendered from Storybook and
 * from admin surfaces that build their own objects, so they must survive an
 * unnormalised one on their own.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProposalGuidanceSidebar } from '@/components/cfp/ProposalGuidanceSidebar'
import { ProposalDetailsForm } from '@/components/proposal/ProposalDetailsForm'
import type { Conference } from '@/lib/conference/types'
import {
  Format,
  Language,
  Level,
  type ProposalInput,
} from '@/lib/proposal/types'

/** No `formats`, no `topics` — exactly what provisioning writes. */
const FRESH_CONFERENCE = {
  _id: 'conf-fresh',
  title: 'Brand New Conf',
} as Conference

const CONFIGURED_CONFERENCE = {
  ...FRESH_CONFERENCE,
  formats: [Format.lightning_10, Format.presentation_25],
} as Conference

const PROPOSAL: ProposalInput = {
  title: '',
  language: Language.norwegian,
  description: [],
  format: Format.lightning_10,
  level: Level.beginner,
  audiences: [],
  topics: [],
  outline: '',
  tos: false,
}

describe('ProposalGuidanceSidebar with no configured formats', () => {
  it('renders without throwing', () => {
    const html = renderToStaticMarkup(
      <ProposalGuidanceSidebar conference={FRESH_CONFERENCE} />,
    )
    expect(html).toContain('Proposal Tips')
  })

  it('omits the Accepted Formats card rather than showing an empty one', () => {
    const html = renderToStaticMarkup(
      <ProposalGuidanceSidebar conference={FRESH_CONFERENCE} />,
    )
    expect(html).not.toContain('Accepted Formats')
  })

  it('omits the Important Dates card when the conference has no dates', () => {
    // Same class of emptiness: every date on a provisioned conference is
    // absent, which left a heading over an empty list.
    const html = renderToStaticMarkup(
      <ProposalGuidanceSidebar conference={FRESH_CONFERENCE} />,
    )
    expect(html).not.toContain('Important Dates')

    const withDates = renderToStaticMarkup(
      <ProposalGuidanceSidebar
        conference={
          { ...FRESH_CONFERENCE, cfpEndDate: '2026-06-01' } as Conference
        }
      />,
    )
    expect(withDates).toContain('Important Dates')
    expect(withDates).toContain('CFP Closes')
  })

  it('still lists formats when the conference has them', () => {
    const html = renderToStaticMarkup(
      <ProposalGuidanceSidebar conference={CONFIGURED_CONFERENCE} />,
    )
    expect(html).toContain('Accepted Formats')
    expect(html).toContain('Lightning Talk')
  })
})

describe('ProposalDetailsForm with no allowed formats', () => {
  it('renders an empty Format dropdown instead of crashing', () => {
    const html = renderToStaticMarkup(
      <ProposalDetailsForm
        proposal={PROPOSAL}
        setProposal={() => {}}
        conference={FRESH_CONFERENCE}
      />,
    )
    expect(html).toContain('Presentation Format')
    expect(html).not.toContain('Lightning Talk')
  })

  it('offers the allowed formats when the conference has them', () => {
    const html = renderToStaticMarkup(
      <ProposalDetailsForm
        proposal={PROPOSAL}
        setProposal={() => {}}
        conference={CONFIGURED_CONFERENCE}
        allowedFormats={CONFIGURED_CONFERENCE.formats}
      />,
    )
    expect(html).toContain('Lightning Talk')
  })
})
