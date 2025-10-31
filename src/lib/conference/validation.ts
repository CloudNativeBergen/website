import { Conference } from './types'
import { Topic } from '../topic/types'

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
    return // No topics to validate
  }

  const firstTopic = conference.topics[0] as unknown as {
    _ref?: string
    _type?: string
    _id?: string
    title?: string
  }

  // Check if this looks like a Sanity reference instead of an expanded Topic
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

  // Additional validation: ensure all required Topic fields are present
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
