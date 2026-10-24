/**
 * Cache-tag builders — the single source of truth for tenant-scoped
 * `cacheTag`/`revalidateTag` names.
 *
 * Content is served per-conference (multi-tenant, one deploy serves every
 * conference domain). A tenant-scoped tag lets a mutation on one conference
 * invalidate ONLY that conference's cached pages/reads, instead of the broad
 * `content:*` tags that bust every tenant at once.
 *
 * - `conferenceTag(id)` — the per-conference-document tag. Prefer this whenever
 *   the conference `_id` is available (mutations resolve it; page/data
 *   functions resolve the conference from the domain and can tag after the
 *   fetch). This is the tag mutations should revalidate.
 * - `domainTag(domain)` — a per-domain fallback for the rare spot where a
 *   conference id is not available but the host is.
 * - `shortLinkTag(documentId)` — the per-DOCUMENT tag on the `/go/<code>`
 *   lookup (short-links spec §2.5). Keyed on the document the code belongs to
 *   rather than the conference, so repairing one Task's destination does not
 *   discard every other code's cached lookup. Every write that changes a
 *   target — a variant save that rewrites `link`, an outreach Task's
 *   `targetPage`, an outreach Task delete — must EXPIRE it.
 * - `shortLinkIndexTag(conferenceId)` — the per-CONFERENCE tag on the set of
 *   short codes that conference holds. It is what makes §2.4's "a scanner
 *   costs nothing" true for WELL-FORMED codes: an unknown one is ruled out
 *   against this cached set instead of costing a Sanity read of its own.
 *   Every write that CREATES, backfills or deletes a code must expire it.
 * - `earlyAccessLinksTag(conferenceId)` — the per-CONFERENCE tag on the live
 *   workshop early-access links of that conference (#1346). Creating and
 *   revoking a link, and every path that removes a sponsor from a conference,
 *   must expire it with `{ expire: 0 }`.
 * - `feedbackCodeIndexTag(conferenceId)` — the per-CONFERENCE tag on the
 *   Feedback Code index (speaker feedback spec §5.1): code → talk id for the
 *   conference's confirmed, published talks, with their titles, speakers and
 *   slots. Expire it with `{ expire: 0 }`: on a mint, a talk status change, a
 *   proposal delete, `schedule.save` and `schedule.action`, and through a
 *   `conference` target of the provisioning invalidation endpoint (which
 *   speaker erasure's printed tags send the operator to). Rotation (F6) and
 *   the fold (F9) add theirs. Not `conferenceTag` for everything the index
 *   serves: rotation and status changes leave the programme link alone, and
 *   schedule edits refresh `conferenceTag` on their own path. A mint, bulk mint and fold ALSO expire `conferenceTag`
 *   (`expireProgrammeFeedbackLinks`), because the programme's "Give feedback"
 *   link shows only where the conference read says a code exists (#1472).
 * - `feedbackResponseTag(responseId)` — the per-RESPONSE tag on a device's own
 *   Feedback Response as the attendee page reads it (speaker feedback spec
 *   §7.4). Submit and Delete my answer expire it with `updateTag` (Server
 *   Actions); Remove (F5) with `revalidateTag(tag, { expire: 0 })`, since it
 *   runs where `updateTag` throws.
 * - `organizationTag(orgId)` — the per-ORGANIZATION-document tag, for cached
 *   reads keyed on the tenant itself rather than one of its conference
 *   editions (plan/entitlement resolution). Mutations that edit an
 *   organization document must revalidate this tag.
 */

export function conferenceTag(conferenceId: string): string {
  return `sanity:conference-${conferenceId}`
}

export function domainTag(domain: string): string {
  return `domain:${domain}`
}

export function organizationTag(orgId: string): string {
  return `sanity:organization-${orgId}`
}

/**
 * The `/go/<code>` lookup entry for one document (`socialPostVariant` or
 * `marketingTask`). Revalidate it with `{ expire: 0 }`, not a profile: a
 * repaired or deleted destination must not keep being served stale.
 */
export function shortLinkTag(documentId: string): string {
  return `sanity:short-link-${documentId}`
}

/**
 * The set of `/go/` codes one conference holds. Separate from
 * {@link shortLinkTag}: that one is per DOCUMENT and invalidates a single
 * resolved target, this one is per CONFERENCE and invalidates the membership
 * set the route uses to reject unknown codes without reading Sanity.
 */
export function shortLinkIndexTag(conferenceId: string): string {
  return `sanity:short-link-index-${conferenceId}`
}

/**
 * The live workshop early-access links of one conference (#1346). Expire it
 * with `{ expire: 0 }`, not a profile: a revoked link must not keep being
 * shown as live while the new answer loads.
 */
export function earlyAccessLinksTag(conferenceId: string): string {
  return `sanity:workshop-early-access-${conferenceId}`
}

/**
 * The Feedback Code index of one conference (speaker feedback spec §5.1).
 * Expire it with `{ expire: 0 }`: a just-minted code must resolve at once.
 */
export function feedbackCodeIndexTag(conferenceId: string): string {
  return `sanity:feedback-code-index-${conferenceId}`
}

/**
 * One device's own Feedback Response, as `/f/<code>` reads it for the
 * Answered state (speaker feedback spec §7.4). Expire it on every write to
 * the response: the page shows the answer it was told.
 */
export function feedbackResponseTag(responseId: string): string {
  return `sanity:feedback-response-${responseId}`
}

/**
 * A conference's Photo Wall as its public pages read it (Photo Wall spec §8):
 * the settings now, the approved posts from M5a. Expire it with
 * `{ expire: 0 }` on Set up and on every settings change, so a running
 * screen and the `/wall` routes see the change on their next request.
 */
export function photoWallTag(conferenceId: string): string {
  return `photo-wall:${conferenceId}`
}

/**
 * A conference's moderation queue as `/admin/photo-wall` polls it (Photo
 * Wall spec §8): every Wall Post with its status and the pending count.
 * Expire it with `{ expire: 0 }` on Submit, every moderation action, a
 * contributor's Delete or marketing change, and the retention cron.
 */
export function photoWallAdminTag(conferenceId: string): string {
  return `photo-wall-admin:${conferenceId}`
}

/**
 * One device's Wall Posts as its My posts list reads them (Photo Wall spec
 * §8). Expire it with `{ expire: 0 }` on Submit, every moderation action, a
 * contributor's Delete or marketing change, and the retention cron.
 */
export function photoWallDeviceTag(deviceKey: string): string {
  return `photo-wall-device:${deviceKey}`
}
