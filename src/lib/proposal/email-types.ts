/**
 * Shared types for email templates and notifications
 * This ensures type consistency across the email system
 */

import { Action } from './types'

export interface BaseEmailTemplateProps {
  speakerName: string
  proposalTitle: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  comment?: string
  socialLinks?: string[]
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
  socialLinks?: string[]
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

/**
 * Template props factory - ensures consistent prop mapping
 */
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
    ...(confirmUrl && { confirmUrl }),
  }
}
