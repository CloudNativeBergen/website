import { Action } from '../types'

export interface BaseEmailTemplateProps {
  speakerName: string
  proposalTitle: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  comment?: string
  socialLinks?: string[]
  /**
   * Per-tenant brand accent (THEMING L1). The conference theme's primary hex,
   * resolved by the sender via `emailBrandColor`; absent falls back to the house
   * blue inside `BaseEmailTemplate`.
   */
  brandColor?: string
}

export interface ProposalAcceptTemplateProps extends BaseEmailTemplateProps {
  confirmUrl: string
}

export type ProposalRejectTemplateProps = BaseEmailTemplateProps

export interface NotificationEventData {
  location: string
  date: string
  name: string
  url: string
  organizer: string
  socialLinks?: string[]
  contactEmail?: string
  /** Conference theme primary hex (THEMING L1); see `emailBrandColor`. */
  brandColor?: string
}

export interface NotificationParams {
  action: Action
  speaker: {
    name: string
    email: string
  }
  proposal: {
    _id: string
    title: string
  }
  event: NotificationEventData
  comment: string
}

export function createTemplateProps(
  params: NotificationParams,
  confirmUrl?: string,
): BaseEmailTemplateProps & { confirmUrl?: string } {
  return {
    speakerName: params.speaker.name,
    proposalTitle: params.proposal.title,
    eventName: params.event.name,
    eventLocation: params.event.location,
    eventDate: params.event.date,
    eventUrl: params.event.url,
    socialLinks: params.event.socialLinks || [],
    comment: params.comment,
    ...(params.event.brandColor && { brandColor: params.event.brandColor }),
    ...(confirmUrl && { confirmUrl }),
  }
}
