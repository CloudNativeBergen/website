'use client'

/**
 * PROTOTYPE — throwaway. Answers "how do speakers get their Feedback Code and
 * read their Session Feedback?" (wayfinder ticket #1421). Three structurally
 * different variants. Mock data only; no network. Lives on branch
 * prototype/speaker-feedback-speaker-view; never merged.
 */
import { useEffect, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowsPointingOutIcon,
  ChatBubbleLeftRightIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  FlagIcon,
  PrinterIcon,
  QrCodeIcon,
  SignalIcon,
} from '@heroicons/react/24/outline'

export type Phase = 'unscheduled' | 'before' | 'live' | 'closed'
type Colour = 'green' | 'yellow' | 'red'

export interface Comment {
  id: string
  colour: Colour
  text: string
  at: string
}

export interface SpeakerFeedbackProps {
  variant: 'A' | 'B' | 'C'
  phase: Phase
  url: string
  slot?: string
  closesAt?: string
  digital: Record<Colour, number>
  cards?: Record<Colour, number>
  comments: Comment[]
}

const LABEL: Record<Colour, string> = {
  green: 'Loved it',
  yellow: 'It was OK',
  red: 'Not for me',
}
const BAR: Record<Colour, string> = {
  green: 'bg-green-600',
  yellow: 'bg-yellow-400',
  red: 'bg-red-600',
}
const TEXT: Record<Colour, string> = {
  green: 'text-green-700 dark:text-green-400',
  yellow: 'text-yellow-700 dark:text-yellow-400',
  red: 'text-red-700 dark:text-red-400',
}
const COLOURS: Colour[] = ['green', 'yellow', 'red']

const card =
  'rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800'

function total(c?: Record<Colour, number>) {
  return c ? c.green + c.yellow + c.red : 0
}
function combined(p: SpeakerFeedbackProps): Record<Colour, number> {
  return {
    green: p.digital.green + (p.cards?.green ?? 0),
    yellow: p.digital.yellow + (p.cards?.yellow ?? 0),
    red: p.digital.red + (p.cards?.red ?? 0),
  }
}

function QR({ url, size = 160 }: { url: string; size?: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toString(url, { type: 'svg', margin: 1 }).then(setSvg),
    )
  }, [url])
  return (
    <div
      className="rounded bg-white p-1"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function codeState(p: SpeakerFeedbackProps) {
  switch (p.phase) {
    case 'unscheduled':
      return {
        dot: 'bg-gray-400',
        text: 'Opens once your session is scheduled',
      }
    case 'before':
      return {
        dot: 'bg-gray-400',
        text: `Opens when your session starts (${p.slot})`,
      }
    case 'live':
      return {
        dot: 'bg-green-500 animate-pulse',
        text: `Open until ${p.closesAt}`,
      }
    case 'closed':
      return { dot: 'bg-gray-400', text: 'Closed' }
  }
}

function CodeState(p: SpeakerFeedbackProps) {
  const s = codeState(p)
  return (
    <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <span className={`size-2 rounded-full ${s.dot}`} />
      {s.text}
    </p>
  )
}

function DownloadButtons({ compact = false }: { compact?: boolean }) {
  const btn =
    'inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn}>
        <ArrowDownTrayIcon className="size-4" /> PNG for slides
      </button>
      {!compact && (
        <button className={btn}>
          <ArrowDownTrayIcon className="size-4" /> SVG
        </button>
      )}
      <button className={btn}>
        <PrinterIcon className="size-4" /> Print sheet
      </button>
      <button className={btn}>
        <ClipboardDocumentIcon className="size-4" /> Copy link
      </button>
    </div>
  )
}

function Bar({ counts }: { counts: Record<Colour, number> }) {
  const t = total(counts) || 1
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
      {COLOURS.map((c) => (
        <div
          key={c}
          className={BAR[c]}
          style={{ width: `${(counts[c] / t) * 100}%` }}
        />
      ))}
    </div>
  )
}

