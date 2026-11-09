/**
 * Proposal notification copy shared by the site and the notifications Worker
 * (services/notifications, epic #2215): the Slack blocks, the organizers'
 * in-app items and the stored `notification` document. Pure: no env, no I/O
 * and relative imports only, so a Worker can bundle it.
 */
import type { NotificationInput } from './types'

/**
 * Escape the three characters Slack treats as control characters inside a
 * `mrkdwn` text field — `&`, `<`, `>` — per Slack's formatting guidance
 * (https://api.slack.com/reference/surfaces/formatting#escaping). MUST be
 * applied to EVERY user-controlled string interpolated into an `mrkdwn` field,
 * otherwise a value like `<https://evil|CNCF Payroll>` renders as a phishing
 * link and `<!channel>` broadcasts to the whole workspace (batch A / A1).
 *
 * `&` is replaced first so the entities we introduce are not double-escaped.
 */
export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type SlackBlock = {
  type: string
  text?: {
    type: string
    text: string
    emoji?: boolean
  }
  fields?: Array<{
    type: string
    text: string
  }>
  elements?: Array<{
    type: string
    text: {
      type: string
      text: string
      emoji?: boolean
    }
    url?: string
    action_id?: string
  }>
}

export type SlackMessage = {
  blocks: SlackBlock[]
  text?: string
}

export type TicketCancellation =
  | {
      speakers: { name: string; email?: string }[]
      /** The other-confirmed-talk check failed; organizers must check by hand. */
      unfiltered: boolean
    }
  | undefined

/** The proposal actions with an organizer alert. */
export type ProposalAlertAction = 'submit' | 'confirm' | 'withdraw' | 'cancel'

export function createAdminLinkButton(
  domain: string,
  path: string,
  text: string,
  actionId: string,
): SlackBlock {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text, emoji: true },
        url: `https://${domain}${path}`,
        action_id: actionId,
      },
    ],
  }
}

export function createAdminButton(
  proposalId: string,
  domain: string,
  buttonText: string,
  actionId: string,
): SlackBlock {
  return createAdminLinkButton(
    domain,
    `/admin/proposals/${proposalId}`,
    buttonText,
    actionId,
  )
}

export function createProposalInfoBlocks(
  title: string,
  speakerNames: string,
): SlackBlock[] {
  return [
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Title:*\n${escapeMrkdwn(title)}` },
        { type: 'mrkdwn', text: `*Speaker:*\n${escapeMrkdwn(speakerNames)}` },
      ],
    },
  ]
}

const ACTION_EMOJI: Record<string, string> = {
  confirm: '✅',
  withdraw: '🚫',
  cancel: '🛑',
}
const ACTION_TEXT: Record<string, string> = {
  confirm: 'Confirmed',
  withdraw: 'Withdrawn',
  cancel: 'Canceled',
}

// No provider API cancels tickets, so organizers do it by hand.
export function pushTicketCancellation(
  blocks: SlackBlock[],
  ticketCancellation: TicketCancellation,
) {
  if (!ticketCancellation?.speakers.length) return
  const list = ticketCancellation.speakers
    .map(
      (s) =>
        `• ${escapeMrkdwn(s.name)}${s.email ? ` (${escapeMrkdwn(s.email)})` : ''}`,
    )
    .join('\n')
  const caveat = ticketCancellation.unfiltered
    ? '\n_Could not check for other confirmed talks: this list is unfiltered. Check by hand that each speaker has no other confirmed talk before cancelling._'
    : ''
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*🎟️ Cancel ticket by hand in the ticket provider's dashboard for:*\n${list}${caveat}`,
    },
  })
}

