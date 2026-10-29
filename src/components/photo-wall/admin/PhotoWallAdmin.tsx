'use client'

import { useId, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  Cog6ToothIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { CopyLinkButton } from '@/components/feedback/FeedbackCodePanel'
import { useFeedbackQrPng } from '@/components/feedback/useFeedbackQrPng'
import {
  feedbackCodeDisplayUrl,
  renderFeedbackQrPng,
} from '@/lib/feedback/code-assets'
import { formatConferenceDateShort } from '@/lib/time'
import type {
  PhotoWallAdminView,
  PhotoWallLinks,
  PhotoWallSettingsChange,
  PostingMode,
  PostingState,
  WallLook,
} from '@/lib/photo-wall'

export const CARD =
  'rounded-lg border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700 dark:bg-gray-800'
export const BUTTON =
  'inline-flex min-h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:border-gray-600 dark:focus:outline-indigo-400 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

export interface PhotoWallAdminProps {
  view: PhotoWallAdminView
  /**
   * `/admin/photo-wall/setup`: settings, links and the export. Otherwise
   * `/admin/photo-wall`: the moderation queue straight under the header.
   */
  setup?: boolean
  conferenceTitle?: string
  /** The schedule's rooms, one QR each (Talk photos spec §6.4). */
  rooms?: string[]
  onSetUp: () => void
  onChange: (change: PhotoWallSettingsChange) => void
  /** A Set up or a settings change is on its way. */
  saving?: boolean
  /** The change on its way: shown at once, the server's answer replaces it. */
  pending?: PhotoWallSettingsChange
  /** The last Set up or change failed. */
  failed?: boolean
  /** The moderation queue (M4a), under the header once the wall is set up. */
  queue?: ReactNode
  /** The consented ZIP export (P5), on Setup once the wall is set up. */
  marketingExport?: ReactNode
}

/**
 * `/admin/photo-wall` and its Setup page (Photo Wall spec §10). The header
 * carries the posting status with a quick Pause or Open on both. The main
 * page is the queue; Setup holds the Posting and Sponsor strip switches, the
 * Wall Look, the links with the posting QR and the export. One column on a
 * phone, settings and links side by side on a wide screen.
 */
export function PhotoWallAdmin({
  view,
  setup = false,
  conferenceTitle,
  rooms = [],
  onSetUp,
  onChange,
  saving = false,
  pending,
  failed = false,
  queue,
  marketingExport,
}: PhotoWallAdminProps) {
  const wall = view.wall && pending ? { ...view.wall, ...pending } : view.wall
  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={setup ? <Cog6ToothIcon /> : <PhotoIcon />}
        title={setup ? 'Photo Wall setup' : 'Photo Wall'}
        description={
          setup
            ? 'Posting, the screens’ look, and the links and QR codes to share.'
            : 'Attendees post photos from their phones. Organizers approve each photo before it appears; with Trusted posters on, organizers’ and confirmed speakers’ photos appear at once.'
        }
        contextHighlight={conferenceTitle}
        backLink={
          setup ? { href: '/admin/photo-wall', label: 'Photo Wall' } : undefined
        }
      />
      {/* Under the title rather than in `actions`: beside it, three controls
          squeeze the title to one word a line on a phone. */}
      {wall && (
        <div className="-mt-4 flex flex-wrap items-center gap-2">
          <PostingChip
            view={view}
            saving={saving || Boolean(pending?.postingMode)}
            onChange={(postingMode) => onChange({ postingMode })}
          />
          {!setup && (
            <Link href="/admin/photo-wall/setup" className={BUTTON}>
              <Cog6ToothIcon className="size-4" aria-hidden="true" />
              Setup
            </Link>
          )}
        </div>
      )}
      {!wall ? (
        <SetUp onSetUp={onSetUp} saving={saving} failed={failed} />
      ) : !setup ? (
        <>
          {failed && <SaveFailed />}
          {queue}
        </>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <section aria-labelledby="photo-wall-settings" className={CARD}>
              <div className="flex items-baseline justify-between gap-4">
                <h2
                  id="photo-wall-settings"
                  className="text-base font-semibold text-gray-900 dark:text-white"
                >
                  Settings
                </h2>
                <p
                  role="status"
                  className="text-sm text-gray-500 dark:text-gray-400"
                >
                  {saving ? 'Saving…' : ''}
                </p>
              </div>
              {/* In the card, next to the switch just pressed: on a phone the
                page top may be out of sight. */}
              {failed && <SaveFailed />}
              <div className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
                <PostingSetting
                  mode={wall.postingMode}
                  // Until the server answers, why posting is open or closed is
                  // not known yet.
                  state={pending?.postingMode ? 'saving' : view.posting}
                  saving={saving}
                  onChange={(postingMode) => onChange({ postingMode })}
                />
                <SwitchSetting
                  label="Sponsor strip"
                  note="Show the conference’s sponsors along the bottom of Screen Mode."
                  on={wall.sponsorStrip}
                  saving={saving}
                  onChange={(sponsorStrip) => onChange({ sponsorStrip })}
                />
                <SwitchSetting
                  label="Trusted posters skip approval"
                  note="Photos from organizers and confirmed speakers, signed in, go straight on the wall."
                  hint="New. Off on this wall until you turn it on."
                  on={wall.trustedPostersSkipApproval}
                  saving={saving}
                  onChange={(trustedPostersSkipApproval) =>
                    onChange({ trustedPostersSkipApproval })
                  }
                />
                <WallLookSetting
                  look={wall.look}
                  saving={saving}
                  onChange={(look) => onChange({ look })}
                />
              </div>
            </section>
            <WallLinks links={view.links} rooms={rooms} />
          </div>
          {marketingExport}
        </>
      )}
    </div>
  )
}

