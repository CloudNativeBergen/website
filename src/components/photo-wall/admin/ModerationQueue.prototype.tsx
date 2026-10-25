'use client'

/**
 * THROWAWAY PROTOTYPE (wayfinder #1571, Content Judgement): how a Judgement
 * looks on the Photo Wall moderation queue. Never merged. No tRPC, no
 * mutations: fixture posts and local state. Copies the shapes of
 * `ModerationQueue.tsx` and `WallPostCard.tsx` so it looks like the real
 * queue, and strips the focus rule, inline confirms and polling.
 *
 * Three variants, chosen per story:
 * - `badge`: a strip on the existing card; the queue's order is unchanged.
 * - `sections`: Pending is split into Check first / Looks fine / Not judged,
 *   strongest flag first, and Approve all is scoped to Looks fine.
 * - `covered`: a flagged photo is blurred behind its reason until tapped;
 *   a flagged caption is marked inline.
 */

import { useState, type ReactNode } from 'react'
import { CheckBadgeIcon } from '@heroicons/react/24/solid'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  MinusCircleIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import {
  MODERATION_TABS,
  MODERATION_TAB_LABELS,
  allowsFrom,
  countByTab,
  cropOutline,
  postsInTab,
  type ModerationPhoto,
  type ModerationPost,
  type ModerationTab,
  type WallPostCrop,
} from '@/lib/photo-wall'
import { formatConferenceDayTime } from '@/lib/time'

// ---------------------------------------------------------------------------
// The Judgement, as the prototype imagines the queue read carrying it
// ---------------------------------------------------------------------------

export const REASONS = ['abusive', 'sexual', 'spam', 'personal_info'] as const
export type Reason = (typeof REASONS)[number]
/** Jev's four yes/no answers, each a probability. */
export type Answers = Record<Reason, number>

/** One judged part of a Wall Post, or that part not judged. */
export type Judged = { judged: true; answers: Answers } | { judged: false }

/**
 * The two Judgements one call gives a Wall Post (#1570): the caption's and
 * the photo's. `caption` is absent when the post has no caption.
 */
export interface PostJudgement {
  caption?: Judged
  photo: Judged
}

/** A Wall Post with its Judgement; absent on a `deleting` post. */
export interface JudgedPost extends ModerationPost {
  judgement?: PostJudgement
}

export type Part = 'caption' | 'photo'

export interface Flag {
  on: Part
  reason: Reason
  score: number
}

/** The advice threshold: any answer at or above it raises the flag. */
export const FLAG_AT = 0.5

/** The flags a Judgement raises, strongest first. */
export function flagsOf(judgement: PostJudgement): Flag[] {
  const flags: Flag[] = []
  for (const on of ['caption', 'photo'] as const) {
    const part = judgement[on]
    if (!part?.judged) continue
    for (const reason of REASONS) {
      const score = part.answers[reason]
      if (score >= FLAG_AT) flags.push({ on, reason, score })
    }
  }
  return flags.sort((a, b) => b.score - a.score)
}

export type Verdict =
  | { kind: 'unsafe'; flags: Flag[] }
  | { kind: 'fine' }
  | { kind: 'notJudged'; parts: Part[] }

/** What the card says about a Judgement, in one word. */
export function verdictOf(judgement: PostJudgement): Verdict {
  const flags = flagsOf(judgement)
  if (flags.length > 0) return { kind: 'unsafe', flags }
  const parts = (['caption', 'photo'] as const).filter(
    (on) => judgement[on] && !judgement[on].judged,
  )
  if (parts.length > 0) return { kind: 'notJudged', parts }
  return { kind: 'fine' }
}

/** Plain organizer copy per reason, per part. No "AI" words. */
const REASON_COPY: Record<Part, Record<Reason, string>> = {
  caption: {
    abusive: 'may be abusive',
    sexual: 'may be sexual',
    spam: 'may be an ad or spam',
    personal_info: 'may contain a phone number, email or address',
  },
  photo: {
    sexual: 'may show nudity',
    abusive: 'may show harassment, a hate symbol or gore',
    spam: 'may be an ad or a QR-code lure',
    personal_info: 'may show a readable badge, ID or screen',
  },
}

