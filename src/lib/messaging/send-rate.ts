/**
 * Per-speaker sliding-window throttle for `message.send` (batch A / A2). Sending
 * fans out to Slack (one post) and to N organizer emails, so an unthrottled
 * loop amplifies. Allow a burst of {@link SEND_MAX_IN_WINDOW} sends per
 * {@link SEND_WINDOW_MS}, then reject with TOO_MANY_REQUESTS.
 *
 * Lives in module memory, so on serverless it is PER-INSTANCE only — a burst
 * spread across instances sees a higher effective ceiling. That's acceptable:
 * this caps accidental/abusive hammering on a single instance while the email
 * and Slack providers rate-limit further downstream (same caveat as push.ts's
 * claimTestCooldown). The map is size-capped so it can never grow without bound.
 */
const SEND_WINDOW_MS = 60_000
const SEND_MAX_IN_WINDOW = 10
const MAX_RATE_ENTRIES = 10_000
const recentSendsBySpeaker = new Map<string, number[]>()

/**
 * Record a send for `speakerId` and report whether it is allowed right now.
 * Returns false when the speaker already made {@link SEND_MAX_IN_WINDOW} sends
 * within the trailing {@link SEND_WINDOW_MS}; otherwise stamps now and allows.
 */
export function claimSendSlot(speakerId: string): boolean {
  const now = Date.now()
  const cutoff = now - SEND_WINDOW_MS
  const recent = (recentSendsBySpeaker.get(speakerId) ?? []).filter(
    (t) => t > cutoff,
  )
  // Re-insert at the tail so the just-active speaker is the most-recent entry
  // (eviction below always targets the genuinely oldest key).
  recentSendsBySpeaker.delete(speakerId)
  if (recent.length >= SEND_MAX_IN_WINDOW) {
    recentSendsBySpeaker.set(speakerId, recent)
    return false
  }
  recent.push(now)
  if (recentSendsBySpeaker.size >= MAX_RATE_ENTRIES) {
    const oldest = recentSendsBySpeaker.keys().next().value
    if (oldest !== undefined) recentSendsBySpeaker.delete(oldest)
  }
  recentSendsBySpeaker.set(speakerId, recent)
  return true
}
