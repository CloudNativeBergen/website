import { router } from './trpc'
import { sponsorRouter } from './routers/sponsor'
import { featuredRouter } from './routers/featured'
import { speakerRouter } from './routers/speaker'
import { speakersRouter } from './routers/speakers'
import { proposalRouter } from './routers/proposal'
import { proposalsRouter } from './routers/proposals'
import { travelSupportRouter } from './routers/travelSupport'
import { ticketsRouter } from './routers/tickets'
import { volunteerRouter } from './routers/volunteer'
import { workshopRouter } from './routers/workshop'
import { galleryRouter } from './routers/gallery'

export const appRouter = router({
  sponsor: sponsorRouter,
  featured: featuredRouter,
  speaker: speakerRouter,
  speakers: speakersRouter,
  proposal: proposalRouter,
  proposals: proposalsRouter,
  travelSupport: travelSupportRouter,
  tickets: ticketsRouter,
  volunteer: volunteerRouter,
  workshop: workshopRouter,
  gallery: galleryRouter,
})

export type AppRouter = typeof appRouter
