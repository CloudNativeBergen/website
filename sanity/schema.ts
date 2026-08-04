import { type SchemaTypeDefinition } from 'sanity'

import { fileAttachment, urlAttachment } from './schemaTypes/attachment'
import blockContent from './schemaTypes/blockContent'
import {
  richTextCallout,
  richTextCode,
  richTextImage,
  richTextTable,
} from './schemaTypes/richTextContent'
import conference from './schemaTypes/conference'
import conferenceBudget from './schemaTypes/conferenceBudget'
import contractTemplate from './schemaTypes/contractTemplate'
import conversation from './schemaTypes/conversation'
import conversationParticipant from './schemaTypes/conversationParticipant'
import conversationPreference from './schemaTypes/conversationPreference'
import coSpeakerInvitation from './schemaTypes/coSpeakerInvitation'
import dashboardConfig from './schemaTypes/dashboardConfig'
import domainVerification from './schemaTypes/domainVerification'
import message from './schemaTypes/message'
import dataProcessingConsent from './schemaTypes/dataProcessingConsent'
import emailSignInToken from './schemaTypes/emailSignInToken'
import emailSignInRateLimit from './schemaTypes/emailSignInRateLimit'
import imageGallery from './schemaTypes/imageGallery'
import notification from './schemaTypes/notification'
import organization from './schemaTypes/organization'
import review from './schemaTypes/review'
import schedule from './schemaTypes/schedule'
import scheduledReminderLog from './schemaTypes/scheduledReminderLog'
import speaker from './schemaTypes/speaker'
import speakerBadge from './schemaTypes/speakerBadge'
import sponsor from './schemaTypes/sponsor'
import sponsorActivity from './schemaTypes/sponsorActivity'
import sponsorEmailTemplate from './schemaTypes/sponsorEmailTemplate'
import sponsorForConference from './schemaTypes/sponsorForConference'
import sponsorTier from './schemaTypes/sponsorTier'
import talk from './schemaTypes/talk'
import topic from './schemaTypes/topic'
import travelSupport from './schemaTypes/travelSupport'
import travelExpense from './schemaTypes/travelExpense'
import volunteer from './schemaTypes/volunteer'
import workshopSignup from './schemaTypes/workshopSignup'
import workshopAnnouncement from './schemaTypes/workshopAnnouncement'
import staff from './schemaTypes/staff'
import invitationLetter from './schemaTypes/invitationLetter'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    // Tenancy (multi-tenant foundation, CaaS T1)
    organization,

    // Core content
    blockContent,
    // Homepage Rich Text vocabulary (the allowlisted escape hatch)
    richTextCode,
    richTextImage,
    richTextTable,
    richTextCallout,
    dataProcessingConsent,
    fileAttachment,
    urlAttachment,

    // Conference
    conference,
    conferenceBudget,
    domainVerification,
    schedule,
    scheduledReminderLog,
    dashboardConfig,
    imageGallery,
    volunteer,
    staff,
    notification,
    conversation,
    conversationParticipant,
    message,
    conversationPreference,

    // Topics & Talks
    talk,
    topic,
    review,
    workshopSignup,
    workshopAnnouncement,

    // Speakers
    speaker,
    speakerBadge,
    coSpeakerInvitation,
    travelSupport,
    travelExpense,

    // Sponsors
    sponsor,
    sponsorActivity,
    sponsorEmailTemplate,
    sponsorForConference,
    sponsorTier,
    contractTemplate,

    // Participants
    invitationLetter,

    // Platform-internal identity artifacts (hidden from the Studio structure —
    // see STUDIO_HIDDEN_TYPES in sanity.config.ts). Registered only so their
    // shape is typed and documented; nobody edits them by hand.
    emailSignInToken,
    emailSignInRateLimit,
  ],
}

/**
 * Document types that must NOT appear in the Studio's structure list or search.
 * These are platform-internal auth artifacts, not content.
 */
export const STUDIO_HIDDEN_TYPES: readonly string[] = [
  'emailSignInToken',
  'emailSignInRateLimit',
]
