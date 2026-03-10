import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { ClickableSpeakerNames } from '@/components/ClickableSpeakerNames'
import { formats, languages, levels } from '@/lib/proposal/types'
import { flags, Flags } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import * as social from '@/components/SocialIcons'
import { getPublicSpeaker } from '@/lib/speaker/sanity'
import { Button } from '@/components/Button'
import { BackLink } from '@/components/BackButton'
import { ShowMore } from '@/components/ShowMore'
import { UserIcon } from '@heroicons/react/24/solid'
import { speakerImageUrl } from '@/lib/sanity/client'
import { PortableText } from '@portabletext/react'
import { portableTextComponents } from '@/lib/portabletext/components'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { BlueskyFeed } from '@/components/BlueskyFeed'
import { ScrollFadeBlueskyFeed } from '@/components/ScrollFadeBlueskyFeed'
import { hasBlueskySocial } from '@/lib/bluesky/utils'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextTextBlock, PortableTextObject } from 'sanity'
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'
import { formatConferenceDateLong } from '@/lib/time'
import { PhotoGallerySection } from '@/components/PhotoGallerySection'
import { AttachmentDisplay } from '@/components/proposal/AttachmentDisplay'
import { headers } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

type Props = {
  params: Promise<{ slug: string }>
}

function portableTextToString(value: PortableTextBlock[]): string {
  return value
    .map((block) =>
      (block as PortableTextTextBlock<PortableTextObject>).children
        .map((child) => child.text)
        .join(''),
    )
    .join(' ')
}

