import { eventBus } from './bus'
import { handleEmailNotification } from './handlers/emailNotification'
import { handleSlackNotification } from './handlers/slackNotification'
import { handleAudienceUpdate } from './handlers/audienceUpdate'

/**
 * Register all event handlers with the event bus
 * Call this once during application initialization
 */
export function registerEventHandlers(): void {
  // Register proposal status change handlers
  eventBus.subscribe('proposal.status.changed', handleEmailNotification)
  eventBus.subscribe('proposal.status.changed', handleSlackNotification)
  eventBus.subscribe('proposal.status.changed', handleAudienceUpdate)

  console.log('Event handlers registered successfully')
}

// Auto-register handlers when this module is imported
registerEventHandlers()
