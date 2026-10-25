/**
 * The shared speaker briefing (#1592) as ONE Slack message for the speakers'
 * channel. Built from the briefing WITHOUT speaker data, so nothing personal
 * (talks, to-dos) can reach a channel. Every organizer-written string goes
 * through `escapeMrkdwn`, so a value cannot become a link or a mention.
 */
import type { TypedObject } from 'sanity'
import type { SpeakerBriefing } from '@/lib/speaker/briefing'
import { formatSessionInstant } from '@/lib/time'
import { escapeMrkdwn, type SlackBlock, type SlackMessage } from './client'

const e = (s: string) => escapeMrkdwn(s)
const httpUrl = (url?: string) =>
  url && /^https?:\/\//i.test(url) ? url : undefined
/** A Slack link; `|` and the escapes keep the label and url inert. */
const link = (url: string | undefined, label: string) => {
  const href = httpUrl(url)
  return href ? `<${e(href).replace(/\|/g, '%7C')}|${e(label)}>` : ''
}
const when = (iso: string) => `${formatSessionInstant(iso)} (local time)`

type Span = { _type?: string; text?: string; marks?: string[] }
type Block = TypedObject & {
  children?: Span[]
  listItem?: string
  markDefs?: { _key: string; _type: string; href?: string }[]
}

/** Portable text as plain mrkdwn: bold, italics, http(s) links, bullets. */
export function portableTextToMrkdwn(blocks?: TypedObject[]): string {
  return (blocks ?? [])
    .map((raw) => {
      const block = raw as Block
      const line = (block.children ?? [])
        .map((span) => {
          let text = e(span.text ?? '')
          if (!text.trim()) return text
          for (const mark of span.marks ?? []) {
            const def = block.markDefs?.find((d) => d._key === mark)
            if (def?._type === 'link') {
              text = link(def.href, span.text ?? '') || text
            } else if (mark === 'strong') text = `*${text}*`
            else if (mark === 'em') text = `_${text}_`
          }
          return text
        })
        .join('')
      return block.listItem ? `• ${line}` : line
    })
    .filter((line) => line.trim())
    .join('\n')
}

const section = (text: string): SlackBlock => ({
  type: 'section',
  // Slack caps a section's text at 3000 characters.
  text: { type: 'mrkdwn', text: text.slice(0, 3000) },
})

export function buildBriefingSlackMessage(
  briefing: SpeakerBriefing,
  opts: { title: string; dashboardUrl: string; mentionChannel?: boolean },
): SlackMessage {
  const parts: string[] = []
  const d = briefing.dinner
  if (d) {
    const lines = ['*Speaker dinner*']
    if (d.rsvpNote) lines.push(e(d.rsvpNote))
    if (d.startsAt) lines.push(when(d.startsAt))
    const place = [d.venueName, d.address].filter(Boolean).join(', ')
    if (place) {
      lines.push([e(place), link(d.mapUrl, 'map')].filter(Boolean).join(' · '))
    }
    if (d.text) lines.push(e(d.text))
    const description = portableTextToMrkdwn(d.description)
    if (description) lines.push(description)
    for (const r of d.routes ?? []) {
      const meet = r.meetingPoint
        ? `meet at ${link(r.meetingPointMapUrl, r.meetingPoint) || e(r.meetingPoint)}`
        : ''
      const departs = [
        r.departsAt && when(r.departsAt),
        r.departsNote && e(r.departsNote),
      ]
        .filter(Boolean)
        .join(', ')
      lines.push(
        `• ${[
          r.label && `*${e(r.label)}*`,
          meet,
          departs && `departs ${departs}`,
        ]
          .filter(Boolean)
          .join(' · ')}`,
      )
    }
    parts.push(lines.join('\n'))
  }
  const rich = (title: string, blocks?: TypedObject[]) => {
    const body = portableTextToMrkdwn(blocks)
    if (body) parts.push(`*${title}*\n${body}`)
  }
  rich('Check-in', briefing.checkIn)
  rich('Equipment', briefing.equipment)
  const c = briefing.onsiteContact
  if (c) {
    parts.push(
      `*On-site contact*\n${e([c.name, c.phone, c.email].filter(Boolean).join(' · '))}`,
    )
  }
  rich('Good to know', briefing.extra)

  const heading = `${opts.mentionChannel ? '<!channel> ' : ''}*${e(opts.title)}*`
  return {
    text: `Speaker info: ${opts.title}`,
    blocks: [
      section(heading),
      ...parts.map(section),
      section(
        `Everything is on your speaker dashboard: ${link(opts.dashboardUrl, 'open it')}`,
      ),
    ],
  }
}