export async function generateMetadata({ params }: Props) {
  const resolvedParams = await params
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  const decodedSlug = decodeURIComponent(resolvedParams.slug)
  const { conference } = await getConferenceForDomain(domain)
  const { speaker, talks, err } = await getPublicSpeaker(
    conference._id,
    decodedSlug,
  )

  if (err || !speaker || !talks || talks.length === 0) {
    return {
      title: 'Speaker not found',
      description: 'Sorry, we could not find the speaker you are looking for.',
      image: 'https://placehold.co/1200x630/e5e7eb/6b7280?text=Speaker',
    }
  }

  const title = `${speaker.name} - ${talks[0].title}`

  let description = ''
  if (talks[0].description) {
    if (typeof talks[0].description === 'string') {
      description = talks[0].description
    } else {
      description = portableTextToString(talks[0].description)
    }

    if (description.length > 160) {
      description = description.substring(0, 157) + '...'
    }
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

async function CachedSpeakerContent({
  domain,
  slug,
}: {
  domain: string
  slug: string
}) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:speaker-detail')

  const { conference } = await getConferenceForDomain(domain)
  const { speaker, talks, err } = await getPublicSpeaker(conference._id, slug)

  if (err) {
    console.error('Error loading speaker:', err)
  }

  if (!speaker) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-slate-gray dark:text-white">
              Speaker Not Found
            </h1>
            <p className="font-inter mb-8 text-xl text-gray-600 dark:text-gray-300">
              Sorry, we couldn&apos;t find the speaker you&apos;re looking for.
            </p>
            <Button href="/speaker" variant="primary">
              View All Speakers
            </Button>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <div className="sticky top-8 z-10">
                <div className="mb-6">
                  <BackLink fallbackUrl="/speaker" variant="link">
                    Back to Speakers
                  </BackLink>
                </div>

                <div className="mb-6 flex justify-center lg:justify-start">
                  {speaker.image ? (
                    <img
                      src={speakerImageUrl(speaker.image)}
                      alt={speaker.name}
                      className="h-48 w-48 rounded-full object-cover shadow-lg ring-4 ring-white lg:h-64 lg:w-64 dark:ring-gray-700"
                    />
                  ) : (
                    <div className="flex h-48 w-48 items-center justify-center rounded-full bg-blue-100 shadow-lg ring-4 ring-white lg:h-64 lg:w-64 dark:bg-blue-900/30 dark:ring-gray-700">
                      <UserIcon className="h-24 w-24 text-blue-500 lg:h-32 lg:w-32 dark:text-blue-400" />
                    </div>
                  )}
                </div>

                {speaker.flags?.includes(Flags.localSpeaker) && (
                  <div className="mb-6 flex justify-center lg:justify-start">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      {flags.get(Flags.localSpeaker)}
                    </span>
                  </div>
                )}

                {speaker.links && speaker.links.length > 0 && (
                  <div className="mb-6 flex flex-wrap justify-center gap-4 lg:justify-start">
                    {speaker.links.map((link, index) => (
                      <a
                        key={index}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md transition-all hover:scale-105 hover:shadow-lg dark:bg-gray-800 dark:hover:bg-gray-700"
                      >
                        {social.iconForLink(
                          link,
                          'h-5 w-5 text-brand-slate-gray dark:text-gray-300',
                        )}
                      </a>
                    ))}
                  </div>
                )}

                {(() => {
                  const blueskyLink = hasBlueskySocial(speaker.links)
                  return blueskyLink ? (
                    <BlueskyFeed
                      blueskyHandle={blueskyLink}
                      className="mt-6 hidden lg:block"
                    />
                  ) : null
                })()}
              </div>

              {(() => {
                const blueskyLink = hasBlueskySocial(speaker.links)
                return blueskyLink ? (
                  <div className="mb-4 lg:hidden">
                    <ScrollFadeBlueskyFeed
                      blueskyHandle={blueskyLink}
                      postCount={1}
                      compact={true}
                    />
                  </div>
                ) : null
              })()}
            </div>

            <div className="lg:col-span-2">
              <div className="mb-8 text-center lg:text-left">
                <h1 className="font-space-grotesk mb-2 text-4xl font-bold text-brand-slate-gray sm:text-5xl dark:text-white">
                  {speaker.name}
                </h1>
                {speaker.title && (
                  <p className="font-inter text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                    {speaker.title}
                  </p>
                )}
              </div>

              {speaker.bio && (
                <div className="mb-8 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
                  <h2 className="sr-only">About</h2>
                  <ShowMore className="font-inter prose prose-lg max-w-none text-gray-700 dark:text-gray-300">
                    {typeof speaker.bio === 'string' ? (
                      speaker.bio.split('\n').map(
                        (paragraph, index) =>
                          paragraph.trim() && (
                            <p key={index} className="mb-3 last:mb-0">
                              {paragraph}
                            </p>
                          ),
                      )
                    ) : (
                      <PortableText
                        value={speaker.bio}
                        components={portableTextComponents}
                      />
                    )}
                  </ShowMore>
                </div>
              )}

              {speaker.galleryImages && speaker.galleryImages.length > 0 && (
                <PhotoGallerySection images={speaker.galleryImages} />
              )}

              {talks && talks.length > 0 && (
                <div className="mb-8">
                  <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
                    {talks.length === 1 ? 'Session' : 'Sessions'}
                  </h2>
                  <div className="space-y-6">
                    {talks.map((talk) => (
                      <div
                        key={talk._id}
                        className="rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md dark:bg-gray-800 dark:hover:shadow-lg"
                      >
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-brand-slate-gray dark:text-white">
                              {talk.title}
                            </h3>

                            {talk.scheduleInfo?.date &&
                              talk.scheduleInfo?.timeSlot && (
                                <div className="mb-3 flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400">
                                  <span className="flex items-center">
                                    <CalendarIcon className="mr-1.5 h-4 w-4" />
                                    {formatConferenceDateLong(
                                      talk.scheduleInfo.date,
                                    )}
                                  </span>
                                  <span className="flex items-center">
                                    <ClockIcon className="mr-1.5 h-4 w-4" />
                                    {
                                      talk.scheduleInfo.timeSlot.startTime
                                    } - {talk.scheduleInfo.timeSlot.endTime}
                                  </span>
                                  {talk.scheduleInfo.trackTitle && (
                                    <span className="flex items-center">
                                      <MapPinIcon className="mr-1.5 h-4 w-4" />
                                      {talk.scheduleInfo.trackTitle}
                                    </span>
                                  )}
                                </div>
                              )}

                            {talk.speakers && talk.speakers.length > 1 && (
                              <div className="mb-3 flex items-center gap-3">
                                <SpeakerAvatars
                                  speakers={talk.speakers}
                                  maxVisible={4}
                                  size="sm"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-brand-cloud-blue dark:text-blue-400">
                                    <ClickableSpeakerNames
                                      speakers={talk.speakers}
                                      linkClassName="hover:text-brand-cloud-blue/80 transition-colors dark:hover:text-blue-300"
                                    />
                                  </div>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {talk.speakers.length} speakers
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-3">
                              {talk.format && (
                                <span className="inline-flex items-center rounded-full bg-brand-cloud-blue/10 px-3 py-1 text-sm font-medium text-brand-cloud-blue dark:bg-blue-900/30 dark:text-blue-400">
                                  {formats.get(talk.format)}
                                </span>
                              )}
                              {talk.level && (
                                <span className="inline-flex items-center rounded-full bg-brand-fresh-green/10 px-3 py-1 text-sm font-medium text-brand-fresh-green dark:bg-green-900/30 dark:text-green-400">
                                  {levels.get(talk.level)}
                                </span>
                              )}
                              {talk.language && (
                                <span className="inline-flex items-center rounded-full bg-accent-purple/10 px-3 py-1 text-sm font-medium text-accent-purple dark:bg-purple-900/30 dark:text-purple-400">
                                  {languages.get(talk.language)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {talk.attachments && talk.attachments.length > 0 && (
                          <div className="mb-4">
                            <AttachmentDisplay
                              attachments={talk.attachments}
                              showVideos={true}
                            />
                          </div>
                        )}
                        {talk.description && (
                          <div className="mb-4">
                            <div className="font-inter text-gray-700 dark:text-gray-300">
                              {typeof talk.description === 'string' ? (
                                <p>{talk.description}</p>
                              ) : (
                                <PortableText
                                  value={talk.description}
                                  components={portableTextComponents}
                                />
                              )}
                            </div>
                          </div>
                        )}
                        {talk.topics && talk.topics.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {talk.topics.map((topic, index) => {
                              const isTopicObject = (t: unknown): t is Topic =>
                                t !== null &&
                                typeof t === 'object' &&
                                '_id' in t &&
                                'title' in t

                              const topicObj = isTopicObject(topic)
                                ? topic
                                : null

                              return (
                                <span
                                  key={topicObj?._id || `topic-${index}`}
                                  className="rounded-md bg-brand-sky-mist px-2 py-1 text-xs font-medium text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300"
                                >
                                  {topicObj?.title || 'Topic'}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

export default async function Profile({ params }: Props) {
  const resolvedParams = await params
  const headersList = await headers()
  const domain = headersList.get('host') || ''
  const decodedSlug = decodeURIComponent(resolvedParams.slug)

  return <CachedSpeakerContent domain={domain} slug={decodedSlug} />
}
