import { router } from './trpc'
import { sponsorRouter } from './routers/sponsor'
import { featuredRouter } from './routers/featured'
import { speakersRouter } from './routers/speakers'
import { proposalsRouter } from './routers/proposals'
import { travelSupportRouter } from './routers/travelSupport'
import { ticketsRouter } from './routers/tickets'

export const appRouter = router({
  sponsor: sponsorRouter,
  featured: featuredRouter,
  speakers: speakersRouter,
  proposals: proposalsRouter,
  travelSupport: travelSupportRouter,
  tickets: ticketsRouter,
})

export type AppRouter = typeof appRouter
