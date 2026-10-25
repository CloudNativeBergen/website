import * as React from 'react'
import type { PortableTextBlock } from '@portabletext/types'
import type { TypedObject } from 'sanity'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton, EmailSectionHeader, EmailText } from './EmailComponents'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import {
  SPEAKER_BRIEFING_SECTIONS,
  type SpeakerBriefing,
  type SpeakerBriefingSection,
} from '@/lib/speaker/briefing'
import { formatConferenceDateLong, formatSessionInstant } from '@/lib/time'

export interface SpeakerBriefingTemplateProps {
  speakerName: string
  briefing: SpeakerBriefing
  /** The conference origin; to-dos and the CTA link under it. */
  eventUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  socialLinks?: string[]
  brandColor?: string
}

/** Map links are organizer input: only http(s) becomes an href. */
const httpUrl = (url?: string) =>
  url && /^https?:\/\//i.test(url) ? url : undefined

const sectionStyle: React.CSSProperties = { marginBottom: '24px' }

function Rich({
  blocks,
  brandColor,
}: {
  blocks?: TypedObject[]
  brandColor?: string
}) {
  if (!blocks) return null
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: portableTextToHTML(
          blocks as unknown as PortableTextBlock[],
          brandColor,
        ),
      }}
    />
  )
}

function MapLink({ url }: { url?: string }) {
  const href = httpUrl(url)
  return href ? (
    <>
      {' '}
      (<a href={href}>map</a>)
    </>
  ) : null
}

/**
 * The pre-conference email (#1592), in {@link SPEAKER_BRIEFING_SECTIONS}
 * order. Every section is left out when it is empty.
 */
export function SpeakerBriefingTemplate({
  speakerName,
  briefing,
  eventUrl,
  eventName,
  eventLocation,
  eventDate,
  socialLinks = [],
  brandColor,
}: SpeakerBriefingTemplateProps) {
  const b = briefing
  const d = b.dinner
  const origin = eventUrl.replace(/\/+$/, '')
  const rich = (blocks?: TypedObject[]) => (
    <Rich blocks={blocks} brandColor={brandColor} />
  )
  const section = (title: string, body: React.ReactNode) => (
    <div style={sectionStyle}>
      <EmailSectionHeader>{title}</EmailSectionHeader>
      {body}
    </div>
  )
  const c = b.onsiteContact
  const venue = b.venueName || b.venueAddress || b.venueTravelInfo
  const sections: Record<SpeakerBriefingSection, React.ReactNode> = {
    todos:
      b.todos &&
      section(
        'Still to do',
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155' }}>
          {b.todos.map((t) => (
            <li key={`${t.kind}-${t.proposalId}`}>
              <a href={`${origin}/cfp/proposal/${t.proposalId}`}>
                {t.kind === 'confirm-talk'
                  ? 'Confirm your talk'
                  : 'Upload your slides'}
              </a>
              : {t.title}
            </li>
          ))}
        </ul>,
      ),
    talks:
      b.talks &&
      section(
        b.talks.length > 1 ? 'Your talks' : 'Your talk',
        b.talks.map((t) => (
          <EmailText key={t.proposalId}>
            <strong>{t.title}</strong>
            {t.date && <> · {formatConferenceDateLong(t.date)}</>}
            {t.startTime && (
              <>
                {' '}
                · {t.startTime}
                {t.endTime && `–${t.endTime}`} (local time)
              </>
            )}
            {t.trackTitle && <> · {t.trackTitle}</>}
          </EmailText>
        )),
      ),
    dinner:
      d &&
      section(
        'Speaker dinner',
        <>
          {d.rsvpNote && <EmailText weight="600">{d.rsvpNote}</EmailText>}
          {d.startsAt && (
            <EmailText>
              {formatSessionInstant(d.startsAt)} (local time)
            </EmailText>
          )}
          {(d.venueName || d.address) && (
            <EmailText>
              {[d.venueName, d.address].filter(Boolean).join(', ')}
              <MapLink url={d.mapUrl} />
            </EmailText>
          )}
          {d.text && <EmailText>{d.text}</EmailText>}
          {rich(d.description)}
          {d.routes?.map((r) => (
            <div key={r._key} style={{ marginTop: '12px' }}>
              {r.label && <EmailText weight="600">{r.label}</EmailText>}
              {r.meetingPoint && (
                <EmailText>
                  Meet at {r.meetingPoint}
                  <MapLink url={r.meetingPointMapUrl} />
                </EmailText>
              )}
              {(r.departsAt || r.departsNote) && (
                <EmailText>
                  Departs{' '}
                  {[
                    r.departsAt &&
                      `${formatSessionInstant(r.departsAt)} (local time)`,
                    r.departsNote,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </EmailText>
              )}
              {rich(r.details)}
            </div>
          ))}
          <div style={{ height: '12px' }} />
          <EmailText>Changed your plans? Reply to this email.</EmailText>
        </>,
      ),
    checkIn: b.checkIn && section('Check-in', rich(b.checkIn)),
    equipment: b.equipment && section('Equipment', rich(b.equipment)),
    onsiteContact:
      c &&
      section(
        'On-site contact',
        <EmailText>
          {[c.name, c.phone, c.email].filter(Boolean).join(' · ')}
        </EmailText>,
      ),
    accommodation:
      b.accommodation && section('Accommodation', rich(b.accommodation)),
    extra: b.extra && section('Good to know', rich(b.extra)),
    venue:
      venue &&
      section(
        'Venue and travel',
        <>
          {(b.venueName || b.venueAddress) && (
            <EmailText>
              {[b.venueName, b.venueAddress].filter(Boolean).join(', ')}
            </EmailText>
          )}
          {b.venueTravelInfo && <EmailText>{b.venueTravelInfo}</EmailText>}
        </>,
      ),
  }

  return (
    <BaseEmailTemplate
      title={`Your speaker briefing for ${eventName}`}
      titleTone="brand"
      brandColor={brandColor}
      speakerName={speakerName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
    >
      <EmailText>
        {eventName} is coming up. Here is what you need to know as a speaker.
      </EmailText>
      <div style={{ height: '24px' }} />

      {SPEAKER_BRIEFING_SECTIONS.map((key) => (
        <React.Fragment key={key}>{sections[key]}</React.Fragment>
      ))}

      <div style={{ marginTop: '24px', marginBottom: '24px' }}>
        <EmailButton href={`${origin}/cfp/list`}>
          Open your speaker dashboard
        </EmailButton>
      </div>
    </BaseEmailTemplate>
  )
}
