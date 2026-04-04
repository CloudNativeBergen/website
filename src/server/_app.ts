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
})

export type AppRouter = typeof appRouter
