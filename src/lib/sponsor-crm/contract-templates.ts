import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import type { PortableTextBlock } from '@/lib/sponsor/types'
import { nanoid } from 'nanoid'
import { mergeConference } from '@/lib/conference/merge'

export interface ContractSection {
  _key: string
  heading: string
  body?: PortableTextBlock[]
}

export interface ContractTemplate {
  _id: string
  _createdAt: string
  _updatedAt: string
  title: string
  conference: {
    _id: string
    title: string
  }
  tier?: {
    _id: string
    title: string
  }
  language: 'nb' | 'en'
  currency?: string
  sections: ContractSection[]
  headerText?: string
  footerText?: string
  terms?: PortableTextBlock[]
  isDefault: boolean
  isActive: boolean
}

export interface ContractTemplateInput {
  title: string
  conference: string
  tier?: string
  language: 'nb' | 'en'
  currency?: string
  sections: Array<{
    _key?: string
    heading: string
    body?: PortableTextBlock[]
  }>
  headerText?: string
  footerText?: string
  terms?: PortableTextBlock[]
  isDefault?: boolean
  isActive?: boolean
}

const CONTRACT_TEMPLATE_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  title,
  conference->{
    _id,
    title,
    domains,
    organization
  },
  tier->{
    _id,
    title
  },
  language,
  currency,
  sections[]{
    _key,
    heading,
    body
  },
  headerText,
  footerText,
  terms,
  isDefault,
  isActive