/** The short form, for a chip. */
const REASON_SHORT: Record<Part, Record<Reason, string>> = {
  caption: {
    abusive: 'abusive',
    sexual: 'sexual',
    spam: 'ad or spam',
    personal_info: 'phone, email or address',
  },
  photo: {
    sexual: 'nudity',
    abusive: 'hate symbol or gore',
    spam: 'ad or QR lure',
    personal_info: 'readable badge or ID',
  },
}

const pctOf = (score: number) => `${Math.round(score * 100)}%`
const PART_LABEL: Record<Part, string> = { caption: 'Caption', photo: 'Photo' }

/** "Caption may contain a phone number, email or address (91%)". */
export const flagSentence = (flag: Flag) =>
  `${PART_LABEL[flag.on]} ${REASON_COPY[flag.on][flag.reason]} (${pctOf(flag.score)})`

/** "photo: nudity 78%". */
const flagChip = (flag: Flag) =>
  `${flag.on}: ${REASON_SHORT[flag.on][flag.reason]} ${pctOf(flag.score)}`

const notJudgedCopy = (parts: Part[]) =>
  parts.length === 2
    ? 'Not judged'
    : parts[0] === 'photo'
      ? 'Photo not judged'
      : 'Caption not judged'

// ---------------------------------------------------------------------------
// Variant A and B: the strip on the card
// ---------------------------------------------------------------------------

export type Variant = 'badge' | 'sections' | 'covered'

/** A human already decided: the flag is history, not advice. */
const decided = (status: ModerationPost['status']) => status !== 'pending'

const PILL =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium'
const PILL_FINE = `${PILL} text-gray-500 dark:text-gray-400`
const PILL_NOT_JUDGED = `${PILL} border border-dashed border-gray-400 text-gray-600 dark:border-gray-500 dark:text-gray-300`
const PILL_HISTORY = `${PILL} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300`

/**
 * One line under the photo (variant A, and the Check first cards of B):
 * amber "Check first" with every flag; a quiet check for Looks fine; a
 * dashed pill for Not judged. After a decision the flag is kept, grey.
 */
function JudgementStrip({
  judgement,
  status,
  omitFine = false,
}: {
  judgement: PostJudgement
  status: ModerationPost['status']
  /** The section already says Looks fine / Not judged (variant B). */
  omitFine?: boolean
}) {
  const verdict = verdictOf(judgement)
  if (verdict.kind === 'unsafe') {
    if (decided(status)) {
      return (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span className={PILL_HISTORY}>
            <ExclamationTriangleIcon className="size-3.5" aria-hidden="true" />
            Flagged before {status === 'approved' ? 'approval' : 'decision'}
          </span>
          <span>{verdict.flags.map(flagChip).join(' · ')}</span>
        </p>
      )
    }
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="flex items-center gap-1.5 font-semibold">
          <ExclamationTriangleIcon
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          Check first
        </p>
        <ul className="mt-0.5 space-y-0.5 pl-5.5">
          {verdict.flags.map((flag) => (
            <li key={`${flag.on}-${flag.reason}`}>{flagSentence(flag)}</li>
          ))}
        </ul>
      </div>
    )
  }
  if (omitFine) return null
  if (verdict.kind === 'notJudged') {
    return (
      <p>
        <span className={PILL_NOT_JUDGED}>
          <MinusCircleIcon className="size-3.5" aria-hidden="true" />
          {notJudgedCopy(verdict.parts)}
        </span>
      </p>
    )
  }
  return (
    <p>
      <span className={PILL_FINE}>
        <CheckCircleIcon className="size-3.5" aria-hidden="true" />
        Looks fine
      </span>
    </p>
  )
}

// ---------------------------------------------------------------------------
// Variant C: the covered photo and the marked caption
// ---------------------------------------------------------------------------

const PHONE_OR_EMAIL = /(\+?\d[\d  -]{5,}\d|\S+@\S+\.\S+)/g

/**
 * The caption with its flags marked inline. Jev gives no spans, so a
 * personal_info flag marks digit runs and emails (what the reason names),
 * and any other reason marks the whole caption. A chip after the text says
 * why. After a decision the mark is grey.
 */
