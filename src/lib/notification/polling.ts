/**
 * How often the notification hub re-reads the unread count.
 *
 * This is the HIGHEST-VOLUME poll in the product: the bell and the PWA app-icon
 * badge mount on every authenticated page, in both shells, for every organizer
 * and speaker. One shared constant so the two observers of
 * `notification.unreadCount` can never drift apart — React Query keys them
 * together, and matching intervals are what keeps them collapsing into a single
 * in-flight fetch instead of two staggered ones.
 *
 * 60s (was 30s) is well inside expectations for a badge: the count is also
 * invalidated eagerly on every action that changes it (opening a thread,
 * marking read, a push click), so the poll is only the backstop for events that
 * arrive while the page sits idle.
 *
 * Deliberately NOT used for the conversation thread (`ConversationThread`,
 * 20s): that one runs only while someone is actively reading a conversation,
 * where latency is felt.
 */
export const NOTIFICATION_POLL_MS = 60_000
