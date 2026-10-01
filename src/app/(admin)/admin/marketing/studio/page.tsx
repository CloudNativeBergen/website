import React from 'react'
import { StudioSearchParamsSchema } from '@/server/schemas/studio'
import { StudioCardGrid } from '@/components/admin/marketing/StudioCardGrid'
import {
  FormatSwitch,
  PromoCard,
  SPONSOR_CARD_VARIANTS,
} from '@/components/admin/marketing/studio-cards'
import { StudioTaskProvider } from '@/components/admin/marketing/StudioTaskProvider'
import { StudioGalleryProvider } from '@/components/admin/marketing/studio-gallery'
import { getAuthSession } from '@/lib/auth'
import {
  isOrganizerForCurrentOrg,
  resolveCurrentOrgId,
} from '@/lib/authz/organizer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  conferenceBaseUrl,
  hasConferenceDomain,
} from '@/lib/conference/baseUrl'
import { getProposals } from '@/lib/proposal/server'
import { formatConferenceDateLong } from '@/lib/time'
import { Status } from '@/lib/proposal/types'
import { SpeakerShare } from '@/components/SpeakerShare'
import { SponsorThankYou } from '@/components/SponsorThankYou'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import type { StudioCard } from '@/components/common/image-capture'
import { AdminPageHeader } from '@/components/admin'
import { MarketingTabs } from '@/components/admin/MarketingTabs'
import { MemeGeneratorWithDownload } from '@/components/admin/meme-generator'
import { StudioPhotoGallery } from '@/components/admin/StudioPhotoGallery'
import { getSpeakerFilename } from '@/lib/speaker/utils'
import { PLATFORM_NAME, PLATFORM_SLUG } from '@/lib/branding/platform'
import { getFeaturedGalleryImages } from '@/lib/gallery/sanity'
import {
  UserGroupIcon,
  MicrophoneIcon,
  TrophyIcon,
  PhotoIcon,
  StarIcon,
} from '@heroicons/react/24/outline'

interface SponsorData {
  _id: string
  name: string
  website?: string
  logo?: string
  logoBright?: string
}

interface SponsorTierData {
  title: string
  tagline?: string
  tierType: 'standard' | 'special'
}

const qrCodeCache = new Map<string, string>()
const FALLBACK_QR_CODE =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IndoaXRlIi8+PHRleHQgeD0iNTAiIHk9IjUwIiBmb250LXNpemU9IjEwIiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0iY2VudHJhbCI+UVIgQ29kZTwvdGV4dD48L3N2Zz4='

