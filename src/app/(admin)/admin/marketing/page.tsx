import React from 'react'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/server'
import { Status } from '@/lib/proposal/types'
import { SpeakerShare } from '@/components/SpeakerShare'
import { DownloadSpeakerImage } from '@/components/branding/DownloadSpeakerImage'
import { AdminPageHeader } from '@/components/admin'
import { CloudNativePattern } from '@/components/CloudNativePattern'
import {
  DocumentArrowDownIcon,
  UserGroupIcon,
  PresentationChartBarIcon,
  CalendarDaysIcon,
  MapPinIcon,
  UsersIcon,
  MicrophoneIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'

const qrCodeCache = new Map<string, string>()
const FALLBACK_QR_CODE =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IndoaXRlIi8+PHRleHQgeD0iNTAiIHk9IjUwIiBmb250LXNpemU9IjEwIiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0iY2VudHJhbCI+UVIgQ29kZTwvdGV4dD48L3N2Zz4='

async function generateQRCode(
  url: string,
  domain: string,
  size: number = 256,
): Promise<string> {
  const fullUrl = url.startsWith('http') ? url : `https://${domain}${url}`

  const cacheKey = `${fullUrl}_${size}`
  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)!
  }

  try {
    const QRCode = (await import('qrcode')).default
    const qrCodeDataUrl = await QRCode.toDataURL(fullUrl, {
      width: size,
      margin: 0,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })

    qrCodeCache.set(cacheKey, qrCodeDataUrl)
    return qrCodeDataUrl
  } catch (error) {
    console.error('Failed to generate QR code:', error)
    qrCodeCache.set(fullUrl, FALLBACK_QR_CODE)
    return FALLBACK_QR_CODE
  }
}

interface QRCodeDisplayProps {
  qrCodeUrl?: string
  size: number
  className?: string
}

