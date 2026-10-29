'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { CheckBadgeIcon } from '@heroicons/react/24/solid'
import { EllipsisHorizontalIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import {
  allowsFrom,
  cropOutline,
  type ModerationPhoto,
  type ModerationPost,
  type WallPostCrop,
  type WallPostTalk,
} from '@/lib/photo-wall'
import { formatConferenceDayTime } from '@/lib/time'
import { focusIsWith } from '../focus'

/** What an organizer can do to a post from its card (§10, §12). */
export type PostAction =
  'approve' | 'reject' | 'remove' | 'withdrawMarketing' | 'delete'

/** The actions that ask first, inline. */
type Confirmed = Extract<PostAction, 'withdrawMarketing' | 'delete'>

/**
 * How an action ended: written (`done`), someone else decided first
 * (`changed`), the post no longer exists (`gone`), or it did not go through
 * (`failed`: the card says so, and the organizer can press again).
 */
export type PostActionOutcome = 'done' | 'changed' | 'gone' | 'failed'

export interface WallPostCardProps {
  post: ModerationPost
  /**
   * Runs an action; without it the card has no actions (read only). Answers
   * null when the post already has one in flight: the press is ignored.
   */
  onAction?: (
    post: ModerationPost,
    action: PostAction,
  ) => Promise<PostActionOutcome | null>
  /** The action in flight on this post, held by the queue across remounts. */
  busy?: PostAction | null
  /** The last action that failed on it, held by the queue likewise. */
  failed?: PostAction | null
  /** This conference's talks, for the tag picker (Talk photos spec §6.3). */
  talks?: WallPostTalk[]
  /** Sets (or, with null, clears) the talk tag; without it, no tag actions. */
  onSetTalk?: (
    post: ModerationPost,
    talkId: string | null,
  ) => Promise<PostActionOutcome>
}

/**
 * One Wall Post on `/admin/photo-wall` (Photo Wall spec §10): the whole
 * photo with the square the wall shows outlined, the caption, the name, when
 * it was submitted, and the Marketing OK mark. A `deleting` post has no photo
 * and says the delete did not finish (§12). Its actions follow its status.
 */
export function WallPostCard({
  post,
  onAction,
  busy = null,
  failed = null,
  talks = [],
  onSetTalk,
}: WallPostCardProps) {
  const [enlarged, setEnlarged] = useState(false)
  const tagging = useTalkTag(
    post,
    post.status === 'deleting' ? undefined : onSetTalk,
  )
  const alt = photoAlt(post.name)
  return (
    // Named by its caption; without one the photo's "Photo by …" says who,
    // and the card does not repeat it.
    <article
      aria-label={post.caption ?? undefined}
      className="relative overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      {post.photo ? (
        <>
          <button
            type="button"
            aria-label={`Enlarge: ${alt}`}
            onClick={() => setEnlarged(true)}
            className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-cloud-blue dark:focus-visible:outline-indigo-400"
          >
            <Photo photo={post.photo} crop={post.crop} alt={alt} thumb />
          </button>
          <ModalShell
            isOpen={enlarged}
            onClose={() => setEnlarged(false)}
            size="4xl"
            ariaLabel={alt}
            padded={false}
          >
            <Photo photo={post.photo} crop={post.crop} alt={alt} />
          </ModalShell>
        </>
      ) : (
        <NoPhoto />
      )}
      <div className="space-y-1.5 p-2.5 sm:p-3">
        {post.status === 'deleting' && (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Couldn’t delete. Try again.
          </p>
        )}
        {post.caption && (
          <p
            dir="auto"
            title={post.caption}
            className="line-clamp-2 text-sm wrap-anywhere text-gray-900 dark:text-white"
          >
            {post.caption}
          </p>
        )}
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
          {post.autoApprovedBy && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-800 ring-1 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-400/30">
              Auto-approved · {post.autoApprovedBy}
            </span>
          )}
        </p>
        {onAction && (
          <Actions
            post={post}
            onAction={onAction}
            busy={busy}
            failed={failed}
            tagging={tagging}
          />
        )}
        <TalkTag post={post} talks={talks} tagging={tagging} />
      </div>
    </article>
  )
}

/**
 * The decisions a status's transitions allow (§10), as buttons on the card.
 * Delete, which every status allows, is in the ⋯ menu; a `deleting` post
 * offers only it, as a Try again button.
 */
const decisionsFor = (status: ModerationPost['status']): PostAction[] =>
  status === 'deleting'
    ? ['delete']
    : (['approve', 'reject', 'remove'] as const).filter((action) =>
        allowsFrom(action, status),
      )

