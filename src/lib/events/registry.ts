import { eventBus } from './bus'
import { handleEmailNotification } from './handlers/emailNotification'
import { handleSlackNotification } from './handlers/slackNotification'
import { handleAudienceUpdate } from './handlers/audienceUpdate'
import { handleGalleryTagNotification } from './handlers/galleryTagNotification'
import { handleGalleryTagPersistNotification } from './handlers/galleryTagPersistNotification'
import { handlePersistNotification } from './handlers/persistNotification'
import {
  handlePushNotification,
  handleCoSpeakerInvitePush,
} from './handlers/pushNotification'

let registered = false

export function registerEventHandlers(): void {
  if (registered) return
  registered = true

  eventBus.subscribe('proposal.status.changed', handleEmailNotification)
  eventBus.subscribe('proposal.status.changed', handleSlackNotification)
  eventBus.subscribe('proposal.status.changed', handleAudienceUpdate)
  eventBus.subscribe('proposal.status.changed', handlePersistNotification)
  // Opt-in web push for speakers (#444). Additive to email/Slack above.
  eventBus.subscribe('proposal.status.changed', handlePushNotification)

  // Register gallery speaker tagged handlers (email + in-app persistence)
  eventBus.subscribe('gallery.speaker.tagged', handleGalleryTagNotification)
  eventBus.subscribe(
    'gallery.speaker.tagged',
    handleGalleryTagPersistNotification,
  )

  // Co-speaker invitations bypass the proposal bus and email directly; this
  // dedicated event lets us push to invitees who already have an account (#444).
  eventBus.subscribe('cospeaker.invited', handleCoSpeakerInvitePush)
}

registerEventHandlers()
