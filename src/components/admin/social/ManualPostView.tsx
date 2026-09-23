'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { mayAlreadyBeLive } from '@/lib/social/state-machine'
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { richTextImageUrl } from '@/lib/homepage/richTextImage'
import {
  countLength,
  getPlatformConstraints,
  ownDomainUrlsIn,
} from '@/lib/social/provider/constraints'
import { postUrlExample, postUrlIssue } from '@/lib/social/provider/manual'
import { renditionDownloadUrl, renditionRect } from '@/lib/social/rendition'
import {
  SOCIAL_PLATFORM_LABELS,
  type SocialPostAttachment,
  type SocialPostVariant,
} from '@/lib/social/types'
import { CroppedImage } from './CroppedImage'

export interface ManualPostViewProps {
  variant: SocialPostVariant
  postAttachments: SocialPostAttachment[]
  /** Called with the pasted post URL once it passes the platform check. */
  onMarkPosted: (url: string) => void
  saving?: boolean
  /** A server-side refusal (URL, conflict) to show above the action. */
  error?: string | null
  /** Source image URL; defaults to the CDN. Stories inject data URIs. */
  imageSrc?: (asset: SocialPostAttachment) => string
  /**
   * The conference's own domains. Used only to WARN: a body that reached this
   * view already cannot be refused here (see {@link ManualPostView}).
   */
  conferenceDomains?: readonly string[]
}

const defaultImageSrc = (asset: SocialPostAttachment) =>
  richTextImageUrl(asset.assetId, 1200)

/**
 * The copy-ready view (spec §3.2, #1006): everything an organizer needs to
 * post a manual-Channel variant by hand — the text, each image as the
 * platform's rendition with its alt text, and the tagged link — each with a
 * copy button, then the "mark as posted" step that requires the post URL.
 * Pure: the dialog wires it to `social.*`.
 */