/**
 * Withdraw marketing OK, on its own quiet line, while the post has the mark
 * (never the other way: only the contributor gives consent, §12), and not on
 * a `deleting` post.
 */
const offersWithdraw = (post: ModerationPost) =>
  post.marketingConsent && post.status !== 'deleting'

const LABELS: Record<
  PostAction,
  { idle: string; busy: string; failed: string }
> = {
  approve: {
    idle: 'Approve',
    busy: 'Approving…',
    failed: 'Couldn’t approve. Try again.',
  },
  reject: {
    idle: 'Reject',
    busy: 'Rejecting…',
    failed: 'Couldn’t reject. Try again.',
  },
  remove: {
    idle: 'Remove',
    busy: 'Removing…',
    failed: 'Couldn’t remove. Try again.',
  },
  withdrawMarketing: {
    idle: 'Withdraw marketing OK',
    busy: 'Withdrawing…',
    failed: 'Couldn’t withdraw marketing OK. Try again.',
  },
  delete: {
    idle: 'Delete now',
    busy: 'Deleting…',
    failed: 'Couldn’t delete. Try again.',
  },
}

const BUTTON =
  'inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-semibold shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60 dark:focus-visible:outline-indigo-400'
const PRIMARY = `${BUTTON} bg-green-700 text-white hover:bg-green-800`
const SECONDARY = `${BUTTON} bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 ring-inset dark:bg-gray-700 dark:text-white dark:ring-gray-500 dark:hover:bg-gray-600`
const DANGER = `${BUTTON} bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500`
const DANGER_QUIET = `${BUTTON} bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50 ring-inset dark:bg-gray-800 dark:text-red-400 dark:ring-red-500/60 dark:hover:bg-red-950`
const MENU_ITEM =
  'block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 data-focus:bg-gray-100 dark:text-white dark:data-focus:bg-gray-700'

/** What each inline confirm asks, and how it looks. */
const CONFIRMS: Record<
  Confirmed,
  { question: string; confirm: string; box: string; text: string }
> = {
  delete: {
    question: 'Delete this photo for good? It can’t be undone.',
    confirm: 'Delete',
    box: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
    text: 'text-red-800 dark:text-red-300',
  },
  // Only the contributor can give consent again, from their phone (§12).
  withdrawMarketing: {
    question:
      'Withdraw marketing OK? The photo leaves the marketing export. Only the contributor can give it again.',
    confirm: 'Withdraw',
    box: 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/40',
    text: 'text-gray-900 dark:text-white',
  },
}

