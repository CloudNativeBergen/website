import type { ReactNode } from 'react'
import type { FailureNotice } from '@/lib/social/state-machine'

/**
 * Why a failed variant failed, and what to do next (#1130) — one notice for
 * the Task editor and the copy-ready view, driven by `failureNotice`. The
 * error is quoted (Buffer's own words after an accept, otherwise the
 * adapter's or the engine's), already capped by `failureNotice` to the
 * notification's length, and rendered as text, never markup.
 */
export function PublishFailureNotice({
  notice,
  platform,
  retry,
  manual,
}: {
  notice: FailureNotice
  platform: string
  /** How to retry from where the organizer is ("retry", "close this and retry"). */
  retry: string
  /** How to post by hand from here: text, or a link to the copy-ready view. */
  manual: ReactNode
}) {
  const { error, afterAccept, retryAlone } = notice
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200"
    >
      <p>
        <strong className="font-semibold">
          {afterAccept
            ? 'Buffer reported an error on this post.'
            : `It did not go out on ${platform}.`}
        </strong>{' '}
        {error ? (afterAccept ? 'Buffer said:' : 'The error was:') : null}
      </p>
      {error && (
        <p className="mt-1 break-words italic">&ldquo;{error}&rdquo;</p>
      )}
      <p className="mt-2">
        {afterAccept
          ? `Buffer may still retry it on its own, so check ${platform} and Buffer’s queue first. If it is not there, fix the problem in Buffer, then ${retry}`
          : retryAlone
            ? `You can ${retry}`
            : `Sending it again unchanged fails the same way: fix what the error names first, then ${retry}`}
        , or {manual}.
      </p>
    </div>
  )
}
