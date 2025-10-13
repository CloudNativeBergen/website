import { type SchemaTypeDefinition } from 'sanity'

import conference from './schemaTypes/conference'
import speaker from './schemaTypes/speaker'
import schedule from './schemaTypes/schedule'
import talk from './schemaTypes/talk'
import sponsor from './schemaTypes/sponsor'
import sponsorTier from './schemaTypes/sponsorTier'
import topic from './schemaTypes/topic'
import review from './schemaTypes/review'
import coSpeakerInvitation from './schemaTypes/coSpeakerInvitation'
import travelSupport from './schemaTypes/travelSupport'
import travelExpense from './schemaTypes/travelExpense'
import volunteer from './schemaTypes/volunteer'
import workshopSignup from './schemaTypes/workshopSignup'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    conference,
    speaker,
    schedule,
    talk,
    review,
    sponsor,
    sponsorTier,
    topic,
    coSpeakerInvitation,
    travelSupport,
    travelExpense,
    volunteer,
    workshopSignup,
  ],
}
