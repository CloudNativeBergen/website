'use client'

import React, { useEffect, useState } from 'react'
import { Tab } from '@headlessui/react'
import clsx from 'clsx'

import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { ClickableSpeakerNames } from '@/components/ClickableSpeakerNames'
import {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'
import { formatSpeakerNamesFromUnknown } from '@/lib/speaker/formatSpeakerNames'
import Link from 'next/link'

interface ScheduleTrackSummary extends ScheduleTrack {
  name: React.ReactNode
}

function ScheduleTabbed({
  tracks,
  date,
}: {
  tracks: ScheduleTrack[]
  date: string
}) {
  const [tabOrientation, setTabOrientation] = useState('horizontal')

  useEffect(() => {
    const smMediaQuery = window.matchMedia('(min-width: 640px)')

    function onMediaQueryChange({ matches }: { matches: boolean }) {
      setTabOrientation(matches ? 'vertical' : 'horizontal')
    }

    onMediaQueryChange(smMediaQuery)
    smMediaQuery.addEventListener('change', onMediaQueryChange)

    return () => {
      smMediaQuery.removeEventListener('change', onMediaQueryChange)
    }
  }, [])

  return (
    <Tab.Group
      as="div"
      className="mx-auto grid max-w-2xl grid-cols-1 gap-y-6 sm:grid-cols-2 lg:hidden"
      vertical={tabOrientation === 'vertical'}
    >
      <Tab.List className="-mx-4 flex gap-x-4 gap-y-10 overflow-x-auto pb-4 pl-4 sm:mx-0 sm:flex-col sm:pr-8 sm:pb-0 sm:pl-0">
        {({ selectedIndex }) => (
          <>
            {tracks.map((track, trackIndex) => (
              <div
                key={`track-${trackIndex}`}
                className={clsx(
                  'relative w-3/4 flex-none pr-4 sm:w-auto sm:pr-0',
                  trackIndex !== selectedIndex && 'opacity-70',
                )}
              >
                <TrackSummary
                  track={{
                    ...track,
                    name: (
                      <Tab className="ui-not-focus-visible:outline-none">
                        <span className="absolute inset-0" />
                        {`Track ${trackIndex + 1}`}
                      </Tab>
                    ),
                  }}
                  date={date}
                />
              </div>
            ))}
          </>
        )}
      </Tab.List>
      <Tab.Panels>
        {tracks.map((track, trackIndex) => (
          <Tab.Panel
            key={`track-${trackIndex}`}
            className="ui-not-focus-visible:outline-none"
          >
            <TimeSlots track={track} date={date} trackIndex={trackIndex} />
          </Tab.Panel>
        ))}
      </Tab.Panels>
    </Tab.Group>
  )
}

function TrackSummary({
  track,
  date,
}: {
  track: ScheduleTrackSummary
  date: string
}) {
  return (
    <>
      <h3 className="text-2xl font-semibold tracking-tight text-blue-900">
        <time dateTime={date}>{track.name}</time>
      </h3>
      <p className="mt-1.5 text-base tracking-tight text-blue-900">
        {track.trackTitle}: {track.trackDescription}
      </p>
    </>
  )
}

function PlaceholderTimeSlot({
  date,
  talk,
}: {
  date: string
  talk: TrackTalk
}) {
  return (
    <Link
      type="button"
      href="/cfp"
      className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 py-3 pb-4 hover:border-gray-400 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
    >
      <p className="mt-1 font-mono text-sm text-slate-500">Submit to speak</p>
      <TimeSlotTime date={date} start={talk.startTime} end={talk.endTime} />
    </Link>
  )
}

function YouTubeEmbed({ url }: { url: string }) {
  // Extract video ID from YouTube URL
  const videoId = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
  )?.[1]

  if (!videoId) return null

  return (
    <div className="mt-4 aspect-video w-full overflow-hidden rounded-lg">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  )
}

