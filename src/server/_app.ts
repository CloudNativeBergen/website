import { router } from './trpc'
import { badgeRouter } from './routers/badge'
import { sponsorRouter } from './routers/sponsor'
import { featuredRouter } from './routers/featured'
import { speakerRouter } from './routers/speaker'
import { proposalRouter } from './routers/proposal'
import { travelSupportRouter } from './routers/travelSupport'
import { ticketsRouter } from './routers/tickets'
import { volunteerRouter } from './routers/volunteer'
import { workshopRouter } from './routers/workshop'
import { galleryRouter } from './routers/gallery'
import { registrationRouter } from './routers/registration'
import { signingRouter } from './routers/signing'
import { scheduleRouter } from './routers/schedule'
import { statusRouter } from './routers/status'
import { agentsRouter } from './routers/agents'
import { notificationRouter } from './routers/notification'
import { pushRouter } from './routers/push'
import { messageRouter } from './routers/message'
import { conferenceRouter } from './routers/conference'
import { topicRouter } from './routers/topic'
import { sponsorMessagesRouter } from './routers/sponsorMessages'

export const appRouter = router({
  badge: badgeRouter,
  sponsor: sponsorRouter,
  featured: featuredRouter,
  speaker: speakerRouter,
  proposal: proposalRouter,
  travelSupport: travelSupportRouter,
  tickets: ticketsRouter,
  volunteer: volunteerRouter,
  workshop: workshopRouter,
  gallery: galleryRouter,
  registration: registrationRouter,
  signing: signingRouter,
  schedule: scheduleRouter,
  status: statusRouter,
  agents: agentsRouter,
  notification: notificationRouter,
  push: pushRouter,
  message: messageRouter,
  conference: conferenceRouter,
  topic: topicRouter,
  sponsorMessages: sponsorMessagesRouter,
})

export type AppRouter = typeof appRouter
