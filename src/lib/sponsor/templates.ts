import type {
  PortableTextBlock,
  TemplateCategory,
  TemplateLanguage,
  SponsorEmailTemplate,
} from './types'

export const CATEGORY_LABELS: Record<string, string> = {
  'cold-outreach': 'Cold Outreach',
  'returning-sponsor': 'Returning Sponsor',
  international: 'International',
  'local-community': 'Local / Community',
  'follow-up': 'Follow-up',
  custom: 'Custom',
}

export const LANGUAGE_LABELS: Record<string, string> = {
  no: 'Norwegian',
  en: 'English',
}

export const LANGUAGE_FLAGS: Record<string, string> = {
  no: '🇳🇴',
  en: '🇬🇧',
}

export const TEMPLATE_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  CONTACT_NAMES: 'Recipient names (e.g. "Yves and Petter")',
  SPONSOR_NAME: 'Company name of the sponsor',
  ORG_NAME: 'Organizer name (e.g. "Cloud Native Bergen")',
  CONFERENCE_TITLE: 'Full conference title',
  CONFERENCE_DATE: 'Conference date (DD/MM-YY)',
  CONFERENCE_YEAR: 'Conference year (e.g. "2026")',
  CONFERENCE_CITY: 'Conference city',
  CONFERENCE_URL: 'Conference website URL',
  SPONSOR_PAGE_URL: 'Sponsor page URL',
  PROSPECTUS_URL: 'Sponsor prospectus/deck URL',
  SENDER_NAME: 'Name of the person sending the email',
  TIER_NAME: 'Sponsor tier name (if assigned)',
}

const URL_VARIABLE_KEYS = new Set([
  'CONFERENCE_URL',
  'SPONSOR_PAGE_URL',
  'PROSPECTUS_URL',
])

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
 * Split text by known URL values, returning segments tagged as URL or plain.
 */
function splitTextByUrls(
  text: string,
  urls: string[],
): Array<{ text: string; isUrl: boolean }> {
  if (!urls.length) return [{ text, isUrl: false }]

  const escaped = urls
    .sort((a, b) => b.length - a.length)
    .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'g')

  const segments: Array<{ text: string; isUrl: boolean }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isUrl: false })
    }
    segments.push({ text: match[0], isUrl: true })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isUrl: false })
  }

  return segments.length > 0 ? segments : [{ text, isUrl: false }]
}

/**
 * Deep-clone PortableText blocks and replace {{{VAR}}} placeholders
 * in all text spans.  URL-typed variables are automatically converted
 * to clickable link annotations, and markDef hrefs are also expanded.
 */
