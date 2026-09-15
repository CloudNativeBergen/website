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

/**
 * Is this string an absolute `https:` URL?
 *
 * THE SINGLE RULE for the conference's privileged invite links
 * (`speakerRegistrationLink`), applied in two places on purpose:
 *
 *  - `UpdateRegistrationSchema` rejects a bad paste at the tRPC boundary;
 *  - `@/lib/events/handlers/speakerTicket` re-checks AT THE POINT OF USE,
 *    because tRPC is not the only writer. The Sanity field is a bare
 *    `type: 'string'`, and scripts, migrations and imports write the document
 *    directly. A stored `"  "` or `http://…` would otherwise render as
 *    `<a href="  ">Claim Your Speaker Ticket</a>` in every speaker's inbox —
 *    the exact dead CTA this link exists to remove, arriving by another door.
 *
 * Sanity schema validation is NOT the place for it: that runs only in Studio,
 * and the Studio is not mounted here (#1032), so it would never execute.
 *
 * Parses rather than prefix-matching, so `javascript:`, a relative path, a bare
 * hostname and whitespace all fail, while an uppercase `HTTPS://` scheme (which
 * `URL` normalizes) passes. Trim before calling — this does not trim.
 */
export function isAbsoluteHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
