import type { PortableTextBlock } from './types'

export const CATEGORY_LABELS: Record<string, string> = {
  'cold-outreach': 'Cold Outreach',
  'returning-sponsor': 'Returning Sponsor',
  international: 'International',
  'local-community': 'Local / Community',
  'follow-up': 'Follow-up',
  custom: 'Custom',
}

export const TEMPLATE_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  CONTACT_NAMES: 'Recipient names (e.g. "Yves and Petter")',
  SPONSOR_NAME: 'Company name of the sponsor',
  ORG_NAME: 'Organizer name (e.g. "Cloud Native Bergen")',
  CONFERENCE_TITLE: 'Full conference title',
  CONFERENCE_DATE: 'Conference date (formatted)',
  CONFERENCE_YEAR: 'Conference year (e.g. "2026")',
  CONFERENCE_CITY: 'Conference city',
  CONFERENCE_URL: 'Conference website URL',
  SPONSOR_PAGE_URL: 'Sponsor page URL',
  PROSPECTUS_URL: 'Sponsor prospectus/deck URL',
  SENDER_NAME: 'Name of the person sending the email',
  TIER_NAME: 'Sponsor tier name (if assigned)',
}

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