const QRCodeDisplay = ({
  qrCodeUrl,
  size,
  className = '',
}: QRCodeDisplayProps) => {
  if (!qrCodeUrl) return null

  return (
    <div
      className={`rounded-lg bg-white shadow-lg ${className}`}
      style={{
        padding: '8px',
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <img
        src={qrCodeUrl}
        alt="QR Code - Scan to view conference program"
        className="h-full w-full object-cover"
        style={{
          imageRendering: 'crisp-edges',
        }}
      />
    </div>
  )
}

function getFirstParagraph(text?: string): string {
  if (!text) return ''

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
  return paragraphs[0]?.trim() || ''
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="text-lg font-semibold text-red-500 dark:text-red-400">
          {message}
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Please try again or contact support if the issue persists.
        </p>
      </div>
    </div>
  )
}

export default async function MarketingPage() {
  const session = await getAuthSession()

  if (!session?.speaker?.is_organizer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Access Denied
        </p>
      </div>
    )
  }

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ revalidate: 0 })

  if (conferenceError || !conference) {
    console.error('Error loading conference:', conferenceError)
    return <ErrorDisplay message="Error loading conference data" />
  }

  const { proposals: allProposals, proposalsError } = await getProposals({
    conferenceId: conference._id,
    returnAll: true,
  })

  if (proposalsError) {
    console.error('Error fetching proposals:', proposalsError)
    return <ErrorDisplay message="Error fetching proposals data" />
  }

  const confirmedProposals = allProposals.filter(
    (proposal) => proposal.status === Status.confirmed,
  )

  const speakerTalksMap = new Map()

  confirmedProposals.forEach((proposal) => {
    const speakers =
      proposal.speakers && Array.isArray(proposal.speakers)
        ? proposal.speakers.filter(
            (speaker) =>
              typeof speaker === 'object' &&
              speaker &&
              'name' in speaker &&
              '_id' in speaker,
          )
        : []

    speakers.forEach((speaker) => {
      const speakerId = speaker._id
      if (!speakerTalksMap.has(speakerId)) {
        speakerTalksMap.set(speakerId, {
          speaker,
          talks: [],
        })
      }
      speakerTalksMap.get(speakerId).talks.push(proposal)
    })
  })

  const speakersWithTalks = Array.from(speakerTalksMap.values())

  const totalSpeakers = speakersWithTalks.length
  const totalTalks = confirmedProposals.length
  const uniqueSpeakersCount = new Set(
    confirmedProposals.flatMap((proposal) =>
      (proposal.speakers || [])
        .map((speaker) =>
          typeof speaker === 'object' && speaker && '_id' in speaker
            ? speaker._id
            : null,
        )
        .filter(Boolean),
    ),
  ).size

  const talksByFormat = confirmedProposals.reduce(
    (acc, proposal) => {
      const format = proposal.format || 'unknown'
      acc[format] = (acc[format] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const workshopCount = talksByFormat['workshop_120'] || 0

  const programUrl = '/program'
  const conferenceDomain = conference.domains[0]
  const qrCodeUrl = await generateQRCode(programUrl, conferenceDomain, 80)

  const conferenceDescription = getFirstParagraph(conference.description)
  const fallbackDescription =
    totalSpeakers > 0
      ? `Join ${totalSpeakers} confirmed speakers and the Nordic cloud native community for a day of cutting-edge talks, hands-on workshops, and meaningful connections.`
      : 'Join the Nordic cloud native community for a day of cutting-edge talks, hands-on workshops, and meaningful connections.'

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<PresentationChartBarIcon />}
        title="Marketing Materials"
        description={
          <>
            Download speaker sharing cards for{' '}
            <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
              {conference.title}
            </span>
            . High-quality images perfect for social media promotion and
            marketing.
          </>
        }
        stats={[
          {
            value: speakersWithTalks.length,
            label: 'Confirmed speakers',
            color: 'slate',
          },
          {
            value: confirmedProposals.length,
            label: 'Confirmed talks',
            color: 'green',
          },
          {
            value: speakersWithTalks.length,
            label: 'Sharing cards',
            color: 'blue',
          },
          {
            value: speakersWithTalks.filter(({ speaker }) => speaker.image)
              .length,
            label: 'With photos',
            color: 'blue',
          },
          {
            value: speakersWithTalks.filter(({ talks }) => talks.length > 1)
              .length,
            label: 'Multi-talk speakers',
            color: 'purple',
          },
          {
            value: speakersWithTalks.reduce(
              (sum, { talks }) => sum + talks.length,
              0,
            ),
            label: 'Total materials',
            color: 'green',
          },
        ]}
      />

      <div className="mb-12">
        <div className="mb-4 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
          <div className="flex items-start">
            <DocumentArrowDownIcon className="mt-1 mr-3 h-5 w-5 text-brand-fresh-green dark:text-green-300" />
            <div>
              <h3 className="font-space-grotesk mb-1 text-sm font-semibold text-brand-fresh-green dark:text-green-300">
                Conference Promotional Image
              </h3>
              <p className="font-inter text-xs text-green-700 dark:text-green-300">
                Click &quot;Download as PNG&quot; to save a high-quality
                conference promotional image perfect for social media and
                marketing.
              </p>
            </div>
          </div>
        </div>

        <DownloadSpeakerImage
          filename={`${conference.title?.replace(/\s+/g, '-').toLowerCase() || 'cloud-native-bergen'}-conference-promo`}
        >
          <div
            className="relative overflow-hidden rounded-xl bg-brand-gradient p-6 text-center md:p-8"
            style={{ width: '800px', height: '400px' }}
          >
            <CloudNativePattern
              className="z-0"
              opacity={0.15}
              animated={true}
              variant="brand"
              baseSize={45}
              iconCount={80}
            />
            <div className="absolute inset-0 z-10 rounded-xl bg-black/30"></div>
            <div className="relative z-20">
              <h1 className="font-space-grotesk mb-4 text-3xl font-bold text-white md:text-4xl">
                {conference.title}
              </h1>
              <div className="mb-6 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
                <div className="flex items-center gap-2 text-white/90">
                  <CalendarDaysIcon className="h-5 w-5" />
                  <span className="font-inter text-lg">
                    {conference.start_date
                      ? new Date(conference.start_date).toLocaleDateString(
                          'en-GB',
                          {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          },
                        )
                      : 'June 15, 2025'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <MapPinIcon className="h-5 w-5" />
                  <span className="font-inter text-lg">
                    {conference.city && conference.country
                      ? `${conference.city}, ${conference.country}`
                      : 'Bergen, Norway'}
                  </span>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-6 md:grid-cols-4">
                <div className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <UsersIcon className="h-5 w-5 text-brand-sunbeam-yellow" />
                    <span className="font-space-grotesk text-2xl font-bold text-white">
                      {uniqueSpeakersCount}
                    </span>
                  </div>
                  <p className="font-inter text-sm text-white/80">Speakers</p>
                </div>

                <div className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <MicrophoneIcon className="h-5 w-5 text-brand-fresh-green" />
                    <span className="font-space-grotesk text-2xl font-bold text-white">
                      {totalTalks}
                    </span>
                  </div>
                  <p className="font-inter text-sm text-white/80">Talks</p>
                </div>

                <div className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <TrophyIcon className="h-5 w-5 text-brand-sunbeam-yellow" />
                    <span className="font-space-grotesk text-2xl font-bold text-white">
                      {workshopCount}
                    </span>
                  </div>
                  <p className="font-inter text-sm text-white/80">Workshops</p>
                </div>

                <div className="flex flex-col items-center justify-center">
                  <QRCodeDisplay qrCodeUrl={qrCodeUrl} size={80} />
                  <p className="font-inter mt-2 text-center text-xs text-white/80">
                    Scan for Program
                  </p>
                </div>
              </div>

              <p className="font-inter mx-auto mb-4 max-w-2xl text-lg text-white/95">
                {conferenceDescription || fallbackDescription}
              </p>
            </div>
          </div>
        </DownloadSpeakerImage>
      </div>

      {speakersWithTalks.length === 0 ? (
        <div className="py-12 text-center">
          <UserGroupIcon className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-gray-900 dark:text-white">
            No Confirmed Speakers Yet
          </h3>
          <p className="font-inter text-gray-600 dark:text-gray-400">
            Speaker sharing cards will appear here once talks are confirmed.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-8 rounded-lg bg-blue-50 p-6 dark:bg-blue-900/20">
            <div className="flex items-start">
              <DocumentArrowDownIcon className="mt-1 mr-3 h-6 w-6 text-brand-cloud-blue dark:text-blue-300" />
              <div>
                <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-cloud-blue dark:text-blue-300">
                  Speaker Sharing Cards
                </h3>
                <p className="font-inter text-sm text-gray-700 dark:text-gray-300">
                  Click &quot;Download as PNG&quot; on any speaker card to save
                  high-quality promotional images. All cards include speaker
                  details and are optimized for social media platforms.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
            {speakersWithTalks.map(({ speaker, talks }) => (
              <div key={speaker._id} className="flex flex-col items-center">
                <DownloadSpeakerImage
                  filename={`${speaker.slug || speaker.name?.replace(/\s+/g, '-').toLowerCase()}-speaker-spotlight`}
                >
                  <div
                    className="h-64 w-64"
                    style={{ width: '256px', height: '256px' }}
                  >
                    <SpeakerShare
                      speaker={{
                        ...speaker,
                        talks: talks,
                      }}
                      variant="speaker-spotlight"
                      isFeatured={true}
                      eventName={conference.title || 'Cloud Native Bergen 2025'}
                      className="h-full w-full"
                      showCloudNativePattern={true}
                    />
                  </div>
                </DownloadSpeakerImage>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
