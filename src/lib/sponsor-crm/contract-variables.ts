import {
  processTemplateVariables,
  processPortableTextVariables,
} from '@/lib/sponsor/templates'
import { formatDate, getCurrentDateTime } from '@/lib/time'
import { formatOrgNumber, formatCurrency } from '@/lib/format'

export const CONTRACT_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  SPONSOR_NAME: 'Legal name of the sponsor company',
  SPONSOR_ORG_NUMBER: 'Organization number of the sponsor',
  SPONSOR_ADDRESS: 'Registered address of the sponsor',
  SPONSOR_WEBSITE: 'Website URL of the sponsor',
  CONTACT_NAME: 'Name of the primary contact person',
  CONTACT_EMAIL: 'Email of the primary contact person',
  TIER_NAME: 'Sponsor tier name',
  TIER_TAGLINE: 'Sponsor tier tagline/description',
  CONTRACT_VALUE:
    'Contract amount with currency, excl. VAT (e.g. 50 000 kr ex. mva)',
  CONTRACT_VALUE_NUMBER: 'Contract amount (number only)',
  CONTRACT_CURRENCY: 'Currency code (e.g. NOK)',
  CONFERENCE_TITLE: 'Full conference title',
  CONFERENCE_DATE: 'Conference date (e.g. 11 June 2026)',
  CONFERENCE_DATES: 'Conference date range (e.g. 10–11 June 2026)',
  CONFERENCE_YEAR: 'Conference year',
  CONFERENCE_CITY: 'Conference city',
  VENUE_NAME: 'Name of the conference venue',
  VENUE_ADDRESS: 'Full venue address',
  TODAY_DATE: 'Current date (e.g. 11 February 2026)',
  ORG_NAME: 'Organizer name (e.g. Cloud Native Bergen)',
  ORG_ORG_NUMBER: 'Organization number of the organizer',
  ORG_ADDRESS: 'Registered address of the organizer',
  ORG_EMAIL: 'Sponsor contact email for the organizer',
  ADDONS_LIST: 'Comma-separated list of selected add-ons',
}

export interface ContractVariableContext {
  sponsor: {
    name: string
    orgNumber?: string
    address?: string
    website?: string
  }
  contactPerson?: {
    name: string
    email: string
  }
  tier?: {
    title: string
    tagline?: string
  }
  addons?: Array<{
    title: string
  }>
  contractValue?: number
  contractCurrency?: string
  language?: 'nb' | 'en'
  conference: {
    title: string
    startDate?: string
    endDate?: string
    city?: string
    organizer?: string
    organizerOrgNumber?: string
    organizerAddress?: string
    venueName?: string
    venueAddress?: string
    sponsorEmail?: string
    logoBright?: string
  }
}

export function buildContractVariables(
  ctx: ContractVariableContext,
): Record<string, string> {
  const vars: Record<string, string> = {
    SPONSOR_NAME: ctx.sponsor.name,
    CONFERENCE_TITLE: ctx.conference.title,
    TODAY_DATE: formatDate(getCurrentDateTime()),
  }

  if (ctx.sponsor.orgNumber) {
    vars.SPONSOR_ORG_NUMBER = formatOrgNumber(ctx.sponsor.orgNumber)
  }
  if (ctx.sponsor.address) {
    vars.SPONSOR_ADDRESS = ctx.sponsor.address
  }
  if (ctx.sponsor.website) {
    vars.SPONSOR_WEBSITE = ctx.sponsor.website
  }

  if (ctx.contactPerson) {
    vars.CONTACT_NAME = ctx.contactPerson.name
    vars.CONTACT_EMAIL = ctx.contactPerson.email
  }

  if (ctx.tier) {
    vars.TIER_NAME = ctx.tier.title
    if (ctx.tier.tagline) {
      vars.TIER_TAGLINE = ctx.tier.tagline
    }
  }

  if (ctx.addons && ctx.addons.length > 0) {
    vars.ADDONS_LIST = ctx.addons.map((a) => a.title).join(', ')
  }

  const currency = ctx.contractCurrency || 'NOK'
  vars.CONTRACT_CURRENCY = currency

  if (ctx.contractValue != null) {
    const vatSuffix = ctx.language === 'en' ? 'excl. VAT' : 'ex. mva'
    vars.CONTRACT_VALUE = `${formatCurrency(ctx.contractValue, currency)} ${vatSuffix}`
    vars.CONTRACT_VALUE_NUMBER = String(ctx.contractValue)
  }

  if (ctx.conference.startDate) {
    vars.CONFERENCE_DATE = formatDate(ctx.conference.startDate)
    vars.CONFERENCE_YEAR = ctx.conference.startDate.slice(0, 4)

    if (ctx.conference.endDate) {
      const start = new Date(ctx.conference.startDate)
      const end = new Date(ctx.conference.endDate)
      if (start.getMonth() === end.getMonth()) {
        vars.CONFERENCE_DATES = `${start.getDate()}\u2013${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
      } else {
        vars.CONFERENCE_DATES = `${formatDate(ctx.conference.startDate)} \u2013 ${formatDate(ctx.conference.endDate)}`
      }
    } else {
      vars.CONFERENCE_DATES = vars.CONFERENCE_DATE
    }
  }
  if (ctx.conference.city) {
    vars.CONFERENCE_CITY = ctx.conference.city
  }
  if (ctx.conference.organizer) {
    vars.ORG_NAME = ctx.conference.organizer
  }
  if (ctx.conference.organizerOrgNumber) {
    vars.ORG_ORG_NUMBER = formatOrgNumber(ctx.conference.organizerOrgNumber)
  }
  if (ctx.conference.organizerAddress) {
    vars.ORG_ADDRESS = ctx.conference.organizerAddress
  }
  if (ctx.conference.sponsorEmail) {
    vars.ORG_EMAIL = ctx.conference.sponsorEmail
  }
  if (ctx.conference.venueName) {
    vars.VENUE_NAME = ctx.conference.venueName
  }
  if (ctx.conference.venueAddress) {
    vars.VENUE_ADDRESS = ctx.conference.venueAddress
  }

  return vars
}

export { processTemplateVariables, processPortableTextVariables }
