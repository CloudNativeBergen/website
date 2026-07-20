import { type SchemaTypeDefinition } from 'sanity'

import { fileAttachment, urlAttachment } from './schemaTypes/attachment'
import blockContent from './schemaTypes/blockContent'
import conference from './schemaTypes/conference'
import contractTemplate from './schemaTypes/contractTemplate'
import conversation from './schemaTypes/conversation'
import conversationParticipant from './schemaTypes/conversationParticipant'
import conversationPreference from './schemaTypes/conversationPreference'
import coSpeakerInvitation from './schemaTypes/coSpeakerInvitation'
import dashboardConfig from './schemaTypes/dashboardConfig'
import message from './schemaTypes/message'
import dataProcessingConsent from './schemaTypes/dataProcessingConsent'
import imageGallery from './schemaTypes/imageGallery'
import notification from './schemaTypes/notification'
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

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    // Core content
    blockContent,
    dataProcessingConsent,
    fileAttachment,
    urlAttachment,

    // Conference
    conference,
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
  ],
}
