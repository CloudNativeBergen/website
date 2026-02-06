import type { PortableTextBlock } from './types'

/**
 * Replace {{{VAR}}} placeholders in a plain string.
 */
export function processTemplateVariables(
  text: string,
  variables: Record<string, string>,
): string {
  let result = text
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\{${key}\\}\\}\\}`, 'g')
    result = result.replace(pattern, value)
  }
  return result
}

/**
 * Deep-clone PortableText blocks and replace {{{VAR}}} placeholders
 * in all text spans.
 */
export function processPortableTextVariables(
  blocks: PortableTextBlock[],
  variables: Record<string, string>,
): PortableTextBlock[] {
  return blocks.map((block) => {
    if (block._type === 'block' && Array.isArray(block.children)) {
      return {
        ...block,
        children: block.children.map((child) => {
          if (child._type === 'span' && typeof child.text === 'string') {
            return {
              ...child,
              text: processTemplateVariables(child.text, variables),
            }
          }
          return { ...child }
        }),
      }
    }
    return { ...block }
  })
}

/**
 * Build the template variable map from sponsor/conference context.
 */
export function buildTemplateVariables(opts: {
  sponsorName: string
  contactNames?: string
  conference: {
    title: string
    start_date?: string
    city?: string
    organizer?: string
    domains?: string[]
    prospectus_url?: string
  }
  senderName?: string
  tierName?: string
  formatDate?: (date: string) => string
}): Record<string, string> {
  const {
    sponsorName,
    contactNames,
    conference,
    senderName,
    tierName,
    formatDate,
  } = opts

  const vars: Record<string, string> = {
    SPONSOR_NAME: sponsorName,
    CONFERENCE_TITLE: conference.title,
  }

  if (contactNames) {
    vars.CONTACT_NAMES = contactNames
  }

  if (conference.organizer) {
    vars.ORG_NAME = conference.organizer
  }

  if (conference.start_date) {
    vars.CONFERENCE_DATE = formatDate
      ? formatDate(conference.start_date)
      : conference.start_date
    // Extract year from YYYY-MM-DD
    const year = conference.start_date.slice(0, 4)
    if (year) vars.CONFERENCE_YEAR = year
  }

  if (conference.city) {
    vars.CONFERENCE_CITY = conference.city
  }

  if (conference.domains?.[0]) {
    vars.CONFERENCE_URL = `https://${conference.domains[0]}`
    vars.SPONSOR_PAGE_URL = `https://${conference.domains[0]}/sponsor`
  }

  if (conference.prospectus_url) {
    vars.PROSPECTUS_URL = conference.prospectus_url
  }

  if (senderName) {
    vars.SENDER_NAME = senderName
  }

  if (tierName) {
    vars.TIER_NAME = tierName
  }

  return vars
}
