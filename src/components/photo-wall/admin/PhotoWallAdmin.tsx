'use client'

import { useId, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { CopyLinkButton } from '@/components/feedback/FeedbackCodePanel'
import { useFeedbackQrPng } from '@/components/feedback/useFeedbackQrPng'
import {
  feedbackCodeDisplayUrl,
  renderFeedbackQrPng,
} from '@/lib/feedback/code-assets'
import type {
  PhotoWallAdminView,
  PhotoWallLinks,
  PostingMode,
} from '@/lib/photo-wall'

const CARD =
  'rounded-lg border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700 dark:bg-gray-800'
const BUTTON =
  'inline-flex min-h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

export interface PhotoWallSettingsChange {
  postingMode?: PostingMode
  sponsorStrip?: boolean
}

export interface PhotoWallAdminProps {
  view: PhotoWallAdminView
  conferenceTitle?: string
  onSetUp: () => void
  onChange: (change: PhotoWallSettingsChange) => void
  /** A Set up or a settings change is on its way. */
  saving?: boolean
  /** The last Set up or change failed. */
  failed?: boolean
}

/**
 * `/admin/photo-wall` (Photo Wall spec §10), M1: Set up, the Posting and
 * Sponsor strip switches, and the links with the posting QR. One column on a
 * phone, settings and links side by side on a wide screen.
 */
export function PhotoWallAdmin({
  view,
  conferenceTitle,
  onSetUp,
  onChange,
  saving = false,
  failed = false,
}: PhotoWallAdminProps) {
  const { wall } = view
  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<PhotoIcon />}
        title="Photo Wall"
        description="Attendees post photos from their phones. Nothing appears until an organizer approves it."
        contextHighlight={conferenceTitle}
      />
      {failed && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        >
          Couldn&apos;t save. Try again.
        </p>
      )}
      {wall ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section aria-labelledby="photo-wall-settings" className={CARD}>
            <h2
              id="photo-wall-settings"
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              Settings
            </h2>
            <div className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
              <PostingSetting
                mode={wall.postingMode}
                open={view.postingOpen}
                saving={saving}
                onChange={(postingMode) => onChange({ postingMode })}
              />
              <SponsorStripSetting
                on={wall.sponsorStrip}
                saving={saving}
                onChange={(sponsorStrip) => onChange({ sponsorStrip })}
              />
            </div>
          </section>
          <WallLinks links={view.links} />
        </div>
      ) : (
        <SetUp onSetUp={onSetUp} saving={saving} />
      )}
    </div>
  )
}

function SetUp({ onSetUp, saving }: { onSetUp: () => void; saving: boolean }) {
  return (
    <section className={`${CARD} max-w-xl`}>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
        No Photo Wall yet
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Attendees scan a QR code and post a photo with a caption. You approve
        each one before it shows on the public Wall page and the venue screens.
        The wall starts with posting paused, so nothing can be posted until you
        open it.
      </p>
      <button
        type="button"
        onClick={onSetUp}
        disabled={saving}
        className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-brand-cloud-blue px-4 text-sm font-semibold text-white shadow-xs hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-wait disabled:opacity-60 dark:bg-indigo-600 dark:hover:bg-indigo-500"
      >
        <PhotoIcon className="size-5" aria-hidden="true" />
        {saving ? 'Setting up…' : 'Set up the Photo Wall'}
      </button>
    </section>
  )
}

const MODES: { value: PostingMode; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'paused', label: 'Paused' },
]

function postingNote(mode: PostingMode, open: boolean): string {
  if (mode === 'paused')
    return 'The posting page says the wall isn’t open for photos.'
  return open
    ? 'Attendees can post. Posting closes by itself at the end of the conference’s last day.'
    : 'Posting has closed: the conference’s last day is over.'
}

function PostingSetting({
  mode,
  open,
  saving,
  onChange,
}: {
  mode: PostingMode
  open: boolean
  saving: boolean
  onChange: (mode: PostingMode) => void
}) {
  const labelId = useId()
  const noteId = useId()
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
          className="mt-1 text-sm text-gray-600 dark:text-gray-400"
        >
          {postingNote(mode, open)}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={noteId}
        className="inline-flex shrink-0 self-start rounded-lg bg-gray-100 p-1 dark:bg-gray-900"
      >
        {MODES.map((m) => {
          const checked = m.value === mode
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={saving}
              onClick={() => !checked && onChange(m.value)}
              className={`min-h-9 min-w-20 rounded-md px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-wait ${
                checked
                  ? m.value === 'open'
                    ? 'bg-green-600 text-white shadow-xs'
                    : 'bg-white text-gray-900 shadow-xs dark:bg-gray-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SponsorStripSetting({
  on,
  saving,
  onChange,
}: {
  on: boolean
  saving: boolean
  onChange: (on: boolean) => void
}) {
  const labelId = useId()
  const noteId = useId()
  return (
    <div className="flex items-start justify-between gap-4 pt-4">
      <div className="min-w-0">
        <p
          id={labelId}
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          Sponsor strip
        </p>
        <p
          id={noteId}
          className="mt-1 text-sm text-gray-600 dark:text-gray-400"
        >
          Show the conference&apos;s sponsors along the bottom of Screen Mode.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-describedby={noteId}
        disabled={saving}
        onClick={() => onChange(!on)}
        // 44×24 to look at; the `after` box makes the touch target 44×44.
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out after:absolute after:-inset-x-0.5 after:-inset-y-3 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-wait ${
          on
            ? 'bg-brand-cloud-blue dark:bg-indigo-500'
            : 'bg-gray-300 dark:bg-gray-600'
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

/** Hand the browser a file to save. */
function saveFile(name: string, href: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function WallLinks({ links }: { links: PhotoWallLinks }) {
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
    </section>
  )
}

function PostingLink({ url }: { url: string }) {
  // Drawn as the download is, so the organizer sees what they get.
  const { src, failed: drawFailed } = useFeedbackQrPng(url, 352)
  const [downloadFailed, setDownloadFailed] = useState(false)
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
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          Posting link
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Where attendees add their photo. Print the QR, or put it on a slide.
        </p>
        <DisplayUrl url={url} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={download} className={BUTTON}>
            <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
            Download QR (PNG)
          </button>
          <CopyLinkButton url={url} />
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
  return (
    <div className="space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        {title}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400">{note}</p>
      <DisplayUrl url={url} />
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noreferrer" className={BUTTON}>
          <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
          Open
        </a>
        <CopyLinkButton url={url} />
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
