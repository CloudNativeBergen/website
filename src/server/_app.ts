/**
 * Main tRPC App Router
 * This is the central router that combines all feature routers
 */

import { router } from './trpc'
import { sponsorRouter } from './routers/sponsor'

export const appRouter = router({
  sponsor: sponsorRouter,
  // Future routers can be added here:
  // proposal: proposalRouter,
  // speaker: speakerRouter,
  // admin: adminRouter,
})

export type AppRouter = typeof appRouter
