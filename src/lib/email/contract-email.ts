import React from 'react'
import { BaseEmailTemplate } from '@/components/email/BaseEmailTemplate'
import { getSponsorEmailTemplateBySlug } from '@/lib/sponsor/sanity'
import {
  processTemplateVariables,
  processPortableTextVariables,
} from '@/lib/sponsor/templates'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import { PortableTextBlock } from '@portabletext/types'
import { formatConferenceDateLong } from '@/lib/time'

export const CONTRACT_EMAIL_SLUGS = {
  SENT: 'contract-sent',
  REMINDER: 'contract-reminder',
  SIGNED: 'contract-signed',
} as const

interface ContractEmailButton {
  text: string
  href: string
}

interface ConferenceInfo {
  title: string
  city?: string
  startDate?: string
  domains?: string[]
  organizer?: string
  sponsorEmail?: string
  socialLinks?: string[]
}

export interface ContractEmailVariables {
  sponsorName: string
  signerName?: string
  signerEmail?: string
  tierName?: string
  contractValue?: string
  conference: ConferenceInfo
}

interface ContractEmailResult {
  subject: string
  react: React.ReactElement
}

const TITLE_COLORS: Record<string, string> = {
  [CONTRACT_EMAIL_SLUGS.SENT]: '#1D4ED8',
  [CONTRACT_EMAIL_SLUGS.REMINDER]: '#1D4ED8',
  [CONTRACT_EMAIL_SLUGS.SIGNED]: '#059669',
}

function buildVariables(vars: ContractEmailVariables): Record<string, string> {
  const v: Record<string, string> = {
    SPONSOR_NAME: vars.sponsorName,
    CONFERENCE_TITLE: vars.conference.title,
    EVENT_LOCATION: vars.conference.city || 'Norway',
  }

  if (vars.signerName) v.SIGNER_NAME = vars.signerName
  if (vars.signerEmail) v.SIGNER_EMAIL = vars.signerEmail
  if (vars.tierName) v.TIER_NAME = vars.tierName
  if (vars.contractValue) v.CONTRACT_VALUE = vars.contractValue

  if (vars.conference.organizer) v.ORG_NAME = vars.conference.organizer
  if (vars.conference.city) v.CONFERENCE_CITY = vars.conference.city

  if (vars.conference.startDate) {
    v.EVENT_DATE = formatConferenceDateLong(vars.conference.startDate)
    v.CONFERENCE_DATE = v.EVENT_DATE
    const year = vars.conference.startDate.slice(0, 4)
    if (year) v.CONFERENCE_YEAR = year
  }

  if (vars.conference.domains?.[0]) {
    v.EVENT_URL = `https://${vars.conference.domains[0]}`
    v.CONFERENCE_URL = v.EVENT_URL
    v.SPONSOR_PAGE_URL = `${v.EVENT_URL}/sponsor`
  }

  return v
}

function renderButton(button: ContractEmailButton): string {
  return `<div style="text-align: center; margin: 28px 0;">
    <a href="${button.href}" style="display: inline-block; padding: 14px 32px; background-color: #1D4ED8; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${button.text}</a>
  </div>`
}

export async function renderContractEmail(
  slug: string,
  vars: ContractEmailVariables,
  options?: {
    button?: ContractEmailButton
    extraVariables?: Record<string, string>
  },
): Promise<ContractEmailResult | null> {
  const { template, error } = await getSponsorEmailTemplateBySlug(slug)

  if (error || !template) {
    console.error(
      `[contract-email] Template "${slug}" not found:`,
      error?.message,
    )
    return null
  }

  const variables = { ...buildVariables(vars), ...options?.extraVariables }
  const subject = processTemplateVariables(template.subject, variables)

  let htmlContent = ''
  if (template.body && template.body.length > 0) {
    const processedBody = processPortableTextVariables(template.body, variables)
    htmlContent = portableTextToHTML(processedBody as PortableTextBlock[])
  }

  if (options?.button) {
    htmlContent += renderButton(options.button)
  }

  const titleColor = TITLE_COLORS[slug] || '#334155'
  const eventUrl = variables.EVENT_URL || 'https://cloudnativeday.no'
  const eventDate = variables.EVENT_DATE || ''
  const eventLocation = variables.EVENT_LOCATION || 'Norway'

  const element = React.createElement(BaseEmailTemplate, {
    title: subject,
    titleColor,
    eventName: vars.conference.title,
    eventLocation,
    eventDate,
    eventUrl,
    socialLinks: vars.conference.socialLinks || [],
    customContent: {
      heading: subject,
      body: React.createElement('div', {
        dangerouslySetInnerHTML: { __html: htmlContent },
      }),
    },
  })

  return { subject, react: element }
}
