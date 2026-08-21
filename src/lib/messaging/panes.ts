/**
 * The URL grammar of the three-pane messages reading surface.
 *
 * The organizer inbox is an email client: a conversation list, the thread, and
 * — for a proposal-attached thread — a read-only proposal context rail. On a
 * wide screen the three sit side by side; below `lg` each becomes a full-screen
 * STEP with back navigation.
 *
 * The steps are derived from the URL, never from component state, so a single
 * link opens the right step directly:
 *
 * - `/admin/messages`                      → the list step
 * - `/admin/messages/<conversationId>`     → the thread step
 * - `/admin/messages/<id>?pane=proposal`   → the proposal step
 *
 * The middle form is LOAD-BEARING and unchanged: it is the link already stored
 * on `notification` documents (see {@link conversationEmailLinkPath} in
 * `./links`) and matched by `link in $links` across the messaging, notification
 * and proposal data layers. Widening the page it renders into must never change
 * the path itself — `?pane=` is an ADDITIVE, optional refinement that an old
 * stored link simply omits (and therefore lands on the thread step, which is
 * exactly where it landed before).
 *
 * Pure and client-safe (no `server-only` import) so the workspace, its stories
 * and unit tests can all share one definition.
 */

/** Which pane a viewer is looking at on a narrow screen. */
export type MessagesPane = 'list' | 'thread' | 'proposal'

/** The query param that selects the proposal step. Absent ⇒ the thread step. */
export const MESSAGES_PANE_PARAM = 'pane'

/** The only value {@link MESSAGES_PANE_PARAM} is defined to carry. */
export const MESSAGES_PROPOSAL_PANE = 'proposal'

/**
 * The step implied by the current URL.
 *
 * `?pane=proposal` only means the proposal step when a conversation is actually
 * selected — a bare `/admin/messages?pane=proposal` has no proposal to show and
 * degrades to the list. Any other `?pane=` value is ignored rather than treated
 * as an error, so a stale or hand-typed param can never strand the organizer on
 * a blank pane.
 */
export function messagesPaneStep(
  conversationId: string | null | undefined,
  paneParam: string | null | undefined,
): MessagesPane {
  if (!conversationId) return 'list'
  return paneParam === MESSAGES_PROPOSAL_PANE ? 'proposal' : 'thread'
}

/**
 * Build the URL for a step, preserving every OTHER query param already on the
 * page (notably the inbox's `?view=` tab, which must survive a drill-down and
 * the walk back out).
 *
 * `search` accepts the raw query string of the current URL — `''`,
 * `'view=needs-reply'` and `'?view=needs-reply'` are all handled.
 */
export function messagesPaneHref({
  basePath,
  conversationId,
  pane,
  search = '',
}: {
  /** `/admin/messages` for organizers, `/cfp/messages` for speakers. */
  basePath: string
  /** Required for the thread and proposal steps; ignored for the list. */
  conversationId?: string | null
  pane: MessagesPane
  search?: string
}): string {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )

  if (pane === 'proposal' && conversationId) {
    params.set(MESSAGES_PANE_PARAM, MESSAGES_PROPOSAL_PANE)
  } else {
    params.delete(MESSAGES_PANE_PARAM)
  }

  const path =
    pane === 'list' || !conversationId
      ? basePath
      : `${basePath}/${conversationId}`
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}
