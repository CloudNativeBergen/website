'use client'

import { DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { UserIcon as UserIconSolid } from '@heroicons/react/24/solid'
import { PortableText } from '@portabletext/react'
import { portableTextComponents } from '@/lib/portabletext/components'
import { Speaker, Flags, flags } from '@/lib/speaker/types'
import { AttachmentDisplay } from '@/components/proposal/AttachmentDisplay'
import {
  ProposalExisting,
  formats,
  levels,
  languages,
} from '@/lib/proposal/types'
import { Topic } from '@/lib/topic/types'
import { sanityImage } from '@/lib/sanity/client'
import { hasBlueskySocial } from '@/lib/bluesky/utils'
import { ShowMore } from '@/components/ShowMore'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { ClickableSpeakerNames } from '@/components/ClickableSpeakerNames'
import { BlueskyFeed } from '@/components/BlueskyFeed'
import { ScrollFadeBlueskyFeed } from '@/components/ScrollFadeBlueskyFeed'
import { iconForLink, titleForLink } from '@/components/SocialIcons'
import { ModalShell } from '@/components/ModalShell'

export interface SpeakerProfilePreviewProps {
  isOpen: boolean
  onClose: () => void
  speaker: Speaker
  talks: ProposalExisting[]
}

export default function SpeakerProfilePreview({
  isOpen,
  onClose,
  speaker,
  talks,
}: SpeakerProfilePreviewProps) {
  const blueskyHandle = hasBlueskySocial(speaker.links || [])

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      padded={false}
      className="flex max-h-[90vh] transform flex-col overflow-hidden bg-brand-glacier-white text-left align-middle transition-all"
    >
      <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
        <DialogTitle
          as="h2"
          className="font-space-grotesk text-2xl font-bold text-brand-slate-gray dark:text-white"
        >
          Speaker Profile Preview
        </DialogTitle>
        <button
          onClick={onClose}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close modal"
        >
          <XMarkIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {speaker.image ? (
                <img
                  src={
                    sanityImage(speaker.image)
                      .width(400)
                      .height(400)
                      .fit('crop')
                      .url() || undefined
                  }
                  alt={speaker.name}
                  className="mx-auto h-48 w-48 rounded-full object-cover shadow-lg ring-4 ring-white lg:mx-0 lg:h-64 lg:w-64 dark:ring-gray-700"
                />
              ) : (
                <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-full bg-blue-100 shadow-lg ring-4 ring-white lg:mx-0 lg:h-64 lg:w-64 dark:bg-blue-900/30 dark:ring-gray-700">
                  <UserIconSolid className="h-24 w-24 text-blue-500 dark:text-blue-400" />
                </div>
              )}

              {speaker.flags?.includes(Flags.localSpeaker) && (
                <div className="flex items-center space-x-2 rounded-lg bg-brand-fresh-green/10 p-3">
                  <span className="text-2xl">🇳🇴</span>
                  <span className="text-sm font-medium text-brand-fresh-green">
                    {flags.get(Flags.localSpeaker)}
                  </span>
                </div>
              )}

              {speaker.links && speaker.links.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold tracking-wide text-gray-700 uppercase dark:text-gray-300">
                    Connect
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {speaker.links.map((link: string) => {
                      const label = titleForLink(link)

                      return (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md transition-all hover:scale-105 hover:shadow-lg dark:bg-gray-800 dark:hover:bg-gray-700"
                          title={label}
                        >
                          {iconForLink(
                            link,
                            'h-5 w-5 text-brand-slate-gray dark:text-gray-300',
                          )}
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}

              {blueskyHandle && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold tracking-wide text-gray-700 uppercase dark:text-gray-300">
                    Bluesky Feed
                  </h3>
                  <div className="hidden h-96 overflow-hidden rounded-xl lg:block">
                    <BlueskyFeed blueskyHandle={blueskyHandle} />
                  </div>
                  <div className="lg:hidden">
                    <ScrollFadeBlueskyFeed
                      blueskyHandle={blueskyHandle}
                      postCount={1}
                      compact
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8 lg:col-span-2">
            <div>
              <h1 className="font-space-grotesk mb-2 text-4xl font-bold text-brand-slate-gray dark:text-white">
                {speaker.name}
              </h1>
              {speaker.title && (
                <p className="text-xl text-gray-600 dark:text-gray-400">
                  {speaker.title}
                </p>
              )}
            </div>

            {speaker.bio && (
              <div className="prose prose-lg dark:prose-invert font-inter max-w-none">
                <h2 className="font-space-grotesk mb-4 text-2xl font-bold text-brand-slate-gray dark:text-white">
                  About
                </h2>
                {typeof speaker.bio === 'string' ? (
                  <ShowMore>
                    <p>{speaker.bio}</p>
                  </ShowMore>
                ) : (
                  <ShowMore>
                    <PortableText
                      value={speaker.bio}
                      components={portableTextComponents}
                    />
                  </ShowMore>
                )}
              </div>
            )}

            {talks.length > 0 && (
              <div>
                <h2 className="font-space-grotesk mb-6 text-2xl font-bold text-brand-slate-gray dark:text-white">
                  Talks
                </h2>
                <div className="space-y-6">
                  {talks.map((talk) => (
                    <div
                      key={talk._id}
                      className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800"
                    >
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-brand-slate-gray dark:text-white">
                            {talk.title}
                          </h3>
                          <div className="mb-3 flex flex-wrap gap-2">
                            {talk.format && (
                              <span className="rounded-full bg-brand-cloud-blue/10 px-3 py-1 text-xs font-medium text-brand-cloud-blue">
                                {formats.get(talk.format)}
                              </span>
                            )}
                            {talk.level && (
                              <span className="rounded-full bg-brand-fresh-green/10 px-3 py-1 text-xs font-medium text-brand-fresh-green">
                                {levels.get(talk.level)}
                              </span>
                            )}
                            {talk.language && (
                              <span className="bg-brand-sunset-orange/10 text-brand-sunset-orange rounded-full px-3 py-1 text-xs font-medium">
                                {languages.get(talk.language)}
                              </span>
                            )}
                          </div>
                        </div>

                        {talk.speakers && talk.speakers.length > 1 && (
                          <div className="flex items-center space-x-3 border-y border-gray-200 py-3 dark:border-gray-700">
                            <SpeakerAvatars
                              speakers={talk.speakers}
                              size="sm"
                            />
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              <span className="font-medium">Speakers: </span>
                              <ClickableSpeakerNames speakers={talk.speakers} />
                            </div>
                          </div>
                        )}

                        {talk.attachments && talk.attachments.length > 0 && (
                          <div className="mb-4">
                            <AttachmentDisplay
                              attachments={talk.attachments}
                              showVideos={true}
                            />
                          </div>
                        )}

                        {talk.description && (
                          <div className="prose prose-sm dark:prose-invert font-inter max-w-none">
                            {typeof talk.description === 'string' ? (
                              <p className="text-gray-700 dark:text-gray-300">
                                {talk.description}
                              </p>
                            ) : (
                              <PortableText value={talk.description} />
                            )}
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
                                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                >
                                  {topicObj?.title || 'Topic'}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
