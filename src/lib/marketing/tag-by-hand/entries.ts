import { linkedinCompanyUrl, linkedinProfileUrl } from './links'

/** One row of the "Tag by hand" list (tagging spec §5.1). */
export interface TagByHandEntry {
  name: string
  /** A clean `https://www.linkedin.com/in/…` or `/company/…` address. */
  url: string
  kind: 'person' | 'company'
}

/**
 * What the Task read projects off a LinkedIn Task's subject. Opted-out
 * speakers are already filtered out by the query, so their links never
 * leave Sanity; null for every Task that does not post on LinkedIn.
 */
export interface RawTagByHandSubject {
  people: { name: string | null; links: unknown }[] | null
  company: { name: string | null; url: string | null } | null
}

/** The list, in the subject's own order; people without a profile dropped. */
export function tagByHandEntries(
  raw: RawTagByHandSubject | null | undefined,
): TagByHandEntry[] {
  if (!raw) return []
  const people = (raw.people ?? []).flatMap((person): TagByHandEntry[] => {
    const links = Array.isArray(person?.links)
      ? person.links.filter((l): l is string => typeof l === 'string')
      : []
    const url = linkedinProfileUrl(links)
    return person?.name && url
      ? [{ name: person.name, url, kind: 'person' }]
      : []
  })
  const companyUrl = linkedinCompanyUrl(raw.company?.url)
  const company: TagByHandEntry[] =
    raw.company?.name && companyUrl
      ? [{ name: raw.company.name, url: companyUrl, kind: 'company' }]
      : []
  return [...people, ...company]
}
