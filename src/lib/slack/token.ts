import 'server-only'
import { resolveTenantSecrets } from '@/lib/secrets/store'

/** Only the conference field the Slack token resolver needs. */
type ConferenceSlackBinding = {
  organization?: { _ref?: string } | null
}

/**
 * Resolve the Slack bot token for a conference's owning organization (CaaS
 * #617). A per-org Slack secret wins; otherwise the platform env
 * `SLACK_BOT_TOKEN` flows through {@link resolveTenantSecrets}'s default chain —
 * so behavior is UNCHANGED until a tenant is provisioned with its own token.
 *
 * Returns `undefined` when neither is configured, which lets `postSlackMessage`
 * fall back to `process.env.SLACK_BOT_TOKEN` and no-op-warn exactly as today.
 */
export async function resolveConferenceSlackToken(
  conference: ConferenceSlackBinding,
): Promise<string | undefined> {
  const creds = await resolveTenantSecrets(
    conference.organization?._ref,
    'slack',
  )
  return creds?.botToken
}
