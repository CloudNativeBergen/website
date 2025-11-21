'use client'

import { useState } from 'react'
import {
  ShieldCheckIcon,
  ClipboardIcon,
  CheckIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import {
  ArrowDownTrayIcon as ArrowDownTrayIconSolid,
  CheckBadgeIcon as CheckBadgeIconSolid,
} from '@heroicons/react/24/solid'
import Link from 'next/link'
import type { BadgeRecord } from '@/lib/badge/types'
import type { Speaker } from '@/lib/speaker/types'
import type { Conference } from '@/lib/conference/types'
import { sanityImage } from '@/lib/sanity/client'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { CloudNativePattern } from '@/components/CloudNativePattern'
import { BlueskyIcon, LinkedInIcon } from '@/components/SocialIcons'

interface BadgeDisplayProps {
  badge: BadgeRecord
  speaker: Speaker
  conference: Conference
  badgeId: string
}

export function BadgeDisplay({
  badge,
  speaker,
  conference,
  badgeId,
}: BadgeDisplayProps) {
  const [copied, setCopied] = useState<'url' | null>(null)

  const badgeTypeName = badge.badge_type === 'speaker' ? 'Speaker' : 'Organizer'
  const issuedDate = new Date(badge.issued_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const badgeUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/badge/${badgeId}`
  const downloadUrl = `/api/badge/${badgeId}/download`
  const badgeSvgUrl = badge.baked_svg?.asset?.url
  const speakerProfileUrl = speaker.slug ? `/speaker/${speaker.slug}` : null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(badgeUrl)
      setCopied('url')
      setTimeout(() => setCopied(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleShare = (platform: 'bluesky' | 'linkedin') => {
    const text = `🎉 I earned a ${badgeTypeName} Badge at ${conference.title}! 🎉`
    const url = badgeUrl

    if (platform === 'bluesky') {
      const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`
      window.open(blueskyUrl, '_blank', 'width=550,height=600')
    } else if (platform === 'linkedin') {
      const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
      window.open(linkedinUrl, '_blank', 'width=550,height=420')
    }
  }

  const speakerImageUrl = speaker.image
    ? sanityImage(speaker.image).width(400).height(400).fit('crop').url()
    : undefined

  // Get first talk for evidence (if available)
  const speakerTalks =
    'talks' in speaker &&
    Array.isArray(speaker.talks) &&
    speaker.talks.length > 0
      ? speaker.talks
      : null
  const firstTalk = speakerTalks ? speakerTalks[0] : null

  return (
    <div className="space-y-8">
      {/* Hero Section - Badge Flex */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-emerald-600 via-green-600 to-teal-600 p-8 text-center text-white shadow-2xl sm:p-12">
        <CloudNativePattern
          className="absolute inset-0"
          variant="dark"
          opacity={0.15}
          animated={true}
          baseSize={40}
          iconCount={50}
          seed={42}
        />

        <div className="relative">
          {/* Verified Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 backdrop-blur-sm">
            <CheckBadgeIconSolid className="h-5 w-5" />
            <span className="text-sm font-semibold">Verified Credential</span>
          </div>

          {/* Celebration */}
          <div className="mb-4 flex items-center justify-center gap-3">
            <SparklesIcon className="h-8 w-8 animate-pulse" />
            <h1 className="font-space-grotesk text-4xl font-bold sm:text-5xl">
              Badge Earned!
            </h1>
            <SparklesIcon className="h-8 w-8 animate-pulse" />
          </div>

          {/* Badge Type & Conference */}
          <p className="font-inter mb-8 text-xl font-semibold sm:text-2xl">
            {badgeTypeName} at {conference.title}
          </p>

          {/* Large Badge Visual */}
          <div className="mb-8 flex justify-center">
            {badgeSvgUrl ? (
              <img
                src={badgeSvgUrl}
                alt={`${badgeTypeName} Badge`}
                className="h-48 w-48 drop-shadow-2xl sm:h-64 sm:w-64"
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-full bg-white/20 drop-shadow-2xl backdrop-blur-sm sm:h-64 sm:w-64">
                <ShieldCheckIcon className="h-24 w-24 sm:h-32 sm:w-32" />
              </div>
            )}
          </div>

          {/* Recipient Info */}
          <div className="mb-6 flex flex-col items-center gap-4">
            {speakerImageUrl ? (
              <img
                src={speakerImageUrl}
                alt={speaker.name}
                className="h-24 w-24 rounded-full border-4 border-white/30 object-cover shadow-xl"
              />
            ) : (
              <div className="h-24 w-24 rounded-full border-4 border-white/30 shadow-xl">
                <MissingAvatar
                  name={speaker.name}
                  size={96}
                  className="rounded-full"
                />
              </div>
            )}
            <div>
              <h2 className="font-space-grotesk text-3xl font-bold sm:text-4xl">
                {speaker.name}
              </h2>
              {speaker.title && (
                <p className="mt-1 text-lg text-white/90">{speaker.title}</p>
              )}
            </div>
          </div>

          {/* Talk Title (if speaker) */}
          {firstTalk && (
            <div className="mx-auto max-w-2xl rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-sm font-semibold tracking-wide text-white/80 uppercase">
                Talk
              </p>
              <p className="font-space-grotesk mt-1 text-lg font-bold">
                {firstTalk.title}
              </p>
            </div>
          )}

          {/* Issue Date */}
          <p className="mt-6 text-sm text-white/80">Issued on {issuedDate}</p>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          onClick={() => handleShare('bluesky')}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#0085ff] px-6 py-4 font-semibold text-white transition-transform hover:scale-105"
        >
          <BlueskyIcon className="h-5 w-5" />
          Share on Bluesky
        </button>

        <button
          onClick={() => handleShare('linkedin')}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#0A66C2] px-6 py-4 font-semibold text-white transition-transform hover:scale-105"
        >
          <LinkedInIcon className="h-5 w-5" />
          Share on LinkedIn
        </button>

        {badgeSvgUrl && (
          <a
            href={downloadUrl}
            download
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-cloud-blue px-6 py-4 font-semibold text-white transition-transform hover:scale-105"
          >
            <ArrowDownTrayIconSolid className="h-5 w-5" />
            Download Badge
          </a>
        )}
      </div>

      {/* Secondary Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {copied === 'url' ? (
            <>
              <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              Copied!
            </>
          ) : (
            <>
              <ClipboardIcon className="h-4 w-4" />
              Copy Share Link
            </>
          )}
        </button>

        <a
          href="https://openbadgepassport.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ShieldCheckIcon className="h-4 w-4" />
          Add to Passport
        </a>

        <a
          href={`https://www.credly.com/badges/import?url=${encodeURIComponent(`/api/badge/${badgeId}/json`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ShieldCheckIcon className="h-4 w-4" />
          Add to Credly
        </a>
      </div>

      {/* Event & Issuer Info */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-space-grotesk mb-4 text-xl font-bold text-gray-900 dark:text-white">
          About This Badge
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Event
            </p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {conference.title}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {conference.city}, {conference.country}
            </p>
            {conference.tagline && (
              <p className="mt-1 text-sm text-gray-600 italic dark:text-gray-400">
                &ldquo;{conference.tagline}&rdquo;
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Issued By
            </p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {conference.organizer}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Recognition
            </p>
            <p className="text-gray-900 dark:text-white">
              This badge recognizes {speaker.name} as{' '}
              {badgeTypeName === 'Speaker' ? 'a speaker' : 'an organizer'} at{' '}
              {conference.title}, demonstrating their contribution to the cloud
              native community.
            </p>
          </div>

          {speakerProfileUrl && (
            <div>
              <Link
                href={speakerProfileUrl}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-cloud-blue hover:underline"
              >
                View Speaker Profile →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Technical Details */}
      <details className="group rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <summary className="flex cursor-pointer items-center justify-between p-6 font-semibold text-gray-900 dark:text-white">
          Technical Details
          <svg
            className="h-5 w-5 text-gray-500 transition-transform group-open:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </summary>
        <div className="space-y-4 border-t border-gray-200 p-6 dark:border-gray-700">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Standard
            </p>
            <p className="text-sm text-gray-900 dark:text-white">
              OpenBadges 3.0 / W3C Verifiable Credentials 2.0
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Badge ID
            </p>
            <p className="font-mono text-sm text-gray-900 dark:text-white">
              {badgeId}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Verification
            </p>
            <p className="flex items-center gap-2 text-sm">
              <CheckBadgeIconSolid className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span className="font-medium text-green-600 dark:text-green-400">
                Cryptographically Verified
              </span>
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
              Credential Data
            </p>
            <a
              href={`/api/badge/${badgeId}/json`}
              className="font-mono text-sm text-brand-cloud-blue hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              View JSON Credential →
            </a>
          </div>
        </div>
      </details>
    </div>
  )
}
