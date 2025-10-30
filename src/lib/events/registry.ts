import { eventBus } from './bus'
import { handleEmailNotification } from './handlers/emailNotification'
import { handleSlackNotification } from './handlers/slackNotification'
import { handleAudienceUpdate } from './handlers/audienceUpdate'
import { handleGalleryTagNotification } from './handlers/galleryTagNotification'

export function registerEventHandlers(): void {
  eventBus.subscribe('proposal.status.changed', handleEmailNotification)
  eventBus.subscribe('proposal.status.changed', handleSlackNotification)
  eventBus.subscribe('proposal.status.changed', handleAudienceUpdate)

  // Register gallery speaker tagged handler
  eventBus.subscribe('gallery.speaker.tagged', handleGalleryTagNotification)

  console.log('Event handlers registered successfully')
}

registerEventHandlers()
