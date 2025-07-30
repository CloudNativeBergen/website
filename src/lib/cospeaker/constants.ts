/**
 * API endpoint constants for co-speaker functionality
 */
export const COSPEAKER_API_ENDPOINTS = {
  INVITATIONS: '/api/invitations',
  INVITATION_RESPOND: '/api/invitation/respond',
  INVITATION_DELETE: (proposalId: string) => `/api/invitation/${proposalId}`,
} as const

/**
 * API query parameter constants
 */
export const COSPEAKER_API_PARAMS = {
  PROPOSAL_ID: 'proposalId',
  PROPOSAL_IDS: 'proposalIds',
  TEST_MODE: 'test',
} as const