export function ManualPostView({
  variant,
  postAttachments,
  onMarkPosted,
  saving = false,
  error = null,
  imageSrc = defaultImageSrc,
  conferenceDomains = [],
}: ManualPostViewProps) {
  const platform = SOCIAL_PLATFORM_LABELS[variant.platform]
  const constraints = getPlatformConstraints(variant.platform)
  const aspect = constraints?.imageAspectRatio ?? null
  const byKey = new Map(postAttachments.map((a) => [a._key, a]))
  const images = variant.attachments.flatMap((a, index) => {
    const source = byKey.get(a.source)
    if (!source) return []
    const rect = renditionRect(source, aspect, a.crop)
    // The asset id ends in its source format (`…-2000x1000-jpg`), which is
    // what the download keeps (no `auto=format`).
    const extension = source.assetId.slice(source.assetId.lastIndexOf('-') + 1)
    const filename = `${variant.platform}-${index + 1}.${extension || 'jpg'}`
    return [
      {
        key: a.source,
        src: imageSrc(source),
        downloadHref: renditionDownloadUrl(source, rect, filename),
        filename,
        alt: a.altOverride ?? source.alt,
        rect,
        sourceAspect: source.width / source.height,
      },
    ]
  })
  // An attachment the post no longer carries: the organizer approved the
  // post WITH that image, so say so instead of quietly showing text only.
  const missingImages = variant.attachments.filter(
    (a) => !byKey.has(a.source),
  ).length
  const link = variant.link?.trim() || null
  // Where the link goes by hand (spec §3.1, #1134).
  //
  //   `comment` (LinkedIn) — the one placement that keeps the link OUT of the
  //     copied text. It is a step of its own, posted right after the post.
  //     Nothing here can verify the organizer actually posted that comment:
  //     "mark as posted" checks the POST's address and no more.
  //   `card` (Bluesky) / `body` — the URL goes in the text; a card is what the
  //     platform makes OF a URL in the text when a human posts it. The tagged
  //     link is appended unless the body already carries it, so for these two
  //     following the steps cannot publish without the approved link.
  //   no constraints (a platform no adapter describes) — unchanged from before
  //     #1134: the link is neither appended nor a comment, it is its own
  //     "Copy the link" step with no claim about where it goes.
  const placement = constraints?.linkPlacement ?? null
  const linkAsComment = link !== null && placement === 'comment'
  const linkInBody =
    link !== null && placement !== null && placement !== 'comment'
  const linkAppended = linkInBody && !variant.body.includes(link)
  /**
   * A body that reached this view carrying a link to our own site, on a
   * platform where the link is the first comment (spec §3.1, #1134). Save,
   * schedule and approve all refuse it, so this is a variant that got past
   * them BEFORE the rule existed — a draft materialized from the 2026.1
   * built-in — or one whose conference gained the domain afterwards. There
   * is no migration (rewriting edited copy is not ours to do) and an
   * `awaiting-manual` variant can no longer be edited, so the only honest
   * thing is to say so here rather than present the text as ready to copy.
   */
  const strayInBody =
    placement === 'comment' && variant.status !== 'published'
      ? ownDomainUrlsIn(variant.body, conferenceDomains)
      : []
  const copyText = linkAppended ? `${variant.body}\n\n${link}` : variant.body
  const copyLength = constraints
    ? countLength(copyText, constraints.counting)
    : null
  // The body validated on its own; the appended link can push the copied
  // text over the platform's cap, which the organizer must hear here.
  const overLimit =
    constraints !== null &&
    copyLength !== null &&
    copyLength > constraints.maxLength
  const done = variant.status === 'published'
  // `failed` joins `awaiting-manual` (#1128, spec §5): with an asynchronous
  // publisher a variant never reaches `awaiting-manual`, so recording a post
  // that DID go out — after a publisher error, or an `ambiguous`
  // confirmation — is done from `failed`. `social.markPosted` accepts both.
  const awaiting =
    variant.status === 'awaiting-manual' || variant.status === 'failed'
  // MAY ALREADY BE LIVE (spec §3.3, §5) — `ambiguous` OR `stale-claim`. The
  // rule lives in `state-machine.ts` so this view and the Task editor's retry
  // cannot drift apart about which failures are safe to act on.
  const postMayBeLive = mayAlreadyBeLive(variant)

  const [url, setUrl] = useState('')
  const [urlIssue, setUrlIssue] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = url.trim()
    const issue = postUrlIssue(variant.platform, trimmed)
    setUrlIssue(issue)
    if (!issue) onMarkPosted(trimmed)
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {(postMayBeLive
          ? [
              `Check ${platform} for this post`,
              'If it is there, paste its address below',
              'Only post it by hand if it is NOT there',
            ]
          : [
              'Copy the text',
              link && !linkInBody && !linkAsComment ? 'Copy the link' : null,
              images.length > 0 ? 'Save the image' : null,
              `Post it on ${platform}`,
              linkAsComment ? 'Add the link as the first comment' : null,
              'Paste the post address below',
            ]
        )
          .filter((step): step is string => step !== null)
          .map((step, index) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className="flex size-5 items-center justify-center rounded-full bg-gray-100 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
      </ol>

      {postMayBeLive && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <strong className="font-semibold">
            This post may already be live.
          </strong>{' '}
          We could not confirm whether it went out, so check {platform} before
          doing anything else. If the post is there, paste its address below to
          record it — do not post it again.
        </p>
      )}

      {strayInBody.length > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          The text below still contains {strayInBody.join(', ')}. On {platform}{' '}
          the link belongs in the first comment, not the post — this text was
          written before that rule.{' '}
          {postMayBeLive
            ? 'If you do post it by hand, delete it from the text first and post the link as the first comment.'
            : 'Delete it from the text after pasting, and post the link as the first comment instead.'}
        </p>
      )}

      {missingImages > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300"
        >
          {missingImages === 1
            ? 'An image this post was approved with is no longer on the post.'
            : `${missingImages} images this post was approved with are no longer on the post.`}{' '}
          Check the post before publishing by hand.
        </p>
      )}

      <Section
        title="Text"
        hint={[
          constraints ? `${copyLength} / ${constraints.maxLength}` : null,
          linkAppended ? 'The link is added at the end.' : null,
          overLimit ? 'Shorten the text before posting.' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        hintTone={overLimit ? 'error' : 'muted'}
        action={<CopyButton value={copyText} label="Copy text" />}
      >
        <p className="text-sm break-words whitespace-pre-wrap text-gray-900 dark:text-gray-100">
          {variant.body}
          {linkAppended && (
            <>
              {'\n\n'}
              <span className="text-brand-cloud-blue">{link}</span>
            </>
          )}
        </p>
      </Section>

      {link && (
        <Section
          title="Link"
          hint={
            linkAsComment
              ? `Post it as the FIRST COMMENT on your ${platform} post — the link alone, nothing else. It is deliberately not in the text above.`
              : linkInBody
                ? `Part of the text above; ${platform} shows a preview from it.`
                : `Add it where ${platform} takes a link.`
          }
          hintTone={linkAsComment ? 'strong' : 'muted'}
          action={<CopyButton value={link} label="Copy link" />}
        >
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 text-sm break-all text-brand-cloud-blue hover:underline"
          >
            {link}
            <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0" />
          </a>
        </Section>
      )}

      {images.map((image, index) => (
        <Section
          key={`${image.key}-${index}`}
          title={images.length > 1 ? `Image ${index + 1}` : 'Image'}
          hint={
            aspect
              ? `Cropped to ${platform}'s ${aspect}:1 card.`
              : 'Shown as uploaded.'
          }
          action={
            image.downloadHref ? (
              <a
                href={image.downloadHref}
                download={image.filename}
                className={actionClass}
              >
                <ArrowDownTrayIcon className="size-4" />
                Save image
              </a>
            ) : null
          }
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <CroppedImage
              src={image.src}
              alt={image.alt}
              rect={image.rect}
              sourceAspect={image.sourceAspect}
              className="w-full max-w-56 rounded-lg bg-gray-100 dark:bg-gray-800"
            />
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                  Alt text
                </p>
                {image.alt.trim() && (
                  <CopyButton value={image.alt} label="Copy alt text" />
                )}
              </div>
              {image.alt.trim() ? (
                <p className="text-sm break-words text-gray-900 dark:text-gray-100">
                  {image.alt}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  No alt text on this image.
                </p>
              )}
            </div>
          </div>
        </Section>
      ))}

      {done ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-900/20 dark:text-green-300">
          Posted
          {variant.publishResult?.url && (
            <>
              {': '}
              <a
                href={variant.publishResult.url}
                target="_blank"
                rel="noreferrer"
                className="break-all underline"
              >
                {variant.publishResult.url}
              </a>
            </>
          )}
        </div>
      ) : awaiting ? (
        <form
          noValidate
          onSubmit={submit}
          className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-900/10"
        >
          <label
            htmlFor="manual-post-url"
            className="block text-sm font-medium text-gray-800 dark:text-gray-100"
          >
            Address of the published post
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="manual-post-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder={postUrlExample(variant.platform)}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (urlIssue) setUrlIssue(null)
            }}
            aria-invalid={urlIssue ? true : undefined}
            aria-describedby={
              urlIssue || error ? 'manual-post-url-error' : undefined
            }
            className={inputClass}
          />
          {(urlIssue || error) && (
            <p
              id="manual-post-url-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {urlIssue ?? error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Required: it is stored on the variant and completes it.
            </p>
            <AdminButton type="submit" color="brand" disabled={saving}>
              {saving ? 'Saving…' : 'Mark as posted'}
            </AdminButton>
          </div>
        </form>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This variant is {variant.status}. Marking it posted becomes possible
          once the cron has handed it over, or once it has failed.
        </p>
      )}
    </div>
  )
}

