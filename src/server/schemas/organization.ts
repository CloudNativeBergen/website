import { z } from 'zod'
import { POSTHOG_TOKEN_MESSAGE, POSTHOG_TOKEN_PATTERN } from '@/lib/analytics'

// === Analytics (issue #1008) ===
// The organization's PUBLIC PostHog project token. `null` UNSETS it, which is
// the documented "no PostHog" state — there is no platform-level fallback to
// inherit, by design (see `resolvePosthogToken`). The shape is validated on the
// write path because the value is rendered into the page and interpolated
// into request paths by the client.
export const UpdateOrganizationAnalyticsSchema = z.object({
  analyticsPosthogToken: z
    .string()
    .trim()
    .regex(POSTHOG_TOKEN_PATTERN, POSTHOG_TOKEN_MESSAGE)
    .nullable(),
})
