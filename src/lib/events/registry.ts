import { eventBus } from './bus'
import { handleEmailNotification } from './handlers/emailNotification'
import { handleSlackNotification } from './handlers/slackNotification'
import { handleAudienceUpdate } from './handlers/audienceUpdate'
import { handleGalleryTagNotification } from './handlers/galleryTagNotification'
import { handleGalleryTagPersistNotification } from './handlers/galleryTagPersistNotification'
import { handlePersistNotification } from './handlers/persistNotification'
import { handleSpeakerTicket } from './handlers/speakerTicket'
import {
  handleMarketingSpeakerConfirmed,
  handleMarketingSponsorSigned,
} from './handlers/marketingTriggers'

let registered = false

export function registerEventHandlers(): void {
  if (registered) return
  registered = true

  eventBus.subscribe('proposal.status.changed', handleEmailNotification)
  eventBus.subscribe('proposal.status.changed', handleSlackNotification)
  eventBus.subscribe('proposal.status.changed', handleAudienceUpdate)
  eventBus.subscribe('proposal.status.changed', handlePersistNotification)
  // The bus wants `Promise<void>`; the handler now reports what it sent, for
  // the admin sweep's honest result. The bus has no use for the counts.
  eventBus.subscribe('proposal.status.changed', async (event) => {
    await handleSpeakerTicket(event)
  })
  eventBus.subscribe('proposal.status.changed', handleMarketingSpeakerConfirmed)

  // Marketing Plan Triggers (spec §5.3)
  eventBus.subscribe('sponsor.status.changed', handleMarketingSponsorSigned)

  // Register gallery speaker tagged handlers (email + in-app persistence)
  eventBus.subscribe('gallery.speaker.tagged', handleGalleryTagNotification)
  eventBus.subscribe(
    'gallery.speaker.tagged',
    handleGalleryTagPersistNotification,
  )
}

registerEventHandlers()
