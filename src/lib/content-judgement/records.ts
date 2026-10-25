import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'

/**
 * Whether any Judgement is stored for any of the organization's conferences
 * (spec §5, §13.1): OpenRouter stays disclosed while one is, even after the
 * setting is turned off. THROWS on a failed read; the /privacy resolver turns
 * that into "unknown", which discloses.
 */
export async function hasStoredJudgements(orgId: string): Promise<boolean> {
  return clientReadUncached.fetch<boolean>(STORED_JUDGEMENTS_QUERY, { orgId })
}

// groq-global-scoped: bound to one organization through its conferences —
// `conference._ref in` the ids of conferences with `organization._ref ==
// $orgId` (the server-resolved tenant). Executed against two organizations
// in records.test.ts.
const STORED_JUDGEMENTS_QUERY = `count(*[_type == "contentJudgement" && conference._ref in *[_type == "conference" && organization._ref == $orgId]._id]) > 0`
