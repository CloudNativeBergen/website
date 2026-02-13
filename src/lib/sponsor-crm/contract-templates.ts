import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import type { PortableTextBlock } from '@/lib/sponsor/types'

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
    title
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

export async function listContractTemplates(
  conferenceId: string,
): Promise<{ templates?: ContractTemplate[]; error?: Error }> {
  try {
    const templates = await clientRead.fetch<ContractTemplate[]>(
      `*[_type == "contractTemplate" && conference._ref == $conferenceId] | order(title asc){${CONTRACT_TEMPLATE_FIELDS}}`,
      { conferenceId },
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
    const template = await clientRead.fetch<ContractTemplate>(
      `*[_type == "contractTemplate" && _id == $id][0]{${CONTRACT_TEMPLATE_FIELDS}}`,
      { id },
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
    let keyCounter = 0
    const doc = {
      _type: 'contractTemplate',
      title: data.title,
      conference: { _type: 'reference', _ref: data.conference },
      tier: data.tier ? { _type: 'reference', _ref: data.tier } : undefined,
      language: data.language,
      currency: data.currency,
      sections: data.sections.map((s) => ({
        _key: `section-${++keyCounter}`,
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

    const template = await clientRead.fetch<ContractTemplate>(
      `*[_type == "contractTemplate" && _id == $id][0]{${CONTRACT_TEMPLATE_FIELDS}}`,
      { id: created._id },
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

    if (data.title !== undefined) updates.title = data.title
    if (data.tier !== undefined) {
      updates.tier = data.tier ? { _type: 'reference', _ref: data.tier } : null
    }
    if (data.language !== undefined) updates.language = data.language
    if (data.currency !== undefined) updates.currency = data.currency
    if (data.sections !== undefined) {
      // Preserve existing keys when provided, generate unique keys for new sections
      updates.sections = data.sections.map((s, index) => ({
        _key: s._key || `section-${Date.now()}-${index}`,
        heading: s.heading,
        body: s.body,
      }))
    }
    if (data.headerText !== undefined) updates.headerText = data.headerText
    if (data.footerText !== undefined) updates.footerText = data.footerText
    if (data.terms !== undefined) updates.terms = data.terms
    if (data.isDefault !== undefined) updates.isDefault = data.isDefault
    if (data.isActive !== undefined) updates.isActive = data.isActive

    await clientWrite.patch(id).set(updates).commit()

    const template = await clientRead.fetch<ContractTemplate>(
      `*[_type == "contractTemplate" && _id == $id][0]{${CONTRACT_TEMPLATE_FIELDS}}`,
      { id },
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
    const templates = await clientRead.fetch<ContractTemplate[]>(
      `*[_type == "contractTemplate" && conference._ref == $conferenceId && isActive == true] | order(isDefault desc){${CONTRACT_TEMPLATE_FIELDS}}`,
      { conferenceId },
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
      conference: { title: string }
    } | null>(
      `*[_type == "contractTemplate" && conference._ref == $conferenceId && isActive == true && defined(terms)] | order(isDefault desc)[0]{
        terms,
        conference->{ title }
      }`,
      { conferenceId },
    )

    if (!result || !result.terms) {
      return { error: new Error('No terms found for this conference') }
    }

    return { terms: result.terms, conferenceName: result.conference?.title }
  } catch (error) {
    return { error: error as Error }
  }
}