`

/**
 * The conference title is a label: take D1's when the tenant is flagged
 * (#1997), and hand back only `{ _id, title }` as before.
 */
async function withMergedTitle<T extends ContractTemplate | null | undefined>(
  t: T,
): Promise<T> {
  if (!t?.conference) return t
  const { _id, title } = await mergeConference(
    t.conference as ContractTemplate['conference'] & {
      domains?: string[]
      organization?: { _ref: string }
    },
  )
  return { ...t, conference: { _id, title } }
}

const withMergedTitles = (ts: ContractTemplate[] | null | undefined) =>
  ts ? Promise.all(ts.map(withMergedTitle)) : undefined

export async function listContractTemplates(
  conferenceId: string,
): Promise<{ templates?: ContractTemplate[]; error?: Error }> {
  try {
    const templates = await withMergedTitles(
      await clientRead.fetch<ContractTemplate[]>(
        `*[_type == "contractTemplate" && conference._ref == $conferenceId] | order(title asc){${CONTRACT_TEMPLATE_FIELDS}}`,
        { conferenceId },
      ),
    )
    return { templates }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getContractTemplate(id: string): Promise<{
  template?: ContractTemplate
  error?: Error
}> {
  try {
    const template = await withMergedTitle(
      await clientRead.fetch<ContractTemplate>(
        // groq-global-scoped: point read by id; every caller asserts
        // requireDocumentInCurrentConference(id, 'contractTemplate') first.
        `*[_type == "contractTemplate" && _id == $id][0]{${CONTRACT_TEMPLATE_FIELDS}}`,
        { id },
      ),
    )
    if (!template) {
      return { error: new Error('Contract template not found') }
    }
    return { template }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function createContractTemplate(
  data: ContractTemplateInput,
): Promise<{ template?: ContractTemplate; error?: Error }> {
  try {
    const doc = {
      _type: 'contractTemplate',
      title: data.title,
      conference: { _type: 'reference', _ref: data.conference },
      tier: data.tier ? { _type: 'reference', _ref: data.tier } : undefined,
      language: data.language,
      currency: data.currency,
      sections: data.sections.map((s) => ({
        _key: nanoid(),
        heading: s.heading,
        body: s.body,
      })),
      headerText: data.headerText,
      footerText: data.footerText,
      terms: data.terms,
      isDefault: data.isDefault ?? false,
      isActive: data.isActive ?? true,
    }

    const created = await clientWrite.create(doc)

    const template = await withMergedTitle(
      await clientRead.fetch<ContractTemplate>(
        // groq-global-scoped: re-read of the document just created; the router
        // checks `data.conference` against the current conference.
        `*[_type == "contractTemplate" && _id == $id][0]{${CONTRACT_TEMPLATE_FIELDS}}`,
        { id: created._id },
      ),
    )

    if (!template) {
      return { error: new Error('Failed to fetch created contract template') }
    }

    return { template }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function updateContractTemplate(
  id: string,
  data: Partial<ContractTemplateInput>,
): Promise<{ template?: ContractTemplate; error?: Error }> {
  try {
    const updates: Record<string, unknown> = {}
    const fieldsToUnset: string[] = []

    if (data.title !== undefined) updates.title = data.title
    if (data.tier !== undefined) {
      if (data.tier) {
        updates.tier = { _type: 'reference', _ref: data.tier }
      } else {
        fieldsToUnset.push('tier')
      }
    }
    if (data.language !== undefined) updates.language = data.language
    if (data.currency !== undefined) updates.currency = data.currency
    if (data.sections !== undefined) {
      updates.sections = data.sections.map((s) => ({
        _key: s._key || nanoid(),
        heading: s.heading,
        body: s.body,
      }))
    }
    if (data.headerText !== undefined) {
      if (data.headerText) {
        updates.headerText = data.headerText
      } else {
        fieldsToUnset.push('headerText')
      }
    }
    if (data.footerText !== undefined) {
      if (data.footerText) {
        updates.footerText = data.footerText
      } else {
        fieldsToUnset.push('footerText')
      }
    }
    if (data.terms !== undefined) {
      if (data.terms && data.terms.length > 0) {
        updates.terms = data.terms
      } else {
        fieldsToUnset.push('terms')
      }
    }
    if (data.isDefault !== undefined) updates.isDefault = data.isDefault
    if (data.isActive !== undefined) updates.isActive = data.isActive

    let patch = clientWrite.patch(id)
    if (Object.keys(updates).length > 0) {
      patch = patch.set(updates)
    }
    if (fieldsToUnset.length > 0) {
      patch = patch.unset(fieldsToUnset)
    }
    await patch.commit()

    const template = await withMergedTitle(
      await clientRead.fetch<ContractTemplate>(
        // groq-global-scoped: re-read after the patch; the router asserts
        // requireDocumentInCurrentConference(id, 'contractTemplate') first.
        `*[_type == "contractTemplate" && _id == $id][0]{${CONTRACT_TEMPLATE_FIELDS}}`,
        { id },
      ),
    )

    if (!template) {
      return { error: new Error('Contract template not found') }
    }

    return { template }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteContractTemplate(
  id: string,
): Promise<{ error?: Error }> {
  try {
    await clientWrite.delete(id)
    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

export async function findBestContractTemplate(
  conferenceId: string,
  tierId?: string,
  language?: 'nb' | 'en',
): Promise<{ template?: ContractTemplate; error?: Error }> {
  try {
    const templates = await withMergedTitles(
      await clientRead.fetch<ContractTemplate[]>(
        `*[_type == "contractTemplate" && conference._ref == $conferenceId && isActive == true] | order(isDefault desc){${CONTRACT_TEMPLATE_FIELDS}}`,
        { conferenceId },
      ),
    )

    if (!templates || templates.length === 0) {
      return { error: new Error('No active contract templates found') }
    }

    let best: ContractTemplate | undefined
    let bestScore = -1

    for (const t of templates) {
      let score = 0
      if (tierId && t.tier?._id === tierId) score += 4
      if (language && t.language === language) score += 2
      if (t.isDefault) score += 1
      if (score > bestScore) {
        bestScore = score
        best = t
      }
    }

    return { template: best || templates[0] }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getTermsForConference(conferenceId: string): Promise<{
  terms?: PortableTextBlock[]
  conferenceName?: string
  error?: Error
}> {
  try {
    const result = await clientRead.fetch<{
      terms: PortableTextBlock[]
      conference: {
        _id: string
        title: string
        domains?: string[]
        organization?: { _ref: string }
      } | null
    } | null>(
      `*[_type == "contractTemplate" && conference._ref == $conferenceId && isActive == true && defined(terms)] | order(isDefault desc)[0]{
        terms,
        conference->{ _id, title, domains, organization }
      }`,
      { conferenceId },
    )

    if (!result || !result.terms) {
      return { error: new Error('No terms found for this conference') }
    }

    // Label only: D1's title when the tenant is flagged (#1997).
    const conference = result.conference
      ? await mergeConference(result.conference)
      : null
    return { terms: result.terms, conferenceName: conference?.title }
  } catch (error) {
    return { error: error as Error }
  }
}
