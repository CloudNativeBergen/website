import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { SpeakerWithTalks } from '@/lib/speaker/types'

/**
 * Pure, framework-agnostic helpers for deriving promotional display data from a
 * speaker. Shared by {@link SpeakerPromotionCard} and the front-page
 * FeaturedSpeakers shelf so the company/role parsing lives in a single place.
 */

export interface ComputedSpeakerData {
  talks: SpeakerWithTalks['talks']
  expertise: string[]
  company: string | undefined
  talkCount: number
  hasWorkshop: boolean
}

/**
 * Collects the distinct human-readable format labels across a speaker's talks
 * (e.g. "Presentation (45 min)", "Workshop (2 hours)").
 */
export const deriveExpertise = (talks: SpeakerWithTalks['talks']): string[] => {
  if (!talks?.length) return []

  const expertise = new Set<string>()
  talks.forEach((talk) => {
    if (talk.format) {
      const formatLabel = formatConfig[talk.format as Format]?.label
      if (formatLabel) {
        expertise.add(formatLabel)
      }
    }
  })
  return Array.from(expertise)
}

/**
 * Extracts a company name from a free-form speaker title such as
 * "Senior Engineer at Acme" or "Developer @ Acme | DevRel".
 */
export const deriveCompany = (
  title: string | undefined,
): string | undefined => {
  if (!title) return undefined

  let company: string | undefined

  if (title.includes(' at ')) {
    company = title.split(' at ')[1].trim()
  } else if (title.includes('@')) {
    company = title.split('@')[1].trim()
  }

  if (!company) return undefined

  const separators = ['|', ',', '•', '·', '-', '–', '—', '/', '\\']
  for (const separator of separators) {
    if (company.includes(separator)) {
      company = company.split(separator)[0].trim()
      break
    }
  }

  return company
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Removes the trailing "at Company" / "@ Company" fragment from a title so the
 * role can be shown without duplicating the company shown elsewhere.
 */
export const stripCompanyFromTitle = (
  title: string | undefined,
  company: string | undefined,
): string | undefined => {
  if (!title || !company) return title

  const pattern = new RegExp(`\\s+(at|@)\\s+${escapeRegex(company)}\\s*$`, 'i')
  if (!pattern.test(title)) return title

  return title.replace(pattern, '').trim()
}

/**
 * Computes the derived promotional data (talks, expertise, company, workshop
 * signal) for a speaker in a single pass.
 */
export function computeSpeakerData(
  speaker: SpeakerWithTalks,
): ComputedSpeakerData {
  const talks = speaker.talks || []
  const expertise = deriveExpertise(talks)
  const company = deriveCompany(speaker.title)
  const talkCount = talks.length
  const hasWorkshop = talks.some(
    (talk) =>
      talk.format === Format.workshop_120 ||
      talk.format === Format.workshop_240,
  )

  return {
    talks,
    expertise,
    company,
    talkCount,
    hasWorkshop,
  }
}
