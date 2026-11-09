import { PLATFORM_NAME } from '@/lib/branding/platform'

import type { SlackMessage } from '@/lib/notification/proposal-copy'

export {
  escapeMrkdwn,
  type SlackBlock,
  type SlackMessage,
} from '@/lib/notification/proposal-copy'

export interface PostSlackMessageOptions {
  channel?: string
  forceSlack?: boolean
  /**
   * Bot token resolved at the caller's boundary by
   * `resolveConferenceSlackToken`. REQUIRED in practice: there is no env
   * fallback, so an omitted or `undefined` token no-op-warns instead of sending.
   */
  botToken?: string
}

/**
 * The transport is CREDENTIAL-FREE by construction: it reads no env of its own,
 * so a caller that resolves no token cannot send. This is what makes
 * `resolveConferenceSlackToken` the single chokepoint every sender inherits —
 * the `notify.ts` helpers, the weekly-update cron and the admin status probe are
 * covered without any of them repeating the check.
 *
 * It used to end `?? process.env.SLACK_BOT_TOKEN`, so an omitted or
 * unresolved-to-`undefined` token silently posted with the PLATFORM's bot into a
 * tenant-editable channel name. Do NOT reintroduce a default here; add the token
 * to the resolver instead.
 */

interface SlackApiResponse {
  ok: boolean
  error?: string
}

export async function postSlackMessage(
  message: SlackMessage,
  options: PostSlackMessageOptions = {},
): Promise<void> {
  const { channel, forceSlack = false, botToken } = options

  if (process.env.NODE_ENV === 'development' && !forceSlack) {
    console.log('Slack notification (development mode):')
    console.log(JSON.stringify({ channel, ...message }, null, 2))
    return
  }

  if (!botToken) {
    console.warn(
      'No Slack bot token resolved for this organization, skipping notification',
    )
    return
  }

  if (!channel) {
    console.warn('No Slack channel specified, skipping notification')
    return
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({
      channel,
      blocks: message.blocks,
      text: message.text || `Notification from ${PLATFORM_NAME}`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Slack API HTTP ${response.status}: ${response.statusText}`)
  }

  const data = (await response.json()) as SlackApiResponse
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`)
  }
}
