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
  type SpeakerBriefingTalk,
  type SpeakerBriefingTodo,
} from '@/lib/speaker/briefing'
import { emailBrand } from './EmailBrandScope'
import { formatConferenceDayDate, formatSessionInstant } from '@/lib/time'

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
  /** The speaker had an earlier version: say this one is an update. */
  isUpdate?: boolean
}

/** Map links are organizer input: only http(s) becomes an href. */
const httpUrl = (url?: string) =>
  url && /^https?:\/\//i.test(url) ? url : undefined

const TODO_LABELS: Record<SpeakerBriefingTodo['kind'], string> = {
  'confirm-talk': 'Confirm your talk',
  'upload-slides': 'Upload your slides',
  'claim-ticket': 'Claim your speaker ticket',
  'co-speaker-invite-pending': 'Your co-speaker has not accepted yet',
  'travel-support': 'Finish your travel support request',
}

/** "Your talk", "Your workshop", or plural for several of a kind. */
function talksHeading(talks: SpeakerBriefingTalk[]): string {
  const workshops = talks.filter((t) => t.isWorkshop).length
  if (workshops === talks.length) {
    return workshops > 1 ? 'Your workshops' : 'Your workshop'
  }
  if (workshops === 0) return talks.length > 1 ? 'Your talks' : 'Your talk'
  return 'Your talks and workshops'
}

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

/** Links get explicit colour: some clients render a bare `<a>` invisibly. */
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        color: emailBrand().accent,
        textDecoration: 'underline',
        fontWeight: 500,
      }}
    >
      {children}
    </a>
  )
}

function MapLink({ url }: { url?: string }) {
  const href = httpUrl(url)
  return href ? (
    <>
      {' · '}
      <A href={href}>Open map</A>
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
  isUpdate = false,
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
        <ul
          style={{
            margin: 0,
            paddingLeft: '24px',
            listStyleType: 'disc',
            color: '#334155',
            fontSize: '16px',
            lineHeight: '1.6',
          }}
        >
          {b.todos.map((t) => (
            <li
              key={`${t.kind}-${t.proposalId ?? ''}`}
              style={{ display: 'list-item', marginBottom: '8px' }}
            >
              <A
                href={
                  t.kind === 'travel-support' || !t.proposalId
                    ? `${origin}/cfp/expense`
                    : `${origin}/cfp/proposal/${t.proposalId}`
                }
              >
                {TODO_LABELS[t.kind]}
              </A>
              : {t.title}
            </li>
          ))}
        </ul>,
      ),
    talks:
      b.talks &&
      section(
        talksHeading(b.talks),
        b.talks.map((t) => (
          <EmailText key={t.proposalId}>
            <strong>{t.title}</strong>
            {t.date && <> · {formatConferenceDayDate(t.date)}</>}
            {t.startTime && (
              <>
                {' '}
                · {t.startTime}
                {t.endTime && `–${t.endTime}`} (local time)
              </>
            )}
            {t.trackTitle && <> · {t.trackTitle}</>}
            {t.isWorkshop && (
              <>
                {' '}
                ·{' '}
                <A href={`${origin}/cfp/workshop/${t.proposalId}`}>
                  participant list
                </A>
              </>
            )}
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
        </>,
      ),
    checkIn: b.checkIn && section('Check-in', rich(b.checkIn)),
    equipment: b.equipment && section('Equipment', rich(b.equipment)),
    onsiteContact:
      c &&
      section(
        'On-site contact',
        <EmailText>
          {[
            c.name,
            c.phone && (
              <A href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}>{c.phone}</A>
            ),
            c.email && <A href={`mailto:${c.email}`}>{c.email}</A>,
          ]
            .filter(Boolean)
            .map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && ' · '}
                {part}
              </React.Fragment>
            ))}
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
        {isUpdate && 'This is an update to the speaker info we sent earlier. '}
        {eventName} is coming up. Here is what you need to know as a speaker.
      </EmailText>
      <div style={{ height: '24px' }} />

      {SPEAKER_BRIEFING_SECTIONS.map((key) => (
        <React.Fragment key={key}>{sections[key]}</React.Fragment>
      ))}

      <EmailText>Changed your plans? Reply to this email.</EmailText>
      <div style={{ marginTop: '24px', marginBottom: '24px' }}>
        <EmailButton href={`${origin}/cfp/list`}>
          Open your speaker dashboard
        </EmailButton>
      </div>
    </BaseEmailTemplate>
  )
}
