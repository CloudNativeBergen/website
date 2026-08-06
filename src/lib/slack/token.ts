import 'server-only'
import { perOrgSecretsStore, platformEnvCredentials } from '@/lib/secrets/store'
import { isSlackMirrorEnabledForOrg } from '@/lib/features/slack'

/** Only the conference field the Slack token resolver needs. */
type ConferenceSlackBinding = {
  organization?: { _ref?: string } | null
}

/**
 * THE only source of a Slack bot token. `postSlackMessage` has no env fallback
 * of its own, so a send happens iff this returns a token.
 *
 * ORDER:
 *  1. The org's OWN token from the per-org secret store, if provisioned. That
 *     addresses the tenant's own workspace, so no isolation question arises and
 *     no feature gate stands in front of it — provisioning the secret IS the
 *     grant.
 *  2. Otherwise the platform env token, but ONLY when the `slack-mirror` gate
 *     passes for the owning org (`@/lib/features/slack`): by default that is the
 *     platform org alone, plus any org given an explicit override.
 *  3. Otherwise `undefined` — `postSlackMessage` warns and no-ops, which is the
 *     path an unconfigured deployment has always taken.
 *
 * WHY THE GATE. `SLACK_BOT_TOKEN` is one bot in the platform's workspace, while
 * the destination channel is a tenant-editable conference field, so a shared
 * token posts arbitrary tenants' content into the platform's workspace under a
 * name the tenant chose. See the module doc in `@/lib/features/slack` for the
 * full argument and the dev-behaviour decision.
 *
 * FAILS CLOSED on a conference with no `organization` ref — which also means a
 * caller must pass a conference projection that INCLUDES `organization`, not a
 * narrow one. Grep for `resolveConferenceSlackToken` before adding a sender.
 */
export async function resolveConferenceSlackToken(
  conference: ConferenceSlackBinding,
): Promise<string | undefined> {
  const orgId = conference.organization?._ref

  const perOrg = await perOrgSecretsStore.get(orgId, 'slack')
  if (perOrg?.botToken) return perOrg.botToken

  if (!(await isSlackMirrorEnabledForOrg(orgId))) return undefined

  // Deliberately `platformEnvCredentials` (the raw env accessor) and NOT the
  // org-keyed `envSecretsStore`, which since #844 refuses every non-platform
  // org. The gate above is BROADER than that store's rule by design: an ACTIVE
  // `slack-mirror` override grants a non-platform pilot org the platform bot
  // token, and the store would take it straight back. The gate is the
  // authorization decision here; this line just reads the credential it granted.
  return platformEnvCredentials('slack')?.botToken
}
