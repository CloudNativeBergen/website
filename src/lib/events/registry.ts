import { eventBus } from './bus'
import { handleEmailNotification } from './handlers/emailNotification'
import { handleSlackNotification } from './handlers/slackNotification'
import { handleAudienceUpdate } from './handlers/audienceUpdate'
import { handleGalleryTagNotification } from './handlers/galleryTagNotification'
import { handleSpeakerTicket } from './handlers/speakerTicket'

let registered = false

export function registerEventHandlers(): void {
  if (registered) return
  registered = true

  eventBus.subscribe('proposal.status.changed', handleEmailNotification)
  eventBus.subscribe('proposal.status.changed', handleSlackNotification)
  eventBus.subscribe('proposal.status.changed', handleAudienceUpdate)
  eventBus.subscribe('proposal.status.changed', handleSpeakerTicket)

  // Register gallery speaker tagged handler
  eventBus.subscribe('gallery.speaker.tagged', handleGalleryTagNotification)
}

registerEventHandlers()