function MarkedCaption({
  caption,
  flags,
  status,
}: {
  caption: string
  flags: Flag[]
  status: ModerationPost['status']
}) {
  const mark = decided(status)
    ? 'rounded-sm bg-gray-200 px-0.5 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
    : 'rounded-sm bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-400/40 dark:text-amber-50'
  const chip = decided(status)
    ? PILL_HISTORY
    : `${PILL} bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200`
  const own = flags.filter((f) => f.on === 'caption')
  let body: ReactNode = caption
  if (own.length > 0) {
    const onlyPersonal = own.every((f) => f.reason === 'personal_info')
    if (onlyPersonal) {
      const parts = caption.split(PHONE_OR_EMAIL)
      body = parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={mark}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )
    } else {
      body = <mark className={mark}>{caption}</mark>
    }
  }
  return (
    <p
      dir="auto"
      className="text-sm wrap-anywhere text-gray-900 dark:text-white"
    >
      {body}
      {own.map((flag) => (
        <span key={flag.reason} className={`${chip} ml-1.5 align-middle`}>
          {decided(status) ? 'was flagged: ' : ''}
          {REASON_COPY.caption[flag.reason]} · {pctOf(flag.score)}
        </span>
      ))}
    </p>
  )
}

/**
 * The flagged photo blurred behind its reason, with Show photo. Only
 * while pending: once a human decided, the photo is plain.
 */