function Section({
  title,
  hint,
  hintTone = 'muted',
  action,
  children,
}: {
  title: string
  hint?: string
  hintTone?: 'muted' | 'strong' | 'error'
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            {title}
          </h3>
          {hint && (
            <p
              role={hintTone === 'error' ? 'alert' : undefined}
              className={clsx(
                'mt-0.5 text-xs',
                hintTone === 'error'
                  ? 'font-medium text-red-600 dark:text-red-400'
                  : hintTone === 'strong'
                    ? 'font-medium text-amber-700 dark:text-amber-400'
                    : 'text-gray-400 dark:text-gray-500',
              )}
            >
              {hint}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const actionClass =
  'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'

const inputClass =
  'block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none aria-[invalid]:border-red-400 dark:border-gray-600 dark:bg-gray-700 dark:text-white'

/**
 * Writes `value` to the clipboard and confirms inline for a moment. When
 * the clipboard is unavailable (an insecure context, a denied permission)
 * the button says so instead of pretending.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 1800)
    return () => clearTimeout(timer)
  }, [state])
  const copy = () => {
    const clipboard =
      typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (!clipboard) {
      setState('failed')
      return
    }
    clipboard.writeText(value).then(
      () => setState('copied'),
      () => setState('failed'),
    )
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      aria-live="polite"
      className={clsx(
        actionClass,
        state === 'copied' &&
          'border-green-300 text-green-700 dark:border-green-800 dark:text-green-300',
        state === 'failed' &&
          'border-red-300 text-red-700 dark:border-red-800 dark:text-red-300',
      )}
    >
      {state === 'copied' ? (
        <CheckIcon className="size-4" />
      ) : (
        <ClipboardDocumentIcon className="size-4" />
      )}
      {state === 'copied'
        ? 'Copied'
        : state === 'failed'
          ? 'Copy by hand'
          : label}
    </button>
  )
}