/** The header's posting status (§7), and the one switch most often needed. */
function PostingChip({
  view,
  saving,
  onChange,
}: {
  view: PhotoWallAdminView
  saving: boolean
  onChange: (mode: PostingMode) => void
}) {
  const state = view.posting
  const label =
    state === 'open'
      ? view.wall?.postingMode === 'auto'
        ? 'Open (automatic)'
        : 'Open'
      : state === 'paused'
        ? 'Paused'
        : state === 'notYetOpen'
          ? view.opensOn
            ? `Automatic, opens ${formatConferenceDateShort(view.opensOn)}`
            : 'Automatic, not open yet'
          : 'Closed'
  // Open does not beat an ended conference or a closed wall (§7).
  const next: PostingMode | null =
    state === 'open'
      ? 'paused'
      : state === 'ended' || state === 'noEndDate' || state === 'closed'
        ? null
        : 'open'
  return (
    <div className="flex items-center gap-2">
      <p
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ${
          state === 'open'
            ? 'bg-green-50 text-green-800 ring-green-600/30 dark:bg-green-400/10 dark:text-green-300 dark:ring-green-400/30'
            : 'bg-gray-50 text-gray-700 ring-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600'
        }`}
      >
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${state === 'open' ? 'bg-green-600' : 'bg-gray-400'}`}
        />
        Posting: {label}
      </p>
      {next && (
        <button
          type="button"
          // Not `disabled`, which would drop focus; a press while saving
          // changes nothing.
          aria-disabled={saving || undefined}
          onClick={() => !saving && onChange(next)}
          className={`${BUTTON} aria-disabled:cursor-wait`}
        >
          {next === 'paused' ? 'Pause posting' : 'Open posting'}
        </button>
      )}
    </div>
  )
}

function SaveFailed() {
  return (
    <p
      role="alert"
      className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
    >
      Couldn’t save. Try again.
    </p>
  )
}

function SetUp({
  onSetUp,
  saving,
  failed,
}: {
  onSetUp: () => void
  saving: boolean
  failed: boolean
}) {
  return (
    <section className={`${CARD} max-w-xl`}>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
        No Photo Wall yet
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Attendees scan a QR code and post a photo with a caption. You approve
        each one before it shows on the public Wall page and the venue screens.
        Posting opens by itself at 00:00 on the conference’s first day and
        closes at the end of its last (Oslo time); you can pause it, or open it
        early.
      </p>
      <button
        type="button"
        onClick={onSetUp}
        disabled={saving}
        // Tenant-branded: `bg-brand-cloud-blue` is an unlayered rule (light
        // and dark), so hover dims it rather than recolouring it.
        className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-brand-cloud-blue px-4 text-sm font-semibold text-white shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-wait disabled:opacity-60 dark:focus-visible:outline-indigo-400"
      >
        <PhotoIcon className="size-5" aria-hidden="true" />
        {saving ? 'Setting up…' : 'Set up the Photo Wall'}
      </button>
      {failed && <SaveFailed />}
    </section>
  )
}

