'use client'

import { useEffect, useId, useState } from 'react'
import { Tab } from '@headlessui/react'
import clsx from 'clsx'
import { ScheduleTrack } from '@/lib/conference/types'
import { sanityImage } from '@/lib/sanity/client'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { DiamondIcon } from '@/components/DiamondIcon'

const selectedTabKey = 'selectedSpeakerTab'

function ImageClipPaths({
  id,
  ...props
}: React.ComponentPropsWithoutRef<'svg'> & { id: string }) {
  return (
    <svg aria-hidden="true" width={0} height={0} {...props}>
      <defs>
        <clipPath id={`${id}-0`} clipPathUnits="objectBoundingBox">
          <path d="M0,0 h0.729 v0.129 h0.121 l-0.016,0.032 C0.815,0.198,0.843,0.243,0.885,0.243 H1 v0.757 H0.271 v-0.086 l-0.121,0.057 v-0.214 c0,-0.032,-0.026,-0.057,-0.057,-0.057 H0 V0" />
        </clipPath>
        <clipPath id={`${id}-1`} clipPathUnits="objectBoundingBox">
          <path d="M1,1 H0.271 v-0.129 H0.15 l0.016,-0.032 C0.185,0.802,0.157,0.757,0.115,0.757 H0 V0 h0.729 v0.086 l0.121,-0.057 v0.214 c0,0.032,0.026,0.057,0.057,0.057 h0.093 v0.7" />
        </clipPath>
        <clipPath id={`${id}-2`} clipPathUnits="objectBoundingBox">
          <path d="M1,0 H0.271 v0.129 H0.15 l0.016,0.032 C0.185,0.198,0.157,0.243,0.115,0.243 H0 v0.757 h0.729 v-0.086 l0.121,0.057 v-0.214 c0,-0.032,0.026,-0.057,0.057,-0.057 h0.093 V0" />
        </clipPath>
      </defs>
    </svg>
  )
}