function Actions({
  post,
  onAction,
  busy,
  failed,
  tagging,
}: {
  post: ModerationPost
  onAction: NonNullable<WallPostCardProps['onAction']>
  busy: PostAction | null
  failed: PostAction | null
  tagging: TalkTagging
}) {
  const [confirming, setConfirming] = useState<Confirmed | null>(null)
  const confirmId = useId()
  // The ⋯ menu leaves the page as the confirm replaces it, and back: focus
  // follows, to Cancel (never the irreversible choice) and to the ⋯ button
  // the choice was made from.
  const cancelRef = useRef<HTMLButtonElement>(null)
  // The ⋯ button, or Try again on a `deleting` post (which has no menu).
  const menuRef = useRef<HTMLButtonElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  // The button to hand focus back to on the next render, if any.
  const handBackTo = useRef<'menu' | 'cancel' | null>(null)
  useEffect(() => {
    const to = handBackTo.current
    if (!to) return
    handBackTo.current = null
    ;(to === 'cancel' ? cancelRef : menuRef).current?.focus()
  }, [confirming])
  const ask = (action: Confirmed) => {
    handBackTo.current = 'cancel'
    setConfirming(action)
  }
  const close = (handBack = true) => {
    handBackTo.current = handBack ? 'menu' : null
    setConfirming(null)
  }
  // A poll can take Withdraw away while it asks: another organizer withdrew
  // the mark, or started a Delete. The confirm closes for good in that
  // render (never a Withdraw without the mark, nor in place of Try again),
  // and focus, if it went with it, goes to the ⋯ button (or Try again).
  const [dismissals, setDismissals] = useState(0)
  if (confirming === 'withdrawMarketing' && !offersWithdraw(post)) {
    setConfirming(null)
    setDismissals((n) => n + 1)
  }
  useEffect(() => {
    if (dismissals && focusIsWith(null)) menuRef.current?.focus()
  }, [dismissals])

  const run = async (action: PostAction) => {
    // Not `disabled`, which drops focus: a press while busy does nothing.
    if (busy) return
    const outcome = await onAction(post, action).catch(
      (): PostActionOutcome => 'failed',
    )
    // Ignored: already in flight, held by the queue.
    if (outcome === null) return
    // Focus goes back to the button that asked only if it is still in the
    // confirm: the organizer may have moved on while the answer was on its
    // way.
    if (confirming) close(focusIsWith(groupRef.current))
  }

  const deleting = post.status === 'deleting'
  if (confirming) {
    const copy = CONFIRMS[confirming]
    return (
      <div
        ref={groupRef}
        role="group"
        aria-labelledby={confirmId}
        className={`mt-2 space-y-2 rounded-md border p-3 ${copy.box}`}
      >
        <p id={confirmId} className={`text-sm font-medium ${copy.text}`}>
          {copy.question}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-disabled={busy !== null || undefined}
            onClick={() => run(confirming)}
            className={DANGER}
          >
            {busy === confirming ? LABELS[confirming].busy : copy.confirm}
          </button>
          <button
            type="button"
            aria-disabled={busy !== null || undefined}
            ref={cancelRef}
            onClick={() => !busy && close()}
            className={SECONDARY}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 pt-2">
      {/* A deleting post already says "Couldn't delete. Try again." */}
      {failed && !(deleting && failed === 'delete') && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {LABELS[failed].failed}
        </p>
      )}
      <div className="flex gap-1.5">
        {decisionsFor(post.status).map((action) => (
          <button
            key={action}
            ref={action === 'delete' ? menuRef : undefined}
            data-decision
            type="button"
            aria-disabled={busy !== null || undefined}
            // Try again finishes a delete already confirmed.
            onClick={() => run(action)}
            className={`min-w-0 flex-1 basis-0 px-1 text-xs sm:px-2 sm:text-sm ${(action ===
            'approve'
              ? PRIMARY
              : action === 'delete'
                ? DANGER_QUIET
                : SECONDARY
            ).replace('px-3 text-sm', '')}`}
          >
            {busy === action
              ? LABELS[action].busy
              : deleting
                ? 'Try again'
                : LABELS[action].idle}
          </button>
        ))}
      </div>
      {!deleting && (
        <Menu>
          <MenuButton
            ref={menuRef}
            aria-label="More actions"
            aria-disabled={busy !== null || undefined}
            className="absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait dark:bg-gray-800/90 dark:text-gray-200 dark:ring-gray-600 dark:focus-visible:outline-indigo-400"
          >
            <EllipsisHorizontalIcon className="size-5" aria-hidden="true" />
          </MenuButton>
          <MenuItems
            anchor="bottom end"
            className="z-50 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-lg [--anchor-gap:4px] focus:outline-none dark:border-gray-600 dark:bg-gray-800"
          >
            {tagging.onSetTalk && (
              <MenuItem>
                <button
                  type="button"
                  onClick={() => tagging.setPicking(true)}
                  className={MENU_ITEM}
                >
                  {post.talk ? 'Change talk' : 'Add talk'}
                </button>
              </MenuItem>
            )}
            {tagging.onSetTalk && post.talk && (
              <MenuItem>
                <button
                  type="button"
                  onClick={() => tagging.set(null)}
                  className={MENU_ITEM}
                >
                  Clear tag
                </button>
              </MenuItem>
            )}
            {offersWithdraw(post) && (
              <MenuItem>
                <button
                  type="button"
                  onClick={() => !busy && ask('withdrawMarketing')}
                  className={MENU_ITEM}
                >
                  {busy === 'withdrawMarketing'
                    ? LABELS.withdrawMarketing.busy
                    : LABELS.withdrawMarketing.idle}
                </button>
              </MenuItem>
            )}
            <MenuItem>
              <button
                type="button"
                onClick={() => !busy && ask('delete')}
                className={`${MENU_ITEM} text-red-700 dark:text-red-400`}
              >
                {busy === 'delete' ? LABELS.delete.busy : LABELS.delete.idle}
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      )}
    </div>
  )
}

/** A post's talk tag and its write, shared by the ⋯ menu and the picker. */
interface TalkTagging {
  onSetTalk?: WallPostCardProps['onSetTalk']
  picking: boolean
  setPicking: (on: boolean) => void
  busy: boolean
  failed: boolean
  set: (talkId: string | null) => Promise<void>
}

function useTalkTag(
  post: ModerationPost,
  onSetTalk?: WallPostCardProps['onSetTalk'],
): TalkTagging {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const set = async (talkId: string | null) => {
    if (!onSetTalk || busy) return
    setBusy(true)
    setFailed(false)
    const outcome = await onSetTalk(post, talkId).catch(
      (): PostActionOutcome => 'failed',
    )
    setBusy(false)
    setFailed(outcome === 'failed')
    if (outcome !== 'failed') setPicking(false)
  }
  return { onSetTalk, picking, setPicking, busy, failed, set }
}

