'use client'

/**
 * The sponsor portal's blocks after signing (#1687, phase 7): what happens
 * next, at the event, and after the event. Each takes the token-scoped
 * `afterSigning` read and nothing else; `portalPhase` picks which one shows.
 */
import { useState } from 'react'
import {
  formatDateLocalized,
  formatDateRangeLocalized,
  formatRegistrationInstant,
} from '@/lib/time'
import type { PortalAfterSigning } from '@/lib/sponsor-crm/registration'

const LOCALE = 'en-GB'
const card =
  'rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800'
const heading = 'text-lg font-semibold text-gray-900 dark:text-white'
const muted = 'text-sm text-gray-600 dark:text-gray-400'
const link =
  'font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300'

function invoiceText(a: PortalAfterSigning): string | null {
  switch (a.invoiceStatus) {
    case 'paid':
      return 'Paid, thank you'
    case 'sent':
    case 'overdue':
      return a.invoiceSentAt
        ? `Invoice sent ${formatDateLocalized(a.invoiceSentAt, LOCALE)}`
        : 'Invoice sent'
    case 'cancelled':
      return null
    default:
      return 'Invoice on its way'
  }
}

function eventDates(a: PortalAfterSigning): string | null {
  if (!a.startDate) return null
  return a.endDate && a.endDate !== a.startDate
    ? formatDateRangeLocalized(a.startDate, a.endDate, LOCALE)
    : formatDateLocalized(a.startDate, LOCALE)
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }
      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      aria-label={`Copy code ${value}`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** The codes as the discount email shows them: code, and where to use it. */
export function PortalDiscountCodes({ a }: { a: PortalAfterSigning }) {
  if (a.discountCodes.length === 0) return null
  const ticketUrl = a.ticketUrl || '/tickets'
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
        {a.discountCodes.length === 1
          ? 'Your discount code'
          : 'Your discount codes'}
      </h3>
      <ul className="mt-2 space-y-2">
        {a.discountCodes.map((code) => (
          <li key={code} className="flex items-center gap-3">
            <code className="rounded bg-gray-100 px-2 py-1 font-mono text-sm text-gray-900 dark:bg-gray-700 dark:text-gray-100">
              {code}
            </code>
            <CopyButton value={code} />
          </li>
        ))}
      </ul>
      <p className={`mt-2 ${muted}`}>
        Enter the code at checkout to claim your sponsor tickets:{' '}
        <a
          href={ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          {ticketUrl}
        </a>
      </p>
    </div>
  )
}

function Venue({ a }: { a: PortalAfterSigning }) {
  const dates = eventDates(a)
  if (!dates && !a.venueName && !a.venueAddress) return null
  return (
    <p className={muted}>
      {dates}
      {dates && (a.venueName || a.venueAddress) && ' at '}
      {[a.venueName, a.venueAddress].filter(Boolean).join(', ')}
    </p>
  )
}

export function PortalWhatHappensNext({ a }: { a: PortalAfterSigning }) {
  const invoice = invoiceText(a)
  return (
    <section className={card}>
      <h2 className={heading}>What happens next</h2>
      <ul className="mt-4 space-y-5">
        {invoice && (
          <li>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Invoice
            </h3>
            <p className={muted}>{invoice}</p>
          </li>
        )}
        {a.discountCodes.length > 0 && (
          <li>
            <PortalDiscountCodes a={a} />
          </li>
        )}
        {a.earlyAccessPath && a.workshopSponsorStart && a.workshopOpening && (
          <li>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Early access to workshop sign-up
            </h3>
            <p className={muted}>
              With your link, workshop sign-up opens on{' '}
              {formatRegistrationInstant(a.workshopSponsorStart)}. For everyone
              else it opens on {formatRegistrationInstant(a.workshopOpening)}{' '}
              (Oslo time). You may pass the link on to colleagues who are
              attending.
            </p>
            <a href={a.earlyAccessPath} className={`mt-1 inline-block ${link}`}>
              Open early access
            </a>
          </li>
        )}
        {eventDates(a) && (
          <li>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              The event
            </h3>
            <Venue a={a} />
          </li>
        )}
      </ul>
    </section>
  )
}

export function PortalAtTheEvent({ a }: { a: PortalAfterSigning }) {
  const contact = a.onsiteContact?.name
  const contactEmail = a.onsiteContact?.email || a.contactEmail
  return (
    <section className={card}>
      <h2 className={heading}>At the event</h2>
      <div className="mt-2">
        <Venue a={a} />
      </div>
      <div className="mt-4 space-y-5">
        <PortalDiscountCodes a={a} />
        {(contact || contactEmail) && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              On-site contact
            </h3>
            <p className={muted}>
              {[a.onsiteContact?.name].filter(Boolean).join(', ')}
              {contact && contactEmail && ', '}
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} className={link}>
                  {contactEmail}
                </a>
              )}
            </p>
          </div>
        )}
        {a.venueTravelInfo && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Getting to the venue
            </h3>
            <p className={`${muted} whitespace-pre-line`}>
              {a.venueTravelInfo}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export function PortalAfterTheEvent({
  a,
  conferenceName,
}: {
  a: PortalAfterSigning
  conferenceName?: string
}) {
  const to = a.sponsorEmail || a.contactEmail
  const subject = `Sponsoring ${conferenceName ?? 'the conference'} next year`
  const body =
    'Hi,\n\nWe would like to sponsor again next year. Please send us the details.\n'
  return (
    <section className={card}>
      <h2 className={heading}>Thank you for sponsoring</h2>
      <p className={`mt-2 ${muted}`}>
        {conferenceName ?? 'The conference'} would not have happened without
        you.
        {a.hasPhotoWall && (
          <>
            {' '}
            See the photos from the event on the{' '}
            <a href="/wall" className={link}>
              photo wall
            </a>
            .
          </>
        )}
      </p>
      {to && (
        <a
          href={`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
          className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
        >
          Sponsor again next year
        </a>
      )}
    </section>
  )
}
