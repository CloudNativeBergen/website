import { Conference } from './types'

/**
 * Validates that conference topics are properly expanded (not Sanity references).
 * This helps catch cases where `topics: true` parameter was not passed to the query.
 *
 * @param conference - The conference object to validate
 * @param context - Optional context string for better error messages (e.g., "ProposalManagementModal")
 * @throws Error if topics contain unexpanded references
 */
export function validateExpandedTopics(
  conference: Conference,
  context?: string,
): void {
  if (!conference.topics || conference.topics.length === 0) {
    return
  }

  const firstTopic = conference.topics[0] as unknown as {
    _ref?: string
    _type?: string
    _id?: string
    title?: string
  }

  if (
    firstTopic._ref &&
    firstTopic._type === 'reference' &&
    !firstTopic.title
  ) {
    const errorContext = context ? ` in ${context}` : ''
    throw new Error(
      `Conference topics are not expanded${errorContext}. ` +
      `Please pass \`topics: true\` to getConferenceForCurrentDomain() call. ` +
      `Found reference object: ${JSON.stringify(firstTopic)}`,
    )
  }

  const invalidTopics = conference.topics.filter(
    (topic) => !topic._id || !topic.title,
  )

  if (invalidTopics.length > 0) {
    const errorContext = context ? ` in ${context}` : ''
    throw new Error(
      `Conference topics are missing required fields${errorContext}. ` +
      `Found ${invalidTopics.length} invalid topic(s). ` +
      `First invalid: ${JSON.stringify(invalidTopics[0])}`,
    )
  }
}
