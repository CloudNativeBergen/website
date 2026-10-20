import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton, EmailText } from './EmailComponents'
import {
  FEEDBACK_COLOURS,
  FEEDBACK_COLOUR_LABELS,
  type FeedbackColour,
} from '@/lib/feedback/colour'
import type { FeedbackTotals } from '@/lib/feedback/totals'
import { displayName, plural } from '@/lib/text/display'

export interface SessionFeedbackSummaryTemplateProps {
  speakerName: string
  talkTitle: string
  totals: Pick<FeedbackTotals, 'combined' | 'total' | 'cardsTotal'>
  /** Visible comments: a count, never their text. */
  comments: number
  /** The speaker's Session Feedback section on `/cfp/proposal/<id>`. */
  resultsUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
  /** Per-tenant brand primary (THEMING L1); falls back to the house blue. */
  brandColor?: string
}

/** Fixed colours: they mean the answer, not the tenant's brand. */
const TILE: Record<FeedbackColour, { background: string; text: string }> = {
  green: { background: '#F0FDF4', text: '#166534' },
  yellow: { background: '#FEFCE8', text: '#854D0E' },
  red: { background: '#FEF2F2', text: '#991B1B' },
}

/**
 * The summary a speaker gets once their session's Feedback Window has closed
 * (speaker feedback spec §11.1): the combined totals per colour, the number
 * of responses and comments, and a link to the results. Counts only: no
 * comment text, so nothing an organizer later hides or removes lives on in
 * an inbox.
 */
export function SessionFeedbackSummaryTemplate({
  speakerName,
  talkTitle,
  totals,
  comments,
  resultsUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
  brandColor,
}: SessionFeedbackSummaryTemplateProps) {
  return (
    <BaseEmailTemplate
      title="Your Session Feedback is in"
      titleTone="brand"
      // The base template refuses an empty name; a speaker may have none.
      speakerName={displayName(speakerName) || 'speaker'}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      brandColor={brandColor}
    >
      <p
        style={{
          fontSize: '16px',
          lineHeight: '1.6',
          marginTop: '0',
          marginBottom: '20px',
          color: '#334155',
        }}
      >
        Feedback for <strong>&ldquo;{talkTitle}&rdquo;</strong> at {eventName}{' '}
        has closed. This is how the room answered:
      </p>

      <table
        role="presentation"
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{ borderCollapse: 'separate', borderSpacing: '8px 0' }}
      >
        <tbody>
          <tr>
            {FEEDBACK_COLOURS.map((colour) => (
              <td
                key={colour}
                width="33%"
                align="center"
                valign="top"
                style={{
                  backgroundColor: TILE[colour].background,
                  borderRadius: '12px',
                  padding: '16px 4px',
                  verticalAlign: 'top',
                  color: TILE[colour].text,
                }}
              >
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: '700',
                    lineHeight: '1.2',
                  }}
                >
                  {totals.combined[colour]}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {FEEDBACK_COLOUR_LABELS[colour]}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div style={{ margin: '20px 0 24px' }}>
        <EmailText>
          {`${plural(totals.total, 'response', 'responses')} · ${plural(comments, 'comment', 'comments')}`}
        </EmailText>
        {totals.cardsTotal > 0 && (
          <EmailText size="14px" color="#64748B">
            {`Including ${plural(totals.cardsTotal, 'feedback card', 'feedback cards')} counted in the room.`}
          </EmailText>
        )}
      </div>

      <EmailButton href={resultsUrl}>See your Session Feedback</EmailButton>

      <div style={{ marginBottom: '24px' }}>
        <EmailText size="14px" color="#64748B">
          {comments > 0
            ? 'The comments are on that page, not in this email.'
            : 'The full breakdown is on that page.'}
        </EmailText>
      </div>
    </BaseEmailTemplate>
  )
}
