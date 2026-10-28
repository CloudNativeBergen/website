'use client'

import Link from 'next/link'
import { ArrowUpTrayIcon, PlayCircleIcon } from '@heroicons/react/24/outline'
import { shareSocial } from '@/lib/share/social'
import type { ThankYouTalk } from '@/lib/speaker/dashboardBriefing'
import { isSafeLinkHref } from '@/lib/portabletext/safeHref'

interface SpeakerThankYouProps {
  talks: ThankYouTalk[]
  eventName: string
  /** The event hashtag and conference account, from `shareTags`. */
  tags?: string | null
  /** The page a share links to without a recording; this site by default. */
  url?: string
}

const linkClass =
  'text-brand-cloud-blue underline hover:no-underline dark:text-blue-400'

const isHttpUrl = (url?: string): url is string =>
  !!url && /^https?:\/\//i.test(url) && isSafeLinkHref(url)

/** Shown after the event in place of the speaker briefing (#1546, R16). */
export function SpeakerThankYou({
  talks,
  eventName,
  tags,
  url,
}: SpeakerThankYouProps) {
  const share = (t: ThankYouTalk) =>
    shareSocial({
      platform: 'bluesky',
      text: `I spoke about “${t.title}” at ${eventName}. Thanks for having me!${tags ? ` ${tags}` : ''}`,
      url: isHttpUrl(t.video) ? t.video : url || window.location.origin,
    })

  return (
    <section
      aria-labelledby="thank-you-heading"
      className="space-y-3 sm:rounded-lg sm:border sm:border-gray-200 sm:bg-gray-50 sm:p-4 dark:sm:border-gray-700 dark:sm:bg-gray-900/40"
    >
      <h4
        id="thank-you-heading"
        className="font-space-grotesk text-base font-bold text-gray-900 dark:text-white"
      >
        Thank you for speaking
      </h4>
      <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
        {talks.map((t) => (
          <li key={t.proposalId} className="space-y-1">
            <p className="font-medium text-gray-900 dark:text-white">
              {t.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {isHttpUrl(t.video) && (
                <a
                  href={t.video}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkClass} inline-flex items-center gap-1`}
                >
                  <PlayCircleIcon aria-hidden="true" className="h-4 w-4" />
                  Watch the recording
                </a>
              )}
              {!t.hasSlides && (
                <Link
                  href={`/cfp/proposal/${t.proposalId}`}
                  className={`${linkClass} inline-flex items-center gap-1`}
                >
                  <ArrowUpTrayIcon aria-hidden="true" className="h-4 w-4" />
                  Upload your slides
                </Link>
              )}
              <button
                type="button"
                onClick={() => share(t)}
                className={`${linkClass} inline-flex min-h-11 items-center rounded focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none`}
              >
                Share on Bluesky
                <span className="sr-only"> (opens in a new window)</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
