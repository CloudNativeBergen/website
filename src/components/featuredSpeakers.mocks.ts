import { Format, type ProposalExisting } from '@/lib/proposal/types'
import { Flags, type SpeakerWithTalks } from '@/lib/speaker/types'

/**
 * Realistic mock speakers for the Featured Speakers shelf and tile stories.
 * Covers the tricky cases the design must handle gracefully: a long title, a
 * speaker with no image, and a workshop presenter (badge).
 */

const talk = (format: Format): ProposalExisting =>
  ({ format }) as unknown as ProposalExisting

const base = (
  id: string,
  overrides: Partial<SpeakerWithTalks>,
): SpeakerWithTalks =>
  ({
    _id: id,
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    email: `${id}@example.com`,
    ...overrides,
  }) as SpeakerWithTalks

// Portrait (4:5) placeholder images so the crop matches the tile aspect ratio.
const portrait = (bg: string, label: string) =>
  `https://placehold.co/640x800/${bg}/ffffff?text=${encodeURIComponent(label)}`

export const workshopSpeaker = base('speaker-workshop', {
  name: 'Alice Johnson',
  slug: 'alice-johnson',
  title: 'Principal Platform Engineer at Google Cloud',
  image: portrait('1d4ed8', 'Alice'),
  flags: [Flags.localSpeaker],
  talks: [talk(Format.workshop_120)],
})

export const longTitleSpeaker = base('speaker-long-title', {
  name: 'Bjørn-Kristian Aleksandersen',
  slug: 'bjorn-kristian',
  title:
    'Senior Staff Site Reliability Engineer and Observability Lead at MegaCorp International Systems',
  image: portrait('10b981', 'Bjorn'),
  talks: [talk(Format.presentation_45)],
})

export const noImageSpeaker = base('speaker-no-image', {
  name: 'Chen Wei',
  slug: 'chen-wei',
  title: 'Developer Advocate at Fastly',
  talks: [talk(Format.presentation_25)],
})

export const plainSpeaker = base('speaker-plain', {
  name: 'Dana Okoro',
  slug: 'dana-okoro',
  title: 'Independent Kubernetes Consultant',
  image: portrait('6366f1', 'Dana'),
  talks: [talk(Format.presentation_45)],
})

export const shortRoleSpeaker = base('speaker-short-role', {
  name: 'Erik Sørensen',
  slug: 'erik-sorensen',
  title: 'CTO @ Nordcloud',
  image: portrait('facc15', 'Erik'),
  flags: [Flags.firstTimeSpeaker],
  talks: [talk(Format.lightning_10)],
})

export const mockFeaturedSpeakers: SpeakerWithTalks[] = [
  workshopSpeaker,
  longTitleSpeaker,
  noImageSpeaker,
  plainSpeaker,
  shortRoleSpeaker,
]