function Cover({ flags, onShow }: { flags: Flag[]; onShow: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900/40 p-4 text-center text-white">
      <EyeSlashIcon className="size-8" aria-hidden="true" />
      <p className="text-sm font-semibold text-balance">
        {flags
          .map(
            (f) =>
              `${REASON_COPY.photo[f.reason].replace(/^may /, 'May ')} (${pctOf(f.score)})`,
          )
          .join(' · ')}
      </p>
      <button
        type="button"
        onClick={onShow}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-white/90 px-3 text-sm font-semibold text-gray-900 shadow-xs hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <EyeIcon className="size-4" aria-hidden="true" />
        Show photo
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The card (a copy of WallPostCard with a Judgement slot per variant)
// ---------------------------------------------------------------------------

export type PostAction = 'approve' | 'reject' | 'remove' | 'delete'

const BUTTON =
  'inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-semibold shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:focus-visible:outline-indigo-400'
const PRIMARY = `${BUTTON} bg-green-700 text-white hover:bg-green-800`
const SECONDARY = `${BUTTON} bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 ring-inset dark:bg-gray-700 dark:text-white dark:ring-gray-500 dark:hover:bg-gray-600`
const DANGER_QUIET = `${BUTTON} bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50 ring-inset dark:bg-gray-800 dark:text-red-400 dark:ring-red-500/60 dark:hover:bg-red-950`

const LABELS: Record<PostAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  remove: 'Remove',
  delete: 'Delete now',
}

const actionsFor = (status: ModerationPost['status']): PostAction[] => [
  ...(['approve', 'reject', 'remove'] as const).filter((action) =>
    allowsFrom(action, status),
  ),
  'delete',
]

export function PrototypeCard({
  post,
  variant,
  onAction,
}: {
  post: JudgedPost
  variant: Variant
  onAction: (post: JudgedPost, action: PostAction) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const judgement = post.judgement
  const flags = judgement ? flagsOf(judgement) : []
  const photoFlags = flags.filter((f) => f.on === 'photo')
  const verdict = judgement ? verdictOf(judgement) : null
  const covered =
    variant === 'covered' &&
    photoFlags.length > 0 &&
    !decided(post.status) &&
    !revealed
  const photoNotJudged =
    variant === 'covered' && judgement && !judgement.photo.judged

  return (
    <article
      aria-label={post.caption ?? undefined}
      className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      {post.photo ? (
        <Photo
          photo={post.photo}
          crop={post.crop}
          name={post.name}
          blurred={covered}
          cover={
            covered ? (
              <Cover flags={photoFlags} onShow={() => setRevealed(true)} />
            ) : (
              variant === 'covered' &&
              photoFlags.length > 0 &&
              !decided(post.status) && (
                <button
                  type="button"
                  onClick={() => setRevealed(false)}
                  className="absolute top-2 right-2 inline-flex min-h-8 items-center gap-1 rounded-md bg-gray-900/70 px-2 text-xs font-semibold text-white"
                >
                  <EyeSlashIcon className="size-3.5" aria-hidden="true" />
                  Hide
                </button>
              )
            )
          }
          corner={
            photoNotJudged ? (
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md border border-dashed border-white/80 bg-gray-900/60 px-2 py-0.5 text-xs font-medium text-white">
                <MinusCircleIcon className="size-3.5" aria-hidden="true" />
                Photo not judged
              </span>
            ) : null
          }
        />
      ) : (
        <NoPhoto />
      )}
      <div className="space-y-1.5 p-3 sm:p-4">
        {post.status === 'deleting' && (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Couldn’t delete. Try again.
          </p>
        )}
        {judgement && variant !== 'covered' && (
          <JudgementStrip
            judgement={judgement}
            status={post.status}
            omitFine={variant === 'sections' && post.status === 'pending'}
          />
        )}
        {post.caption &&
          (variant === 'covered' ? (
            <MarkedCaption
              caption={post.caption}
              flags={flags}
              status={post.status}
            />
          ) : (
            <p
              dir="auto"
              className="text-sm wrap-anywhere text-gray-900 dark:text-white"
            >
              {post.caption}
            </p>
          ))}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
          {post.name && (
            <span
              dir="auto"
              className="font-medium wrap-anywhere text-gray-900 dark:text-gray-200"
            >
              {post.name}
            </span>
          )}
          {post.submittedAt && (
            <time dateTime={post.submittedAt}>
              {formatConferenceDayTime(post.submittedAt)}
            </time>
          )}
          {post.marketingConsent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-800 ring-1 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-400/30">
              <CheckBadgeIcon className="size-3.5" aria-hidden="true" />
              Marketing OK
            </span>
          )}
          {/* Variant C keeps the quiet verdicts in the meta row. */}
          {variant === 'covered' && verdict?.kind === 'fine' && (
            <span className={PILL_FINE}>
              <CheckCircleIcon className="size-3.5" aria-hidden="true" />
              Looks fine
            </span>
          )}
          {variant === 'covered' &&
            verdict?.kind === 'notJudged' &&
            verdict.parts.length === 2 && (
              <span className={PILL_NOT_JUDGED}>
                <MinusCircleIcon className="size-3.5" aria-hidden="true" />
                Not judged
              </span>
            )}
          {/* Revealed: the reason moves down here so Show photo loses nothing. */}
          {variant === 'covered' &&
            !decided(post.status) &&
            revealed &&
            photoFlags.length > 0 && (
              <span
                className={`${PILL} bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200`}
              >
                <ExclamationTriangleIcon
                  className="size-3.5"
                  aria-hidden="true"
                />
                Photo{' '}
                {photoFlags
                  .map(
                    (f) => `${REASON_COPY.photo[f.reason]} · ${pctOf(f.score)}`,
                  )
                  .join(', ')}
              </span>
            )}
          {variant === 'covered' &&
            decided(post.status) &&
            photoFlags.length > 0 && (
              <span className={PILL_HISTORY}>
                <ExclamationTriangleIcon
                  className="size-3.5"
                  aria-hidden="true"
                />
                Photo flagged before{' '}
                {post.status === 'approved' ? 'approval' : 'decision'}:{' '}
                {photoFlags
                  .map(
                    (f) => `${REASON_SHORT.photo[f.reason]} ${pctOf(f.score)}`,
                  )
                  .join(', ')}
              </span>
            )}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {actionsFor(post.status).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(post, action)}
              className={
                action === 'approve'
                  ? PRIMARY
                  : action === 'delete'
                    ? `${DANGER_QUIET} ${post.status === 'deleting' ? '' : 'ml-auto'}`
                    : SECONDARY
              }
            >
              {post.status === 'deleting' ? 'Try again' : LABELS[action]}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}

const pct = (fraction: number) => `${fraction * 100}%`
const MAX_PHOTO_VH = 70

function Photo({
  photo,
  crop,
  name,
  blurred,
  cover,
  corner,
}: {
  photo: ModerationPhoto
  crop: WallPostCrop
  name: string | null
  blurred: boolean
  cover: ReactNode
  corner: ReactNode
}) {
  const box = cropOutline(photo, crop)
  return (
    <div className="relative flex min-h-32 items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div
        className="relative overflow-hidden"
        style={{
          aspectRatio: `${photo.width} / ${photo.height}`,
          width: `min(100%, ${MAX_PHOTO_VH}vh * ${photo.width / photo.height})`,
        }}
      >
        <img
          src={photo.url}
          alt={name ? `Photo by ${name}` : 'Posted photo'}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
          className={`block size-full object-contain ${blurred ? 'scale-110 blur-2xl' : ''}`}
        />
        {!blurred && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] outline-2 -outline-offset-2 outline-white/90"
            style={{
              left: pct(box.left),
              top: pct(box.top),
              width: pct(box.width),
              height: pct(box.height),
            }}
          />
        )}
      </div>
      {cover}
      {corner}
    </div>
  )
}

