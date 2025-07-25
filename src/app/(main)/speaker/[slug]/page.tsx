import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { formats, languages, levels } from '@/lib/proposal/types'
import { flags, Flags } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import * as social from '@/components/SocialIcons'
import { getPublicSpeaker } from '@/lib/speaker/sanity'
import { Button } from '@/components/Button'
import { BackLink } from '@/components/BackButton'
import { ShowMore } from '@/components/ShowMore'
import { UserIcon } from '@heroicons/react/24/solid'
import { sanityImage } from '@/lib/sanity/client'
import { PortableText } from '@portabletext/react'
import { getConferenceForCurrentDomain } from '../../../../lib/conference/sanity'
import { BlueskyFeed } from '@/components/BlueskyFeed'
import { hasBlueskySocial } from '@/lib/bluesky/utils'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextTextBlock, PortableTextObject } from 'sanity'

type Props = {
  params: Promise<{ slug: string }>
}

// Utility function to convert PortableText to plain text for metadata
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
  const { conference } = await getConferenceForCurrentDomain()
  const { speaker, talks, err } = await getPublicSpeaker(
    conference._id,
    resolvedParams.slug,
  )

  if (err || !speaker || !talks || talks.length === 0) {
    return {
      title: 'Speaker not found',
      description: 'Sorry, we could not find the speaker you are looking for.',
      image: 'https://placehold.co/1200x630/e5e7eb/6b7280?text=Speaker',
    }
  }

  const title = `${speaker.name} - ${talks[0].title}`

  // Extract description from the first talk's PortableText description
  let description = ''
  if (talks[0].description) {
    if (typeof talks[0].description === 'string') {
      description = talks[0].description
    } else {
      description = portableTextToString(talks[0].description)
    }
    // Truncate description for metadata (ideal length is 150-160 characters)
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

export default async function Profile({ params }: Props) {
  const resolvedParams = await params
  const { conference } = await getConferenceForCurrentDomain()
  const { speaker, talks, err } = await getPublicSpeaker(
    conference._id,
    resolvedParams.slug,
  )

  // Handle errors
  if (err) {
    console.error('Error loading speaker:', err)
  }

  if (!speaker) {
    return (
      <div className="bg-brand-glacier-white">
        <div className="relative py-20 sm:pt-36 sm:pb-24">
          <BackgroundImage className="-top-36 -bottom-14" />
          <Container className="relative">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-slate-gray">
                Speaker Not Found
              </h1>
              <p className="font-inter mb-8 text-xl text-gray-600">
                Sorry, we couldn&apos;t find the speaker you&apos;re looking
                for.
              </p>
              <Button href="/speaker" variant="primary">
                View All Speakers
              </Button>
            </div>
          </Container>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-brand-glacier-white">
      {/* Hero Section */}
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          {/* Back Link - Top Left */}
          <div className="mb-8">
            <BackLink fallbackUrl="/speaker" variant="link">
              Back to Speakers
            </BackLink>
          </div>

          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-3">
              {/* Speaker Image & Basic Info */}
              <div className="lg:col-span-1">
                <div className="sticky top-8">
                  {/* Speaker Image */}
                  <div className="mb-6 flex justify-center lg:justify-start">
                    {speaker.image ? (
                      <img
                        src={sanityImage(speaker.image)
                          .width(400)
                          .height(400)
                          .fit('crop')
                          .url()}
                        alt={speaker.name}
                        className="h-48 w-48 rounded-full object-cover shadow-lg ring-4 ring-white lg:h-64 lg:w-64"
                      />
                    ) : (
                      <div className="flex h-48 w-48 items-center justify-center rounded-full bg-brand-cloud-blue/10 shadow-lg ring-4 ring-white lg:h-64 lg:w-64">
                        <UserIcon className="h-24 w-24 text-brand-cloud-blue/50 lg:h-32 lg:w-32" />
                      </div>
                    )}
                  </div>

                  {/* Local Speaker Flag */}
                  {speaker.flags?.includes(Flags.localSpeaker) && (
                    <div className="mb-6 flex justify-center lg:justify-start">
                      <span className="rounded-full bg-brand-cloud-blue/10 px-3 py-1 text-xs font-medium text-brand-cloud-blue">
                        {flags.get(Flags.localSpeaker)}
                      </span>
                    </div>
                  )}

                  {/* Social Links */}
                  {speaker.links && speaker.links.length > 0 && (
                    <div className="mb-6 flex flex-wrap justify-center gap-4 lg:justify-start">
                      {speaker.links.map((link, index) => (
                        <a
                          key={index}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md transition-all hover:scale-105 hover:shadow-lg"
                        >
                          {social.iconForLink(
                            link,
                            'h-5 w-5 text-brand-slate-gray',
                          )}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Bluesky Feed */}
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
              </div>

              {/* Speaker Content */}
              <div className="lg:col-span-2">
                {/* Name & Title */}
                <div className="mb-8 text-center lg:text-left">
                  <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-slate-gray sm:text-5xl">
                    {speaker.name}
                  </h1>
                  {speaker.title && (
                    <p className="font-inter text-xl font-semibold text-brand-cloud-blue">
                      {speaker.title}
                    </p>
                  )}
                </div>

                {/* Bio */}
                {speaker.bio && (
                  <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
                    <h2 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      About
                    </h2>
                    <ShowMore className="font-inter prose prose-lg max-w-none text-gray-700">
                      {typeof speaker.bio === 'string' ? (
                        // Split on new lines and render each as a paragraph
                        speaker.bio.split('\n').map(
                          (paragraph, index) =>
                            paragraph.trim() && (
                              <p key={index} className="mb-3 last:mb-0">
                                {paragraph}
                              </p>
                            ),
                        )
                      ) : (
                        <PortableText value={speaker.bio} />
                      )}
                    </ShowMore>
                  </div>
                )}

                {/* Talks Section */}
                {talks && talks.length > 0 && (
                  <div className="mb-8">
                    <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                      {talks.length === 1 ? 'Presentation' : 'Presentations'}
                    </h2>
                    <div className="space-y-6">
                      {talks.map((talk) => (
                        <div
                          key={talk._id}
                          className="rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md"
                        >
                          {/* Talk Header */}
                          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-brand-slate-gray">
                                {talk.title}
                              </h3>
                              <div className="flex flex-wrap gap-3">
                                {/* Format */}
                                {talk.format && (
                                  <span className="inline-flex items-center rounded-full bg-brand-cloud-blue/10 px-3 py-1 text-sm font-medium text-brand-cloud-blue">
                                    {formats.get(talk.format)}
                                  </span>
                                )}
                                {/* Level */}
                                {talk.level && (
                                  <span className="inline-flex items-center rounded-full bg-brand-fresh-green/10 px-3 py-1 text-sm font-medium text-brand-fresh-green">
                                    {levels.get(talk.level)}
                                  </span>
                                )}
                                {/* Language */}
                                {talk.language && (
                                  <span className="inline-flex items-center rounded-full bg-accent-purple/10 px-3 py-1 text-sm font-medium text-accent-purple">
                                    {languages.get(talk.language)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Schedule Info - Only show if available */}
                          </div>

                          {/* Talk Description */}
                          {talk.description && (
                            <div className="mb-4">
                              <div className="font-inter prose prose-gray max-w-none text-gray-700 [&>p]:mb-4 [&>p]:leading-relaxed">
                                {typeof talk.description === 'string' ? (
                                  <p>{talk.description}</p>
                                ) : (
                                  <PortableText value={talk.description} />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Topics */}
                          {talk.topics && talk.topics.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {talk.topics.map((topic, index) => {
                                // Type guard to check if topic is a Topic object (not a Reference)
                                const isTopicObject = (
                                  t: unknown,
                                ): t is Topic =>
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
                                    className="rounded-md bg-brand-sky-mist px-2 py-1 text-xs font-medium text-brand-slate-gray"
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
    </div>
  )
}
