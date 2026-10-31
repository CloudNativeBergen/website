import type { OrgErasurePreview } from '@/lib/privacy/org-erasure'

/** A speaker shared with another organization, plus this org's own records. */
export const sharedSpeakerPreview: OrgErasurePreview = {
  email: 'ada@example.com',
  nothingFound: false,
  refusals: [],
  groups: [
    {
      kind: 'speaker',
      title: 'Speaker profile',
      action: 'keep',
      note: 'Shared with another organization, so it is NOT erased here.',
      items: [
        {
          id: 'speaker-1',
          label:
            'Ada Lovelace — kept: This speaker also belongs to another organization.',
        },
      ],
    },
    {
      kind: 'invitations',
      title: 'Co-speaker invitations',
      action: 'erase',
      note: 'Deleted.',
      items: [{ id: 'inv-1', label: 'Analytical engines (declined)' }],
    },
    {
      kind: 'workshops',
      title: 'Workshop signups',
      action: 'erase',
      note: 'Deleted.',
      items: [{ id: 'ws-1', label: 'Kubernetes 101 (Bergen 2026)' }],
    },
    {
      kind: 'login',
      title: 'Workshop login (WorkOS)',
      action: 'keep',
      note: 'Kept: they also have workshop signups at another organization’s conference.',
      items: [{ id: 'user_01', label: 'user_01' }],
    },
  ],
  remains: [
    'The speaker profile, and the talks that point at it, stay: the person also has data at another organization.',
  ],
}