function Totals({
  p,
  big = false,
}: {
  p: SpeakerFeedbackProps
  big?: boolean
}) {
  const [split, setSplit] = useState(false)
  const all = combined(p)
  return (
    <div>
      <Bar counts={all} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {COLOURS.map((c) => (
          <div key={c}>
            <div
              className={`${big ? 'text-4xl' : 'text-2xl'} font-bold ${TEXT[c]}`}
            >
              {all[c]}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {LABEL[c]}
            </div>
            {split && (
              <div className="mt-1 text-[11px] text-gray-500">
                {p.digital[c]} scanned · {p.cards?.[c] ?? 0} cards
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>
          {total(all)} responses · {p.comments.length} comments
        </span>
        {p.cards && (
          <button className="underline" onClick={() => setSplit((s) => !s)}>
            {split ? 'Hide breakdown' : 'Scanned vs cards'}
          </button>
        )}
      </p>
    </div>
  )
}

function Comments({ items }: { items: Comment[] }) {
  const [flagged, setFlagged] = useState<string[]>([])
  if (!items.length)
    return <p className="text-sm text-gray-500">No comments yet.</p>
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
      {items.map((c) => (
        <li key={c.id} className="flex gap-3 py-3">
          <span
            className={`mt-1.5 size-2.5 shrink-0 rounded-full ${BAR[c.colour]}`}
            title={LABEL[c.colour]}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-800 dark:text-gray-200">{c.text}</p>
            <p className="mt-1 text-xs text-gray-500">
              {LABEL[c.colour]} · {c.at}
            </p>
          </div>
          <button
            className={`h-fit shrink-0 rounded p-1 ${flagged.includes(c.id) ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
            aria-label="Flag for organizers"
            title={
              flagged.includes(c.id)
                ? 'Flagged for organizers'
                : 'Flag for organizers'
            }
            onClick={() =>
              setFlagged((f) => (f.includes(c.id) ? f : [...f, c.id]))
            }
          >
            <FlagIcon className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function NotYet({ p }: { p: SpeakerFeedbackProps }) {
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">
      {p.phase === 'unscheduled'
        ? 'Your feedback appears here after your session, once it is on the schedule.'
        : `Your feedback appears here when your session ends (${p.slot}).`}
    </p>
  )
}

const feedbackVisible = (p: SpeakerFeedbackProps) =>
  p.phase === 'live' || p.phase === 'closed'

function Live({ p }: { p: SpeakerFeedbackProps }) {
  if (p.phase !== 'live') return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <SignalIcon className="size-3.5" /> Live
    </span>
  )
}

/** Stand-in for the proposal form that fills the page's main column today. */
function FormPlaceholder() {
  return (
    <div className={`${card} space-y-3`}>
      <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-9 rounded bg-gray-100 dark:bg-gray-700/60" />
      <div className="h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-24 rounded bg-gray-100 dark:bg-gray-700/60" />
      <p className="text-xs text-gray-400">(proposal form — unchanged)</p>
    </div>
  )
}

function PageTitle({ title }: { title: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        KRO-nicles: Composing Kubernetes Resources Without the Glue Code
      </p>
    </div>
  )
}

/**
 * A — Sidebar cards. Today's layout: two cards in the proposal page's right
 * column (Feedback Code; Session Feedback replacing the card-count panel).
 * Below `lg` the sidebar is hidden today, so here the cards drop under the form.
 */
function VariantSidebar(p: SpeakerFeedbackProps) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Edit Proposal" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <FormPlaceholder />
        </div>
        <div className="w-full shrink-0 space-y-6 lg:w-80">
          <div className={card}>
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <QrCodeIcon className="size-5" /> Feedback Code
            </h3>
            <div className="flex gap-4">
              <QR url={p.url} size={112} />
              <div className="min-w-0 space-y-2">
                <CodeState {...p} />
                <p className="truncate text-xs text-gray-500">{p.url}</p>
              </div>
            </div>
            <div className="mt-4">
              <DownloadButtons compact />
            </div>
          </div>
          <div className={card}>
            <h3 className="mb-3 flex items-center justify-between font-semibold text-gray-900 dark:text-white">
              <span className="flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="size-5" /> Session Feedback
              </span>
              <Live p={p} />
            </h3>
            {feedbackVisible(p) ? (
              <>
                <Totals p={p} />
                <div className="mt-4 max-h-80 overflow-y-auto">
                  <Comments items={p.comments} />
                </div>
              </>
            ) : (
              <NotYet p={p} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * B — Feedback section at the top of the proposal page. One full-width panel
 * above the form, mobile first: the code before the session, the results
 * (with the code tucked into a tab) after it.
 */
function VariantSection(p: SpeakerFeedbackProps) {
  const [tab, setTab] = useState<'feedback' | 'code'>(
    feedbackVisible(p) ? 'feedback' : 'code',
  )
  const tabBtn = (t: typeof tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`border-b-2 px-1 pb-2 text-sm font-medium ${
        tab === t
          ? 'border-blue-600 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Edit Proposal" />
      <section className={`${card} mb-6`}>
        <div className="mb-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-6">
            {tabBtn(
              'feedback',
              `Session Feedback${feedbackVisible(p) ? ` (${total(combined(p))})` : ''}`,
            )}
            {tabBtn('code', 'Feedback Code')}
          </div>
          <Live p={p} />
        </div>
        {tab === 'code' ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <QR url={p.url} size={180} />
            <div className="space-y-3">
              <CodeState {...p} />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Put this on your last slide or print the sheet for the room.
                Attendees scan it and answer in one tap; it&apos;s anonymous.
              </p>
              <p className="text-xs break-all text-gray-500">{p.url}</p>
              <DownloadButtons />
            </div>
          </div>
        ) : feedbackVisible(p) ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
            <Totals p={p} big />
            <Comments items={p.comments} />
          </div>
        ) : (
          <NotYet p={p} />
        )}
      </section>
      <FormPlaceholder />
    </div>
  )
}

/**
 * C — Own page. The dashboard's proposal row gets a one-line feedback chip;
 * the chip opens /cfp/proposal/[id]/feedback, a page that is only about the
 * session: results first, the code below with a full-screen "Present" mode.
 */
function VariantPage(p: SpeakerFeedbackProps) {
  const [present, setPresent] = useState(false)
  const all = combined(p)
  const greenShare = total(all) ? Math.round((all.green / total(all)) * 100) : 0
  if (present)
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 dark:bg-gray-950">
        <QR url={p.url} size={300} />
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          How was this session?
        </p>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          {p.url.replace('https://', '')}
        </p>
        <button className="text-sm underline" onClick={() => setPresent(false)}>
          Close
        </button>
      </div>
    )
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Dashboard row (/cfp/list)
        </p>
        <div className={`${card} flex items-center gap-3 !p-3`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
              KRO-nicles: Composing Kubernetes Resources…
            </p>
            <p className="text-xs text-gray-500">Talk · Confirmed</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-2 py-1 text-xs dark:border-gray-600">
            {feedbackVisible(p) ? (
              <>
                <span className="size-2 rounded-full bg-green-600" />
                {greenShare}% loved it · {total(all)}
              </>
            ) : (
              <>
                <QrCodeIcon className="size-3.5" /> Feedback Code
              </>
            )}
          </span>
          <ChevronRightIcon className="size-4 text-gray-400" />
        </div>
      </div>
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        Opens /cfp/proposal/[id]/feedback
      </p>
      <PageTitle title="Session Feedback" />
      {feedbackVisible(p) ? (
        <>
          <section className={card}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {greenShare}%{' '}
                <span className="text-base font-medium text-gray-500">
                  loved it
                </span>
              </p>
              <Live p={p} />
            </div>
            <Totals p={p} />
          </section>
          <section className={card}>
            <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
              Comments ({p.comments.length})
            </h3>
            <Comments items={p.comments} />
          </section>
        </>
      ) : (
        <section className={card}>
          <NotYet p={p} />
        </section>
      )}
      <section className={card}>
        <h3 className="mb-3 flex items-center justify-between font-semibold text-gray-900 dark:text-white">
          <span className="flex items-center gap-2">
            <QrCodeIcon className="size-5" /> Your Feedback Code
          </span>
          <button
            onClick={() => setPresent(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <ArrowsPointingOutIcon className="size-4" /> Present
          </button>
        </h3>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <QR url={p.url} size={140} />
          <div className="space-y-3">
            <CodeState {...p} />
            <DownloadButtons />
          </div>
        </div>
      </section>
    </div>
  )
}

export function SpeakerFeedbackPrototype(props: SpeakerFeedbackProps) {
  const V = { A: VariantSidebar, B: VariantSection, C: VariantPage }[
    props.variant
  ]
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 dark:bg-gray-900">
      <V {...props} />
    </div>
  )
}
