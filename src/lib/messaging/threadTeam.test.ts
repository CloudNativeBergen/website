import { describe, it, expect } from 'vitest'
import {
  routingTeamKeyForType,
  deriveThreadTeamChip,
} from '@/lib/messaging/threadTeam'

describe('routingTeamKeyForType', () => {
  it('maps a sponsor thread to the sponsors team', () => {
    expect(routingTeamKeyForType('sponsor')).toBe('sponsors')
  })

  it('maps proposal and general threads to the cfp team', () => {
    expect(routingTeamKeyForType('proposal')).toBe('cfp')
    expect(routingTeamKeyForType('general')).toBe('cfp')
  })
})

describe('deriveThreadTeamChip (L2 badge derivation)', () => {
  const titles = { sponsors: 'Sales', cfp: 'Programme' }

  it('returns a sponsor-tone chip with the sponsors-team title for a sponsor thread', () => {
    expect(deriveThreadTeamChip('sponsor', titles)).toEqual({
      label: 'Sales',
      tone: 'sponsor',
    })
  })

  it('returns a team-tone chip with the cfp-team title for a non-sponsor thread', () => {
    expect(deriveThreadTeamChip('proposal', titles)).toEqual({
      label: 'Programme',
      tone: 'team',
    })
    expect(deriveThreadTeamChip('general', titles)).toEqual({
      label: 'Programme',
      tone: 'team',
    })
  })

  it('returns null when no titles are provided (no teams configured)', () => {
    expect(deriveThreadTeamChip('sponsor', undefined)).toBeNull()
    expect(deriveThreadTeamChip('proposal', undefined)).toBeNull()
  })

  it('returns null when the mapped team has no configured title', () => {
    // Only cfp configured: a sponsor row falls back (null → caller shows the
    // bare "Sponsor" chip); a proposal row gets the cfp chip.
    const cfpOnly = { cfp: 'Programme' }
    expect(deriveThreadTeamChip('sponsor', cfpOnly)).toBeNull()
    expect(deriveThreadTeamChip('proposal', cfpOnly)).toEqual({
      label: 'Programme',
      tone: 'team',
    })
  })
})
