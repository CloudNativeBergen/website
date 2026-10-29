import { describe, expect, it } from 'vitest'
import { staffRoleLabel, staffRoleTitle } from './role'

describe('staff role labels', () => {
  it('derives the title and label from the role', () => {
    expect(staffRoleTitle('photographer')).toBe('Photographers')
    expect(staffRoleLabel('photographer')).toBe('Photographer')
    expect(staffRoleTitle('videographer')).toBe('Videographers')
    expect(staffRoleTitle('stage-crew')).toBe('Stage Crews')
    expect(staffRoleLabel('stage-crew')).toBe('Stage Crew')
  })
})