function TalkTimeSlot({ date, talk }: { date: string; talk: TrackTalk }) {
  const primarySpeaker = talk.talk?.speakers?.[0]
  const speakers = talk.talk?.speakers
  const hasMultipleSpeakers = speakers && speakers.length > 1

  return (
    <div className="relative block">
      {!talk.talk ||
      !primarySpeaker ||
      !(primarySpeaker && 'slug' in primarySpeaker) ? (
        <h4 className="text-lg font-semibold tracking-tight text-blue-900">
          {talk.talk?.title || talk.placeholder || 'TBD'}
        </h4>
      ) : (
        <div className="block">
          <h4 className="text-lg font-semibold tracking-tight text-blue-900">
            <Link
              href={`/speaker/${primarySpeaker.slug}`}
              className="hover:text-blue-700"
            >
              {talk.talk.title}
            </Link>
          </h4>

          {/* Speaker Info */}
          {speakers && speakers.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <SpeakerAvatars speakers={speakers} maxVisible={3} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-blue-800">
                  <ClickableSpeakerNames
                    speakers={speakers}
                    showFirstNameOnly={true}
                    maxVisible={2}
                    linkClassName="hover:text-blue-600 transition-colors"
                    separatorClassName="text-blue-600"
                  />
                </div>
                {hasMultipleSpeakers && (
                  <p className="text-xs text-blue-600">
                    {speakers.length} speakers
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <TimeSlotTime date={date} start={talk.startTime} end={talk.endTime} />
      {talk.talk?.video && <YouTubeEmbed url={talk.talk.video} />}
    </div>
  )
}

function TimeSlotTime({
  date,
  start,
  end,
}: {
  date: string
  start: string
  end: string
}) {
  return (
    <p className="mt-1 font-mono text-sm text-slate-500">
      <time dateTime={`${date}T${start} CEST`}>{start}</time> -{' '}
      <time dateTime={`${date}T${end} CEST`}>{end}</time>{' '}
    </p>
  )
}

function TimeSlots({
  track,
  date,
  trackIndex,
  className,
}: {
  track: ScheduleTrack
  date: string
  trackIndex: number
  className?: string
}) {
  return (
    <ol
      role="list"
      className={clsx(
        className,
        'space-y-8 bg-white/60 px-10 py-14 text-center shadow-xl shadow-blue-900/5 backdrop-blur',
      )}
    >
      {track.talks.map((talk, talkIndex) => (
        <li
          key={`${trackIndex}-${talk.startTime}`}
          aria-label={`${talk.talk?.title || 'TBD'} talking about ${talk.talk?.description || ''} at ${talk.startTime} - ${talk.endTime}`}
        >
          {talkIndex > 0 && (
            <div className="mx-auto mb-8 h-px w-48 bg-indigo-500/10" />
          )}
          {!talk.talk && !talk.placeholder ? (
            <PlaceholderTimeSlot date={date} talk={talk} />
          ) : (
            <TalkTimeSlot date={date} talk={talk} />
          )}
        </li>
      ))}
    </ol>
  )
}

function ScheduleStatic({
  tracks,
  date,
}: {
  tracks: ScheduleTrack[]
  date: string
}) {
  return (
    <div className="hidden lg:grid lg:grid-cols-3 lg:gap-x-8">
      {tracks.map((track, trackIndex) => (
        <section key={`track-${trackIndex}`}>
          <TrackSummary
            track={{
              ...track,
              name: `Track ${trackIndex + 1}`,
            }}
            date={date}
          />
          <TimeSlots
            track={track}
            date={date}
            trackIndex={trackIndex}
            className="mt-10"
          />
        </section>
      ))}
    </div>
  )
}

export function Schedule({ schedule }: { schedule: ConferenceSchedule }) {
  return (
    <section id="schedule" aria-label="Schedule" className="py-20 sm:py-32">
      <Container className="relative z-10">
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24">
          <h2 className="font-display text-4xl font-medium tracking-tighter text-blue-600 sm:text-5xl">
            Our three-track schedule: Expertly configured and deployed with
            brilliant sessions from the cloud-native ecosystem.
          </h2>
          <p className="font-display mt-4 text-2xl tracking-tight text-blue-900">
            Dive into our multi-cluster mesh of cloud-native knowledge.
            Orchestrate your conference experience by selecting the sessions
            that best scale your expertise.
          </p>
        </div>
      </Container>
      <div className="relative mt-14 sm:mt-24">
        <BackgroundImage className="-top-40 -bottom-32" />
        <Container className="relative">
          <ScheduleTabbed tracks={schedule.tracks} date={schedule.date} />
          <ScheduleStatic tracks={schedule.tracks} date={schedule.date} />
        </Container>
      </div>
    </section>
  )
}
