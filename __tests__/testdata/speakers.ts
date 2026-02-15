import { Flags, Speaker } from '@/lib/speaker/types'

const speakers: Speaker[] = [
  {
    _id: '92a2ad7c-d831-48e2-aff1-ff81f9561388',
    name: 'John Doe',
    title: 'Senior Engineer at Acme Inc.',
    email: 'john@acme.com',
    slug: 'john-doe',
    flags: [Flags.localSpeaker, Flags.firstTimeSpeaker],
    // No image field - should use MissingAvatar
  },
  {
    _id: 'c3a7f9e0-9e8d-4e4b-9e8f-2a4b6d8f9e8d',
    name: 'Alice Smith',
    title: 'DevOps Lead at XYZ Corp.',
    email: 'alice@xyz.com',
    slug: 'alice-smith',
    flags: [],
    // No image field - should use MissingAvatar
  },
  {
    _id: '08913fe1-4e52-43b9-8b27-6d5febf95dbd',
    name: 'Jane Doe',
    title: 'CTO at Acme Inc.',
    email: 'jane@acme.com',
    slug: 'jane-doe',
    flags: [Flags.diverseSpeaker, Flags.requiresTravelFunding],
    isOrganizer: true,
    // No image field - should use MissingAvatar
  },
] as Speaker[]

export default speakers
export const speaker1 = speakers[0]
export const speaker2 = speakers[1]
export const organizer = speakers[2]