const MODES: { value: PostingMode; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'open', label: 'Open' },
  { value: 'paused', label: 'Paused' },
]

/** What the Posting row says, and whether it is a warning (§7). */
const POSTING_NOTES: Record<
  PostingState | 'saving',
  { text: string; warn: boolean }
> = {
  saving: { text: 'Saving…', warn: false },
  open: {
    text: 'Attendees can post. Posting closes by itself at the end of the conference’s last day.',
    warn: false,
  },
  paused: {
    text: 'The posting page says the wall isn’t open for photos.',
    warn: false,
  },
  notYetOpen: {
    text: 'Posting opens by itself at 00:00 on the conference’s first day, and closes at the end of its last (Oslo time).',
    warn: false,
  },
  noStartDate: {
    text: 'Posting stays closed: the conference has no start date. Set one in Settings, or switch to Open.',
    warn: true,
  },
  datesReversed: {
    text: 'Posting stays closed: the conference’s last day is before its first. Fix the dates in Settings, or switch to Open.',
    warn: true,
  },
  ended: {
    text: 'Posting has closed: the conference’s last day is over.',
    warn: true,
  },
  noEndDate: {
    text: 'Posting stays closed: the conference has no end date. Set one in Settings.',
    warn: true,
  },
  closed: {
    text: 'This wall has closed, and its photos are being deleted.',
    warn: true,
  },
}