export function processPortableTextVariables(
  blocks: PortableTextBlock[],
  variables: Record<string, string>,
): PortableTextBlock[] {
  const urlValues: string[] = []
  for (const [key, value] of Object.entries(variables)) {
    if (URL_VARIABLE_KEYS.has(key) && value) {
      urlValues.push(value)
    }
  }

  let keySeq = 0
  const genKey = () => `tpl-${++keySeq}`

  return blocks.map((block) => {
    if (block._type === 'block' && Array.isArray(block.children)) {
      const processedMarkDefs: Array<Record<string, unknown>> = (
        block.markDefs || []
      ).map((markDef) => {
        if (markDef._type === 'link' && typeof markDef.href === 'string') {
          return {
            ...markDef,
            href: processTemplateVariables(markDef.href, variables),
          }
        }
        return { ...markDef }
      })

      const linkMarkKeys = new Set(
        processedMarkDefs
          .filter((md) => md._type === 'link')
          .map((md) => md._key),
      )

      const newMarkDefs = [...processedMarkDefs]
      const newChildren: NonNullable<PortableTextBlock['children']> = []

      for (const child of block.children) {
        if (child._type === 'span' && typeof child.text === 'string') {
          const expandedText = processTemplateVariables(child.text, variables)

          const hasLinkMark = child.marks?.some((m: string) =>
            linkMarkKeys.has(m),
          )

          if (!hasLinkMark && urlValues.length > 0) {
            const segments = splitTextByUrls(expandedText, urlValues)
            if (segments.some((s) => s.isUrl)) {
              for (const segment of segments) {
                if (segment.isUrl) {
                  const linkKey = genKey()
                  newMarkDefs.push({
                    _key: linkKey,
                    _type: 'link',
                    href: segment.text,
                  })
                  newChildren.push({
                    _type: 'span',
                    _key: genKey(),
                    text: segment.text,
                    marks: [...(child.marks || []), linkKey],
                  })
                } else {
                  newChildren.push({
                    _type: 'span',
                    _key: genKey(),
                    text: segment.text,
                    marks: child.marks || [],
                  })
                }
              }
              continue
            }
          }

          newChildren.push({ ...child, text: expandedText })
        } else {
          newChildren.push({ ...child })
        }
      }

      return {
        ...block,
        markDefs: newMarkDefs,
        children: newChildren,
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
    startDate?: string
    city?: string
    organizer?: string
    domains?: string[]
    prospectusUrl?: string
  }
  senderName?: string
  tierName?: string
}): Record<string, string> {
  const { sponsorName, contactNames, conference, senderName, tierName } = opts

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

  if (conference.startDate) {
    // Format as DD/MM-YY from YYYY-MM-DD
    const [y, m, d] = conference.startDate.split('-')
    if (y && m && d) {
      vars.CONFERENCE_DATE = `${d}/${m}-${y.slice(2)}`
    }
    const year = conference.startDate.slice(0, 4)
    if (year) vars.CONFERENCE_YEAR = year
  }

  if (conference.city) {
    vars.CONFERENCE_CITY = conference.city
  }

  if (conference.domains?.[0]) {
    vars.CONFERENCE_URL = `https://${conference.domains[0]}`
    vars.SPONSOR_PAGE_URL = `https://${conference.domains[0]}/sponsor`
  }

  if (conference.prospectusUrl) {
    vars.PROSPECTUS_URL = conference.prospectusUrl
  }

  if (senderName) {
    vars.SENDER_NAME = senderName
  }

  if (tierName) {
    vars.TIER_NAME = tierName
  }

  return vars
}

/**
 * Infer the best template category from CRM context.
 * Priority: explicit tags > pipeline status > default.
 */
export function suggestTemplateCategory(context: {
  tags?: string[]
  status?: string
}): TemplateCategory {
  const { tags, status } = context

  if (tags?.includes('returning-sponsor')) return 'returning-sponsor'
  if (tags?.includes('cold-outreach')) return 'cold-outreach'
  if (tags?.includes('needs-follow-up')) return 'follow-up'

  if (status === 'contacted' || status === 'negotiating') return 'follow-up'

  return 'cold-outreach'
}

/**
 * Infer the best template language from CRM context.
 * Norwegian org number or NOK currency → Norwegian, otherwise English.
 */
export function suggestTemplateLanguage(context: {
  currency?: string
  orgNumber?: string
  website?: string
}): TemplateLanguage {
  const { currency, orgNumber, website } = context

  if (orgNumber) return 'no'
  if (currency === 'NOK') return 'no'
  if (currency && currency !== 'NOK') return 'en'
  if (website) {
    try {
      const hostname = new URL(website).hostname
      if (hostname.endsWith('.no')) return 'no'
    } catch {
      // ignore invalid URLs
    }
  }

  return 'no'
}

/**
 * Find the best template matching the suggested category and language.
 * Scoring: +4 category match, +2 language match, +1 is_default.
 * Returns the highest-scoring template, or undefined if none exist.
 */
export function findBestTemplate(
  templates: SponsorEmailTemplate[],
  category: TemplateCategory,
  language: TemplateLanguage,
): SponsorEmailTemplate | undefined {
  if (templates.length === 0) return undefined

  let best: SponsorEmailTemplate | undefined
  let bestScore = -1

  for (const t of templates) {
    let score = 0
    if (t.category === category) score += 4
    if (t.language === language) score += 2
    if (t.isDefault) score += 1
    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }

  return best
}
