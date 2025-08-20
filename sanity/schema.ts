import { type SchemaTypeDefinition } from 'sanity'

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

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
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
  ],
}