/** The organizer Slack alert for a new proposal or a status change. */
export function proposalAlertBlocks(p: {
  action: string
  proposalId: string
  title: string
  speakerNames: string
  domain: string | null
  reason?: string
  ticketCancellation?: TicketCancellation
}): SlackBlock[] {
  const submit = p.action === 'submit'
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: submit
          ? '📥 New Talk Proposal'
          : `${ACTION_EMOJI[p.action] ?? '📝'} Talk ${ACTION_TEXT[p.action] ?? 'Status Changed'}`,
        emoji: true,
      },
    },
    ...createProposalInfoBlocks(p.title, p.speakerNames),
  ]
  if (!submit) {
    if (p.reason?.trim()) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reason:*\n${escapeMrkdwn(p.reason.trim())}`,
        },
      })
    }
    pushTicketCancellation(blocks, p.ticketCancellation)
  }
  if (p.domain) {
    blocks.push(
      submit
        ? createAdminButton(
            p.proposalId,
            p.domain,
            'Review Proposal',
            'review_proposal',
          )
        : createAdminButton(
            p.proposalId,
            p.domain,
            'View in Admin',
            'view_proposal',
          ),
    )
  }
  return blocks
}

/**
 * A speaker withdrew their own talk and the reason went out as a thread
 * message, whose fan-out already posted to Slack. A second "Talk Withdrawn"
 * alert would double-notify the organizers, unless it carries tickets to
 * cancel by hand: the thread message has no ticket list.
 */
export function isSelfWithdrawInThread(e: {
  action: string
  isOrganizer: boolean
  postedToThread?: boolean
  ticketCancellation?: TicketCancellation
}): boolean {
  return (
    e.action === 'withdraw' &&
    !e.isOrganizer &&
    !!e.postedToThread &&
    !e.ticketCancellation?.speakers.length
  )
}

/**
 * The organizers' in-app items for a proposal event, the actor excluded.
 * `submit` is a `proposal_submitted`; the rest are status changes, and a
 * withdrawal's reason (#212) becomes the message.
 */
export function organizerProposalItems(p: {
  action: ProposalAlertAction
  organizerIds: readonly string[]
  actorId?: string
  conferenceId: string
  proposalId: string
  title: string
  reason?: string
}): NotificationInput[] {
  const submit = p.action === 'submit'
  const title = submit
    ? `New proposal: "${p.title}"`
    : p.action === 'withdraw'
      ? `Proposal withdrawn: "${p.title}"`
      : p.action === 'cancel'
        ? `Talk canceled: "${p.title}"`
        : `Speaker confirmed: "${p.title}"`
  const message = p.action === 'withdraw' && p.reason ? p.reason : undefined
  return p.organizerIds
    .filter((id) => id && id !== p.actorId)
    .map((id): NotificationInput => ({
      recipientId: id,
      conferenceId: p.conferenceId,
      notificationType: submit
        ? 'proposal_submitted'
        : 'proposal_status_changed',
      title,
      ...(submit ? {} : { message }),
      actorId: p.actorId,
      relatedProposalId: p.proposalId,
      link: `/admin/proposals/${p.proposalId}`,
    }))
}

const ref = (id: string) => ({ _type: 'reference' as const, _ref: id })

/** The stored `notification` document for one input. */
export function notificationDocument(
  item: NotificationInput,
  createdAt: string,
): { _type: 'notification'; [key: string]: unknown } {
  const doc: { _type: 'notification'; [key: string]: unknown } = {
    _type: 'notification',
    // WEAK (#851): a strong ref here blocks GDPR erasure of the speaker.
    // `weak: true` in the schema governs Studio writes only — an API write
    // is strong unless the stored ref object itself carries `_weak`.
    recipient: { ...ref(item.recipientId), _weak: true },
    conference: ref(item.conferenceId),
    notificationType: item.notificationType,
    title: item.title,
    createdAt,
  }
  if (item.message) {
    doc.message = item.message
  }
  if (item.link) {
    doc.link = item.link
  }
  if (item.actorId) {
    // WEAK (#851): see `recipient` above — speaker erasure must not be
    // blocked by a notification the speaker happened to trigger.
    doc.actor = { ...ref(item.actorId), _weak: true }
  }
  if (item.relatedProposalId) {
    // Weak reference so a later proposal deletion doesn't orphan-block.
    doc.relatedProposal = { ...ref(item.relatedProposalId), _weak: true }
  }
  return doc
}
