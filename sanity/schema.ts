import { type SchemaTypeDefinition } from 'sanity'

import { fileAttachment, urlAttachment } from './schemaTypes/attachment'
import blockContent from './schemaTypes/blockContent'
import conference from './schemaTypes/conference'
import coSpeakerInvitation from './schemaTypes/coSpeakerInvitation'
import dashboardConfig from './schemaTypes/dashboardConfig'
import imageGallery from './schemaTypes/imageGallery'
import review from './schemaTypes/review'
import schedule from './schemaTypes/schedule'
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

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    // Core content
    blockContent,
    fileAttachment,
    urlAttachment,

    // Conference
    conference,
    schedule,
    dashboardConfig,
    imageGallery,
    volunteer,

    // Topics & Talks
    talk,
    topic,
    review,
    workshopSignup,

    // Speakers
    speaker,
    speakerBadge,
    coSpeakerInvitation,
    travelSupport,
    travelExpense,

    // Sponsors
    sponsor,
    sponsorTier,
    sponsorForConference,
    sponsorActivity,
    sponsorEmailTemplate,
  ],
}