function PostingSetting({
  mode,
  state,
  saving,
  onChange,
}: {
  mode: PostingMode
  state: PostingState | 'saving'
  saving: boolean
  onChange: (mode: PostingMode) => void
}) {
  const labelId = useId()
  const noteId = useId()
  const name = useId()
  const note = POSTING_NOTES[state]
  return (
    <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p
          id={labelId}
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          Posting
        </p>
        <p
          id={noteId}
          className={`mt-1 text-sm ${
            note.warn
              ? 'font-medium text-amber-700 dark:text-amber-400'
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          {note.text}
        </p>
      </div>
      {/* Native radios: arrow keys move between them, and one tab stop. */}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={noteId}
        className="inline-flex shrink-0 self-start rounded-lg bg-gray-100 p-1 dark:bg-gray-900"
      >
        {MODES.map((m) => {
          const checked = m.value === mode
          return (
            <label
              key={m.value}
              className={`flex min-h-9 min-w-20 items-center justify-center rounded-md px-3 text-sm font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-cloud-blue dark:has-focus-visible:outline-indigo-400 ${
                saving ? 'cursor-wait' : 'cursor-pointer'
              } ${
                checked
                  ? m.value === 'open'
                    ? 'bg-green-700 text-white shadow-xs'
                    : 'bg-white text-gray-900 shadow-xs ring-1 ring-gray-500 dark:bg-gray-700 dark:text-white dark:ring-gray-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={m.value}
                checked={checked}
                // Not `disabled`: that would drop focus from the radio just
                // chosen. While a save runs, a choice changes nothing.
                aria-disabled={saving || undefined}
                onChange={() => !saving && onChange(m.value)}
                className="sr-only"
              />
              {m.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

/** An on/off setting (§10). `hint` shows while it is off (§6.6). */
function SwitchSetting({
  label,
  note,
  hint,
  on,
  saving,
  onChange,
}: {
  label: string
  note: string
  hint?: string
  on: boolean
  saving: boolean
  onChange: (on: boolean) => void
}) {
  const labelId = useId()
  const noteId = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p
          id={labelId}
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          {label}
        </p>
        <p
          id={noteId}
          className="mt-1 text-sm text-gray-600 dark:text-gray-400"
        >
          {note}
        </p>
        {hint && !on && (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-describedby={noteId}
        // Not `disabled`, which would drop focus; a press while saving
        // changes nothing.
        aria-disabled={saving || undefined}
        onClick={() => !saving && onChange(!on)}
        // 44×24 to look at; the `after` box makes the touch target 44×44.
        // Off is gray-500: 3:1 or more against both cards and the thumb
        // (WCAG 1.4.11), which gray-300 on white (1.5:1) was not.
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out after:absolute after:-inset-x-0.5 after:-inset-y-3 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait dark:focus-visible:outline-indigo-400 ${
          // Not bg-brand-cloud-blue: an unlayered `.dark` rule in tailwind.css
          // overrides any dark: variant of it, to 1.7:1 on the card.
          on ? 'bg-blue-700 dark:bg-indigo-500' : 'bg-gray-500'
        }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            on ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

const LOOKS: { value: WallLook; label: string; note: string }[] = [
  {
    value: 'pinboard',
    label: 'Pinboard',
    note: 'Tilted polaroids on a board.',
  },
  {
    value: 'mosaic',
    label: 'Mosaic',
    note: 'Whole photos edge to edge, one shown large.',
  },
  {
    value: 'spotlight',
    label: 'Spotlight',
    note: 'One large photo at a time, with what’s up next.',
  },
]

/** The Wall Look (§9, P3): the Wall page's and every screen's, unless a screen's link names its own. */
function WallLookSetting({
  look,
  saving,
  onChange,
}: {
  look: WallLook
  saving: boolean
  onChange: (look: WallLook) => void
}) {
  const labelId = useId()
  const noteId = useId()
  const name = useId()
  return (
    <div className="pt-4">
      <p
        id={labelId}
        className="text-sm font-medium text-gray-900 dark:text-white"
      >
        Wall Look
      </p>
      <p id={noteId} className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        How the Wall page and the screens show the photos. Running screens
        switch within seconds. One screen can show another look: add{' '}
        <code className="font-mono text-xs text-gray-800 dark:text-gray-200">
          ?look=mosaic
        </code>{' '}
        to its link.
      </p>
      {/* Native radios: arrow keys move between them, and one tab stop. */}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={noteId}
        className="mt-3 grid gap-2 sm:grid-cols-3"
      >
        {LOOKS.map((l) => {
          const checked = l.value === look
          return (
            <label
              key={l.value}
              className={`flex flex-col rounded-md border p-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-cloud-blue dark:has-focus-visible:outline-indigo-400 ${
                saving ? 'cursor-wait' : 'cursor-pointer'
              } ${
                // Not brand-cloud-blue: an unlayered rule beats dark: variants.
                checked
                  ? 'border-blue-700 bg-blue-50 ring-1 ring-blue-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-400'
                  : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={l.value}
                checked={checked}
                // Not `disabled`: that would drop focus from the radio just
                // chosen. While a save runs, a choice changes nothing.
                aria-disabled={saving || undefined}
                onChange={() => !saving && onChange(l.value)}
                className="sr-only"
              />
              <span className="font-semibold text-gray-900 dark:text-white">
                {l.label}
              </span>
              <span className="mt-0.5 text-gray-600 dark:text-gray-400">
                {l.note}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/** Hand the browser a file to save. */
function saveFile(name: string, href: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function WallLinks({
  links,
  rooms,
}: {
  links: PhotoWallLinks
  rooms: string[]
}) {
  return (
    <section aria-labelledby="photo-wall-links" className={`${CARD} space-y-5`}>
      <h2
        id="photo-wall-links"
        className="text-base font-semibold text-gray-900 dark:text-white"
      >
        Links
      </h2>
      <PostingLink url={links.post} />
      <LinkRow
        title="Wall page"
        note="The approved photos, for phones and laptops."
        url={links.wall}
      />
      <LinkRow
        title="Screen Mode"
        note="Open on the venue screen, fullscreen."
        url={links.screen}
      />
      {rooms.length > 0 && <RoomQrs post={links.post} rooms={rooms} />}
    </section>
  )
}

/** One QR per room, preselecting it in the composer (Talk photos spec §6.4). */
function RoomQrs({ post, rooms }: { post: string; rooms: string[] }) {
  return (
    <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        Room signs
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Print one for each room. Scanning it picks that room, so the photo is
        tagged with the talk running there.
      </p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {rooms.map((room) => (
          <RoomQr
            key={room}
            room={room}
            url={`${post}?room=${encodeURIComponent(room)}`}
          />
        ))}
      </ul>
    </div>
  )
}

function RoomQr({ room, url }: { room: string; url: string }) {
  const { src, failed: drawFailed } = useFeedbackQrPng(url, 256)
  const [downloadFailed, setDownloadFailed] = useState(false)
  const nameId = useId()
  const download = () => {
    setDownloadFailed(false)
    renderRoomSign(url, room)
      .then((dataUrl) => saveFile(`photo-wall-qr-${slug(room)}.png`, dataUrl))
      .catch(() => setDownloadFailed(true))
  }
  return (
    <li className="min-w-0 space-y-2">
      <div className="aspect-square w-full rounded-md bg-white ring-1 ring-gray-200 dark:ring-gray-700">
        {src ? (
          <img
            src={src}
            alt={`QR code for posting from ${room}`}
            className="size-full [image-rendering:pixelated]"
          />
        ) : drawFailed ? (
          <p className="flex size-full items-center p-2 text-center text-xs text-gray-600">
            The QR code could not be drawn.
          </p>
        ) : (
          <div className="size-full animate-pulse rounded bg-gray-100" />
        )}
      </div>
      <p
        id={nameId}
        className="text-sm font-semibold [overflow-wrap:anywhere] text-gray-900 dark:text-white"
      >
        {room}
      </p>
      <button
        type="button"
        onClick={download}
        aria-describedby={nameId}
        className={BUTTON}
      >
        <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
        PNG
      </button>
      {downloadFailed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          The QR code could not be drawn.
        </p>
      )}
    </li>
  )
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'room'

/** The room's QR with its name printed below, as a PNG data URL. */
async function renderRoomSign(url: string, room: string): Promise<string> {
  const size = 1024
  const qr = new Image()
  qr.src = await renderFeedbackQrPng(url, size)
  await qr.decode()
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size + 160
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(qr, 0, 0)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 72px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(room, size / 2, size + 90, size - 64)
  return canvas.toDataURL('image/png')
}

function PostingLink({ url }: { url: string }) {
  // Drawn as the download is, so the organizer sees what they get.
  const { src, failed: drawFailed } = useFeedbackQrPng(url, 352)
  const [downloadFailed, setDownloadFailed] = useState(false)
  const titleId = useId()
  const download = () => {
    setDownloadFailed(false)
    renderFeedbackQrPng(url)
      .then((dataUrl) => saveFile('photo-wall-qr.png', dataUrl))
      .catch(() => setDownloadFailed(true))
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="size-40 shrink-0 rounded-md bg-white ring-1 ring-gray-200 dark:ring-gray-700">
        {src ? (
          <img
            src={src}
            alt="QR code for the posting link"
            className="size-full [image-rendering:pixelated]"
          />
        ) : drawFailed ? (
          <p className="flex size-full items-center p-3 text-center text-sm text-gray-600">
            The QR code could not be drawn. Share the link instead.
          </p>
        ) : (
          <div className="size-full animate-pulse rounded bg-gray-100" />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p
          id={titleId}
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          Posting link
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Where attendees add their photo. Print the QR, or put it on a slide.
        </p>
        <DisplayUrl url={url} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            aria-describedby={titleId}
            className={BUTTON}
          >
            <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
            Download QR (PNG)
          </button>
          <CopyLinkButton url={url} describedBy={titleId} />
        </div>
        {downloadFailed && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            The QR code could not be drawn. Share the link instead.
          </p>
        )}
      </div>
    </div>
  )
}

function LinkRow({
  title,
  note,
  url,
}: {
  title: string
  note: string
  url: string
}) {
  // Three Copy buttons and two Open links share a name: each is described
  // by its row's title, so a screen reader can tell them apart.
  const titleId = useId()
  return (
    <div className="space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">
      <p
        id={titleId}
        className="text-sm font-medium text-gray-900 dark:text-white"
      >
        {title}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400">{note}</p>
      <DisplayUrl url={url} />
      <div className="flex flex-wrap gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-describedby={titleId}
          className={BUTTON}
        >
          <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
          Open
        </a>
        <CopyLinkButton url={url} describedBy={titleId} />
      </div>
    </div>
  )
}

function DisplayUrl({ url }: { url: string }) {
  return (
    <p className="font-mono text-xs [overflow-wrap:anywhere] text-gray-700 sm:text-sm dark:text-gray-300">
      {feedbackCodeDisplayUrl(url)}
    </p>
  )
}
