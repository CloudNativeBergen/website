import { router } from './trpc'
import { sponsorRouter } from './routers/sponsor'
import { featuredRouter } from './routers/featured'
import { speakersRouter } from './routers/speakers'
import { proposalsRouter } from './routers/proposals'
import { travelSupportRouter } from './routers/travelSupport'
import { ticketsRouter } from './routers/tickets'
import { volunteerRouter } from './routers/volunteer'

export const appRouter = router({
  sponsor: sponsorRouter,
  featured: featuredRouter,
  speakers: speakersRouter,
  proposals: proposalsRouter,
  travelSupport: travelSupportRouter,
  tickets: ticketsRouter,
  volunteer: volunteerRouter,
})

export type AppRouter = typeof appRouter