/**
 * The post's talk tag (Talk photos spec §6.3): the talk and its speakers, or
 * that there is none; the ⋯ menu's Add talk or Change talk opens a
 * searchable list of this conference's talks here. Only the tag changes.
 */
function TalkTag({
  post,
  talks,
  tagging: { onSetTalk, picking, setPicking, busy, failed, set },
}: {
  post: ModerationPost
  talks: WallPostTalk[]
  tagging: TalkTagging
}) {
  const [search, setSearch] = useState('')
  const listId = useId()
  const tag = post.talk ?? null

  const needle = search.trim().toLowerCase()
  const found = talks.filter((talk) =>
    [talk.title, ...talk.speakers].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  )

  return (
    <div className="space-y-1.5 pt-1" data-testid="talk-tag">
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {tag ? (
          <>
            Talk:{' '}
            <span className="font-medium text-gray-900 dark:text-gray-200">
              {tag.title}
            </span>
            {tag.speakers.length > 0 && ` · ${tag.speakers.join(', ')}`}
          </>
        ) : (
          'No talk tagged.'
        )}
        {busy && ' Saving…'}
      </p>
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Couldn’t change the tag. Try again.
        </p>
      )}
      {onSetTalk && picking && (
        <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-900/40">
          <input
            type="search"
            aria-label="Find a talk"
            aria-controls={listId}
            placeholder="Find a talk or speaker"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="block min-h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <ul id={listId} className="max-h-60 space-y-1 overflow-y-auto">
            {found.map((talk) => (
              <li key={talk._id}>
                <button
                  type="button"
                  aria-disabled={busy || undefined}
                  aria-current={talk._id === tag?._id || undefined}
                  onClick={() => set(talk._id)}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-gray-900 hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-cloud-blue aria-[current]:font-semibold dark:text-white dark:hover:bg-gray-800 dark:focus-visible:outline-indigo-400"
                >
                  {talk.title}
                  {talk.speakers.length > 0 && (
                    <span className="block text-xs text-gray-600 dark:text-gray-400">
                      {talk.speakers.join(', ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {found.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400">
                No talk matches.
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className={SECONDARY}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

const pct = (fraction: number) => `${fraction * 100}%`

const photoAlt = (name: string | null) =>
  name ? `Photo by ${name}` : 'Posted photo'

/** A tall photo is shown no taller than this share of the viewport. */
const MAX_PHOTO_VH = 70

/**
 * The whole photo as a plain `<img>` of its Sanity URL (§5.1): never
 * `next/image`, whose optimizer would keep serving a deleted photo. The inner
 * box IS the rendered photo: its aspect ratio reserved before the photo
 * loads, its width capped so a tall portrait stays within
 * {@link MAX_PHOTO_VH}vh. The outline, in percentages of that box, sits on
 * the photo whatever its shape; a thin panorama sits centred in a frame of
 * at least 8rem.
 */
function Photo({
  photo,
  crop,
  alt,
  thumb = false,
}: {
  photo: ModerationPhoto
  crop: WallPostCrop
  alt: string
  /** The card's square thumbnail: the whole photo fitted into a square. */
  thumb?: boolean
}) {
  const box = cropOutline(photo, crop)
  const ratio = photo.width / photo.height
  return (
    <div
      className={`flex items-center justify-center bg-gray-100 dark:bg-gray-900 ${thumb ? 'aspect-square' : 'min-h-32'}`}
    >
      <div
        data-testid={thumb ? 'thumb-box' : 'photo-box'}
        className="relative overflow-hidden"
        style={{
          aspectRatio: `${photo.width} / ${photo.height}`,
          // In the square, a portrait is as tall as the square.
          width: thumb
            ? `${Math.min(1, ratio) * 100}%`
            : `min(100%, ${MAX_PHOTO_VH}vh * ${ratio})`,
        }}
      >
        <img
          src={photo.url}
          alt={alt}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
          className="block size-full object-contain"
        />
        {/* The square the wall shows; what lies outside it is dimmed. */}
        <div
          data-testid={thumb ? 'thumb-outline' : 'crop-outline'}
          aria-hidden="true"
          className="pointer-events-none absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] outline-2 -outline-offset-2 outline-white/90"
          style={{
            left: pct(box.left),
            top: pct(box.top),
            width: pct(box.width),
            height: pct(box.height),
          }}
        />
      </div>
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
