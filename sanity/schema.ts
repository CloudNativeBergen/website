import { type SchemaTypeDefinition } from 'sanity'

import { fileAttachment, urlAttachment } from './schemaTypes/attachment'
import conference from './schemaTypes/conference'
import coSpeakerInvitation from './schemaTypes/coSpeakerInvitation'
import imageGallery from './schemaTypes/imageGallery'
import review from './schemaTypes/review'
import schedule from './schemaTypes/schedule'
import speaker from './schemaTypes/speaker'
import sponsor from './schemaTypes/sponsor'
import sponsorTier from './schemaTypes/sponsorTier'
import talk from './schemaTypes/talk'
import topic from './schemaTypes/topic'
import travelSupport from './schemaTypes/travelSupport'
import travelExpense from './schemaTypes/travelExpense'
import volunteer from './schemaTypes/volunteer'
import workshopSignup from './schemaTypes/workshopSignup'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    fileAttachment,
    urlAttachment,
    conference,
    coSpeakerInvitation,
    imageGallery,
    review,
    schedule,
    speaker,
    sponsor,
    sponsorTier,
    talk,
    topic,
    travelSupport,
    travelExpense,
    volunteer,
    workshopSignup,
  ],
}