async function generateQRCode(
  url: string,
  domain: string,
  size = 256,
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
      color: { dark: '#1a1a1a', light: '#ffffff' },
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

const getFirstParagraph = (text?: string): string => {
  if (!text) return ''
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
  return paragraphs[0]?.trim() || ''
}

/**
 * "Save to gallery" on a speaker card (spec §4.2): about that speaker, with
 * words an organizer can keep or change.
 */
function speakerCard(
  speaker: { _id: string; name: string },
  talks: { title?: string }[],
  eventName: string,
): StudioCard {
  const talk = talks.find((t) => t.title)?.title
  return {
    tab: 'speakers',
    title: `${speaker.name} – speaker card`,
    alt: `Speaker card for ${speaker.name}${talk ? `, speaking on “${talk}”` : ''} at ${eventName}.`,
    subject: { type: 'speaker', id: speaker._id, name: speaker.name },
  }
}

/** "Save to gallery" on a sponsor's thank-you card: about that sponsor. */
function sponsorCard(
  sponsor: SponsorData,
  tier: SponsorTierData,
  eventName: string,
): StudioCard {
  return {
    tab: 'sponsors',
    title: `${sponsor.name} – thank-you card`,
    alt: `Thank-you card for ${sponsor.name}, ${tier.title} sponsor of ${eventName}.`,
    subject: { type: 'sponsor', id: sponsor._id, name: sponsor.name },
  }
}

/**
 * "Save to gallery" wraps the Task's attachment context, so it is present with
 * or without a render Task open (spec §4.2).
 */
function StudioProviders({
  orgId,
  taskId,
  children,
}: {
  orgId: string
  taskId?: string
  children: React.ReactNode
}) {
  return (
    <StudioGalleryProvider orgId={orgId}>
      <StudioTaskProvider key={taskId} taskId={taskId}>
        {children}
      </StudioTaskProvider>
    </StudioGalleryProvider>
  )
}

const ErrorDisplay = ({ message }: { message: string }) => (
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

export default async function MarketingPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
} = {}) {
  const selection = StudioSearchParamsSchema.parse(await searchParams)
  const defaultTab =
    selection.tab ||
    (selection.project
      ? 'meme-generator'
      : selection.speaker
        ? 'speakers'
        : selection.sponsor
          ? 'sponsors'
          : selection.task
            ? 'conference'
            : 'meme-generator')
  const session = await getAuthSession()

  // ORG-SCOPED admin gate (CaaS T1-2, #614), matching the (admin) layout.
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Access Denied
        </p>
      </div>
    )
  }

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ sponsors: true })

  if (conferenceError || !conference) {
    console.error('Error loading conference:', conferenceError)
    return <ErrorDisplay message="Error loading conference data" />
  }

  const [featuredPhotos, currentOrgId] = await Promise.all([
    getFeaturedGalleryImages(100, conference._id),
    // Names the gallery's upload pathname; the server resolves it again.
    resolveCurrentOrgId(),
  ])

  // The gate above proved an organizer of this host's organization; one that
  // cannot be resolved now has nothing to name the gallery upload with.
  if (!currentOrgId) {
    return <ErrorDisplay message="Error loading the organization" />
  }
  const orgId = currentOrgId
  // A card preselected without a Task was opened from the gallery.
  const pinnedTitle = selection.task ? 'Card for your Task' : 'Selected card'

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

  // Process sponsors for thank you cards
  const sponsors = conference.sponsors || []
  const sponsorsWithData = sponsors.filter(
    (sponsorRef) =>
      sponsorRef.sponsor &&
      typeof sponsorRef.sponsor === 'object' &&
      'name' in sponsorRef.sponsor &&
      sponsorRef.tier &&
      typeof sponsorRef.tier === 'object' &&
      'title' in sponsorRef.tier,
  )

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
  // Sharper than any capture needs: the largest QR, portrait's, is ~195 px.
  const qrCodeUrl = await generateQRCode(programUrl, conferenceDomain, 512)

  // These cards are DOWNLOADABLE share assets, so anything printed on them can
  // leave the product entirely. A conference provisioned without dates used to
  // get a hardcoded 'June 15, 2025' here — an invented date on a graphic
  // destined for social media. Undefined instead: every consumer below omits
  // the date line rather than inventing or placeholding one.
  const eventDate = conference.startDate
    ? formatConferenceDateLong(conference.startDate)
    : undefined

  const conferenceDescription = getFirstParagraph(conference.description)
  const fallbackDescription =
    totalSpeakers > 0
      ? `Join ${totalSpeakers} confirmed speakers at ${conference.title} for a day of talks, hands-on workshops and meaningful connections.`
      : `Join us at ${conference.title} for a day of talks, hands-on workshops and meaningful connections.`

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<MicrophoneIcon />}
        title="Marketing Materials"
        description={
          <>
            Download marketing materials for{' '}
            <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
              {conference.title}
            </span>
            . High-quality images perfect for social media promotion and
            marketing campaigns.
          </>
        }
        actionItems={[
          {
            label: 'Featured Content',
            href: '/admin/marketing/featured',
            icon: <StarIcon className="h-4 w-4" />,
            variant: 'secondary',
          },
          {
            label: 'Gallery',
            href: '/admin/marketing/gallery',
            icon: <PhotoIcon className="h-4 w-4" />,
            variant: 'secondary',
          },
        ]}
      />

      <StudioProviders orgId={orgId} taskId={selection.task}>
        <MarketingTabs
          tabs={[
            {
              id: 'meme-generator',
              name: 'Meme Generator',
              icon: 'sparkles',
              count: 1,
              // Its video may hold unsaved work (#1181).
              keepMounted: true,
              description:
                'Create custom memes with your own text and images, perfect for social media engagement and community building.',
            },
            {
              id: 'conference',
              name: 'Conference Promo',
              icon: 'presentation',
              count: 1,
              description:
                'High-quality conference promotional image perfect for social media and marketing campaigns.',
            },
            {
              id: 'photo-gallery',
              name: 'Photo Gallery',
              icon: 'photo',
              // No badge: the tab's count follows the edition chosen inside it.
              // Its default-scope count is the current edition's.
              description:
                'Showcase conference moments with customizable photo grid layouts, perfect for social media promotion.',
            },
            {
              id: 'speakers',
              name: 'Speaker Cards',
              icon: 'users',
              count: speakersWithTalks.length,
              description:
                'Individual speaker sharing cards with QR codes, optimized for social media promotion.',
            },
            {
              id: 'sponsors',
              name: 'Sponsor Cards',
              icon: 'trophy',
              count: sponsorsWithData.length,
              description:
                'Thank you cards for sponsors with their branding and QR codes linking to their websites.',
            },
          ]}
          defaultTab={defaultTab}
        >
          {/* Meme Generator Tab */}
          <div>
            <MemeGeneratorWithDownload
              orgId={orgId}
              projectId={selection.project}
              conferenceTitle={conference.title}
              conferenceLogos={{
                logoBright: conference.logoBright,
                logoDark: conference.logoDark,
                logomarkBright: conference.logomarkBright,
                logomarkDark: conference.logomarkDark,
                title: conference.title,
              }}
            />
          </div>

          {/* Conference Promotional Tab */}
          <div>
            <FormatSwitch defaultFormat={selection.format}>
              <DownloadableImage
                filename={`${conference.title?.replace(/\s+/g, '-').toLowerCase() || PLATFORM_SLUG}-conference-promo`}
                studio={{
                  tab: 'conference',
                  title: `${conference.title} promo`,
                }}
              >
                {/* Width only: the card takes its Format's aspect. */}
                <div style={{ width: 'min(600px, calc(100vw - 3rem))' }}>
                  <PromoCard
                    title={conference.title}
                    date={eventDate}
                    place={
                      conference.city && conference.country
                        ? `${conference.city}, ${conference.country}`
                        : 'Location TBA'
                    }
                    counts={{
                      speakers: uniqueSpeakersCount,
                      talks: totalTalks,
                      workshops: workshopCount,
                    }}
                    description={conferenceDescription || fallbackDescription}
                    qrCodeUrl={qrCodeUrl}
                  />
                </div>
              </DownloadableImage>
            </FormatSwitch>
          </div>

          {/* Photo Gallery Tab (#1191: current or a previous edition's featured photos) */}
          <div>
            <StudioPhotoGallery
              photos={featuredPhotos}
              qrCodeUrl={`https://${conferenceDomain}${programUrl}`}
              conferenceTitle={conference.title || PLATFORM_NAME}
              conferenceLogos={{
                logoBright: conference.logoBright,
                logoDark: conference.logoDark,
                logomarkBright: conference.logomarkBright,
                logomarkDark: conference.logomarkDark,
              }}
            />
          </div>

          {/* Speaker Cards Tab */}
          <div>
            {speakersWithTalks.length === 0 ? (
              <div className="py-12 text-center">
                <UserGroupIcon className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                  No Confirmed Speakers Yet
                </h3>
                <p className="font-inter text-gray-600 dark:text-gray-400">
                  Speaker sharing cards will appear here once talks are
                  confirmed.
                </p>
              </div>
            ) : (
              <FormatSwitch defaultFormat={selection.format}>
                <StudioCardGrid
                  selectedId={selection.speaker}
                  pinnedTitle={pinnedTitle}
                  label="speakers"
                  className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4"
                >
                  {speakersWithTalks.map(({ speaker, talks }) => (
                    <div
                      key={speaker._id}
                      className="flex flex-col items-center"
                    >
                      <DownloadableImage
                        filename={`${getSpeakerFilename(speaker)}-speaker-spotlight`}
                        studio={speakerCard(speaker, talks, conference.title)}
                      >
                        {/* Width only: the card takes its Format's aspect. */}
                        <div style={{ width: '256px' }}>
                          <SpeakerShare
                            speaker={{
                              ...speaker,
                              talks: talks,
                            }}
                            variant="speaker-spotlight"
                            isFeatured={true}
                            eventName={conference.title || PLATFORM_NAME}
                            showCloudNativePattern={true}
                          />
                        </div>
                      </DownloadableImage>
                    </div>
                  ))}
                </StudioCardGrid>
              </FormatSwitch>
            )}
          </div>

          {/* Sponsor Cards Tab */}
          <div>
            {sponsorsWithData.length === 0 ? (
              <div className="py-12 text-center">
                <TrophyIcon className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                  No Sponsors Yet
                </h3>
                <p className="font-inter text-gray-600 dark:text-gray-400">
                  Sponsor thank you cards will appear here once sponsors are
                  added.
                </p>
              </div>
            ) : (
              <FormatSwitch defaultFormat={selection.format}>
                <StudioCardGrid
                  selectedId={selection.sponsor}
                  pinnedTitle={pinnedTitle}
                  label="sponsors"
                  className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {sponsorsWithData.map((sponsorRef, index) => {
                    const sponsor = sponsorRef.sponsor as SponsorData
                    const tier = sponsorRef.tier as SponsorTierData
                    const variant =
                      SPONSOR_CARD_VARIANTS[
                        index % SPONSOR_CARD_VARIANTS.length
                      ]

                    return (
                      <div
                        key={sponsor._id}
                        className="flex flex-col items-center"
                      >
                        <DownloadableImage
                          filename={`${sponsor.name.replace(/\s+/g, '-').toLowerCase()}-${tier.title.replace(/\s+/g, '-').toLowerCase()}-thank-you`}
                          studio={sponsorCard(sponsor, tier, conference.title)}
                        >
                          {/* Width only: the card takes its Format's aspect. */}
                          <div style={{ width: '400px' }}>
                            <SponsorThankYou
                              sponsor={sponsor}
                              tier={tier}
                              variant={variant}
                              eventName={conference.title}
                              eventDate={eventDate}
                              baseUrl={
                                hasConferenceDomain(conference)
                                  ? conferenceBaseUrl(conference)
                                  : undefined
                              }
                              showCloudNativePattern={true}
                            />
                          </div>
                        </DownloadableImage>
                      </div>
                    )
                  })}
                </StudioCardGrid>
              </FormatSwitch>
            )}
          </div>
        </MarketingTabs>
      </StudioProviders>
    </div>
  )
}