function SubmitToSpeakLi() {
  return (
    <li
      key="submit-to-speak-1"
      className="col-span-1 flex flex-col divide-y divide-gray-200 rounded-lg bg-white text-center"
    >
      <div className="p-10">
        <Button
          href="/cfp"
          variant="outline"
          className="w-full border-2 border-dashed border-brand-frosted-steel hover:border-brand-cloud-blue focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2"
        >
          <p className="font-jetbrains text-sm text-brand-slate-gray">
            Become a speaker
          </p>
        </Button>
      </div>
    </li>
  )
}
export function Speakers({ tracks }: { tracks: ScheduleTrack[] }) {
  const id = useId()
  const [tabOrientation, setTabOrientation] = useState('horizontal')
  const [selectedTabIndex, setSelectedTabIndex] = useState(0)

  // @TODO check if there are actually speakers
  const hasSpeakers = tracks.some((track) => track.talks.length > 0)

  useEffect(() => {
    const lgMediaQuery = window.matchMedia('(min-width: 1024px)')

    function onMediaQueryChange({ matches }: { matches: boolean }) {
      setTabOrientation(matches ? 'vertical' : 'horizontal')
    }

    onMediaQueryChange(lgMediaQuery)
    lgMediaQuery.addEventListener('change', onMediaQueryChange)

    return () => {
      lgMediaQuery.removeEventListener('change', onMediaQueryChange)
    }
  }, [])

  useEffect(() => {
    const previousSelectedTabIndex = sessionStorage.getItem(selectedTabKey)
    const previousSelectedTabIndexNumber = Number.parseInt(
      previousSelectedTabIndex ?? '0',
      10,
    )

    if (!Number.isNaN(previousSelectedTabIndexNumber)) {
      setSelectedTabIndex(previousSelectedTabIndexNumber)
    }
  }, [])

  const handleChangeTab = (newTabIndex: number) => {
    sessionStorage.setItem(selectedTabKey, newTabIndex.toString())
    setSelectedTabIndex(newTabIndex)
  }

  return (
    <section
      id="speakers"
      aria-labelledby="speakers-title"
      className="py-20 sm:py-32"
    >
      <ImageClipPaths id={id} />
      <Container>
        <div className="mx-auto max-w-2xl lg:mx-0">
          <h2
            id="speakers-title"
            className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl"
          >
            Our Speakers
          </h2>
          <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray">
            Learn from yaml-experts and cloud-native nerds from Bergen and
            around the world at Cloud Native Day Bergen.
          </p>
          {!hasSpeakers && (
            <ul
              role="list"
              className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3"
            >
              <SubmitToSpeakLi />
              <SubmitToSpeakLi />
              <SubmitToSpeakLi />
              <SubmitToSpeakLi />
              <SubmitToSpeakLi />
              <SubmitToSpeakLi />
            </ul>
          )}
        </div>
        {hasSpeakers && (
          <Tab.Group
            as="div"
            className="mt-14 grid grid-cols-1 items-start gap-x-8 gap-y-8 sm:mt-16 sm:gap-y-16 lg:mt-24 lg:grid-cols-4"
            vertical={tabOrientation === 'vertical'}
            selectedIndex={selectedTabIndex}
            onChange={handleChangeTab}
          >
            <div className="relative -mx-4 flex overflow-x-auto pb-4 sm:mx-0 sm:block sm:overflow-visible sm:pb-0">
              <div className="absolute top-2 bottom-0 left-0.5 hidden w-px bg-slate-200 lg:block" />
              <Tab.List className="grid auto-cols-auto grid-flow-col justify-start gap-x-8 gap-y-10 px-4 whitespace-nowrap sm:mx-auto sm:max-w-2xl sm:grid-cols-3 sm:px-0 sm:text-center lg:grid-flow-row lg:grid-cols-1 lg:text-left">
                {({ selectedIndex }) => (
                  <>
                    {tracks.map((track, trackNumber) => (
                      <div
                        key={`track-${trackNumber}`}
                        className="relative lg:pl-8"
                      >
                        <DiamondIcon
                          className={clsx(
                            'absolute top-[0.5625rem] left-[-0.5px] hidden h-1.5 w-1.5 overflow-visible lg:block',
                            trackNumber === selectedIndex
                              ? 'fill-blue-600 stroke-blue-600'
                              : 'fill-transparent stroke-slate-400',
                          )}
                        />
                        <div className="relative">
                          <div
                            className={clsx(
                              'font-mono text-sm',
                              trackNumber === selectedIndex
                                ? 'text-blue-600'
                                : 'text-slate-500',
                            )}
                          >
                            <Tab className="ui-not-focus-visible:outline-none">
                              <span className="absolute inset-0" />
                              {track.trackTitle}
                            </Tab>
                          </div>
                          <time
                            // @TODO get the date of the track
                            dateTime={''}
                            className="mt-1.5 block text-2xl font-semibold tracking-tight text-blue-900"
                          >
                            {`Track ${trackNumber + 1}`}
                          </time>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </Tab.List>
            </div>
            <Tab.Panels className="lg:col-span-3">
              {tracks.map((track, trackNumber) => {
                const uniqueSpeakers = Array.from(
                  track.talks
                    .reduce((acc, talk) => {
                      if (
                        talk.talk &&
                        talk.talk.speaker &&
                        'slug' in talk.talk.speaker
                      ) {
                        acc.set(talk.talk.speaker.slug, talk.talk.speaker)
                      }
                      return acc
                    }, new Map())
                    .values(),
                )

                return (
                  <Tab.Panel
                    key={trackNumber}
                    className="ui-not-focus-visible:outline-none grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 sm:gap-y-16 md:grid-cols-3"
                    unmount={false}
                  >
                    {uniqueSpeakers.map((speaker, speakerIndex) => (
                      <div key={speakerIndex}>
                        <div className="group relative h-[17.5rem] transform overflow-hidden rounded-4xl">
                          <div
                            className={clsx(
                              'absolute top-0 right-4 bottom-6 left-0 rounded-4xl border transition duration-300 group-hover:scale-95 xl:right-6',
                              [
                                'border-blue-300',
                                'border-indigo-300',
                                'border-sky-300',
                              ][speakerIndex % 3],
                            )}
                          />
                          <div
                            className="absolute inset-0 bg-indigo-50"
                            style={{
                              clipPath: `url(#${id}-${speakerIndex % 3})`,
                            }}
                          >
                            <a
                              href={`/speaker/${speaker.slug}`}
                              className="absolute inset-0"
                            >
                              <img
                                className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-110"
                                loading="lazy"
                                src={
                                  speaker.image
                                    ? sanityImage(speaker.image)
                                        .width(600)
                                        .height(600)
                                        .fit('crop')
                                        .url()
                                    : 'https://placehold.co/600x600/e5e7eb/6b7280?text=Speaker'
                                }
                                width={300}
                                height={300}
                                alt=""
                              />
                            </a>
                          </div>
                        </div>
                        <h3 className="font-display mt-8 text-xl font-bold tracking-tight text-slate-900">
                          {speaker.name}
                        </h3>
                        <p className="mt-1 text-base tracking-tight text-slate-500">
                          {speaker.title}
                        </p>
                      </div>
                    ))}
                  </Tab.Panel>
                )
              })}
            </Tab.Panels>
          </Tab.Group>
        )}
      </Container>
    </section>
  )
}
