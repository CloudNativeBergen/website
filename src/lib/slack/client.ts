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

export interface PostSlackMessageOptions {
  channel?: string
  forceSlack?: boolean
}

interface SlackApiResponse {
  ok: boolean
  error?: string
}

export async function postSlackMessage(
  message: SlackMessage,
  options: PostSlackMessageOptions = {},
): Promise<void> {
  const { channel, forceSlack = false } = options

  if (process.env.NODE_ENV === 'development' && !forceSlack) {
    console.log('Slack notification (development mode):')
    console.log(JSON.stringify({ channel, ...message }, null, 2))
    return
  }

  const botToken = process.env.SLACK_BOT_TOKEN

  if (!botToken) {
    console.warn('SLACK_BOT_TOKEN is not configured')
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
      text: message.text || 'Notification from Cloud Native Days',
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