function NoPhoto() {
  return (
    <div className="flex aspect-4/3 items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-900 dark:text-gray-600">
      <PhotoIcon className="size-10" aria-hidden="true" />
      <span className="sr-only">No photo</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export interface PrototypeQueueProps {
  posts: JudgedPost[]
  variant: Variant
  initialTab?: ModerationTab
}

/** A fixed "now" for the prototype's decisions: never shown, never `new Date()`. */
const DECIDED_AT = '2026-10-26T08:00:00Z'

const DONE: Record<PostAction, string> = {
  approve: 'Approved. It shows on the wall within a few seconds.',
  reject: 'Rejected. It’s in Not shown.',
  remove: 'Removed from the wall. It’s in Not shown.',
  delete: 'Deleted for good.',
}

const EMPTY: Record<ModerationTab, string> = {
  pending:
    'Nothing waiting. New posts show up here within about 10 seconds of being posted.',
  onTheWall: 'Nothing on the wall yet. Approve a pending post to show it.',
  notShown: 'Nothing here. Rejected and removed posts end up here.',
}

/** Variant B's sections of the Pending tab. */
type Section = 'checkFirst' | 'fine' | 'notJudged'
const SECTIONS: Section[] = ['checkFirst', 'fine', 'notJudged']
const SECTION_LABELS: Record<Section, string> = {
  checkFirst: 'Check first',
  fine: 'Looks fine',
  notJudged: 'Not judged',
}

function sectionOf(post: JudgedPost): Section {
  if (!post.judgement) return 'notJudged'
  const verdict = verdictOf(post.judgement)
  return verdict.kind === 'unsafe'
    ? 'checkFirst'
    : verdict.kind === 'fine'
      ? 'fine'
      : 'notJudged'
}

const strongest = (post: JudgedPost) =>
  post.judgement ? (flagsOf(post.judgement)[0]?.score ?? 0) : 0

export function PrototypeQueue({
  posts: initial,
  variant,
  initialTab = 'pending',
}: PrototypeQueueProps) {
  const [posts, setPosts] = useState(initial)
  const [tab, setTab] = useState<ModerationTab>(initialTab)
  const [notice, setNotice] = useState('')

  const onAction = (post: JudgedPost, action: PostAction) => {
    setPosts((all) =>
      action === 'delete'
        ? all.filter((p) => p._id !== post._id)
        : all.map((p) =>
            p._id !== post._id
              ? p
              : action === 'approve'
                ? {
                    ...p,
                    status: 'approved',
                    approvedAt: DECIDED_AT,
                    decidedAt: DECIDED_AT,
                  }
                : { ...p, status: 'notShown', decidedAt: DECIDED_AT },
          ),
    )
    setNotice(DONE[action])
  }

  const approveAll = (which: JudgedPost[]) => {
    const ids = new Set(which.map((p) => p._id))
    setPosts((all) =>
      all.map((p) =>
        ids.has(p._id)
          ? {
              ...p,
              status: 'approved',
              approvedAt: DECIDED_AT,
              decidedAt: DECIDED_AT,
            }
          : p,
      ),
    )
    setNotice(
      `Approved ${which.length} ${which.length === 1 ? 'photo' : 'photos'}.`,
    )
  }

  const counts = countByTab(posts)
  const shown = postsInTab(posts, tab) as JudgedPost[]
  const pending = postsInTab(posts, 'pending') as JudgedPost[]

  const grid = (list: JudgedPost[]) => (
    <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((post) => (
        <PrototypeCard
          key={post._id}
          post={post}
          variant={variant}
          onAction={onAction}
        />
      ))}
    </div>
  )

  return (
    <section aria-labelledby="proto-queue-title" className="space-y-4">
      <h2
        id="proto-queue-title"
        className="text-base font-semibold text-gray-900 dark:text-white"
      >
        Posts
      </h2>
      <p
        role="status"
        className="text-sm font-medium text-gray-700 empty:hidden dark:text-gray-300"
      >
        {notice}
      </p>
      <div
        role="tablist"
        aria-label="Posts by status"
        className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-900"
      >
        {MODERATION_TABS.map((t) => {
          const selected = t === tab
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`${MODERATION_TAB_LABELS[t]} (${counts[t]})`}
              onClick={() => setTab(t)}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue sm:gap-1.5 sm:px-3 sm:text-sm dark:focus-visible:outline-indigo-400 ${
                selected
                  ? 'bg-white text-gray-900 shadow-xs ring-1 ring-gray-300 dark:bg-gray-700 dark:text-white dark:ring-gray-500'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {MODERATION_TAB_LABELS[t]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  selected
                    ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {counts[t]}
              </span>
            </button>
          )
        })}
      </div>
      <div role="tabpanel" className="space-y-4">
        {tab === 'pending' && variant !== 'sections' && pending.length > 0 && (
          <button
            type="button"
            onClick={() => approveAll(pending)}
            className="inline-flex min-h-10 items-center rounded-md bg-white px-3 text-sm font-semibold text-green-800 shadow-xs ring-1 ring-green-700/40 ring-inset hover:bg-green-50 dark:bg-gray-800 dark:text-green-300 dark:ring-green-400/40 dark:hover:bg-green-950"
          >
            Approve all pending ({pending.length})
          </button>
        )}
        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400">
            {EMPTY[tab]}
          </p>
        ) : tab === 'pending' && variant === 'sections' ? (
          SECTIONS.map((section) => {
            const own = pending.filter((p) => sectionOf(p) === section)
            if (own.length === 0) return null
            if (section === 'checkFirst')
              own.sort((a, b) => strongest(b) - strongest(a))
            return (
              <section
                key={section}
                aria-labelledby={`proto-section-${section}`}
                className="space-y-3"
              >
                <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-2 bg-white/95 px-2 py-2 backdrop-blur-sm dark:bg-gray-900/95">
                  <h3
                    id={`proto-section-${section}`}
                    className={`flex items-center gap-1.5 text-sm font-semibold ${
                      section === 'checkFirst'
                        ? 'text-amber-800 dark:text-amber-300'
                        : section === 'fine'
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {section === 'checkFirst' ? (
                      <ExclamationTriangleIcon
                        className="size-4"
                        aria-hidden="true"
                      />
                    ) : section === 'fine' ? (
                      <CheckCircleIcon className="size-4" aria-hidden="true" />
                    ) : (
                      <MinusCircleIcon className="size-4" aria-hidden="true" />
                    )}
                    {SECTION_LABELS[section]}
                    <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700 tabular-nums dark:bg-gray-700 dark:text-gray-200">
                      {own.length}
                    </span>
                    {section === 'checkFirst' && (
                      <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
                        strongest first
                      </span>
                    )}
                    {section === 'notJudged' && (
                      <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
                        look as usual
                      </span>
                    )}
                  </h3>
                  {section === 'fine' && (
                    <button
                      type="button"
                      onClick={() => approveAll(own)}
                      className="inline-flex min-h-9 items-center rounded-md bg-white px-3 text-sm font-semibold text-green-800 shadow-xs ring-1 ring-green-700/40 ring-inset hover:bg-green-50 dark:bg-gray-800 dark:text-green-300 dark:ring-green-400/40 dark:hover:bg-green-950"
                    >
                      Approve these {own.length}
                    </button>
                  )}
                </div>
                {grid(own)}
              </section>
            )
          })
        ) : (
          grid(shown)
        )}
      </div>
    </section>
  )
}
