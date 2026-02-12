import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { FilteredProgramData } from '@/hooks/useProgramFilter'
import { ConferenceSchedule, ScheduleTrack } from '@/lib/conference/types'
import { TalkCard } from './TalkCard'
import { getTalkStatusKey } from '@/lib/program/time-utils'
import type { TalkStatus, CurrentPosition } from '@/lib/program/time-utils'
import { formatConferenceDateLong } from '@/lib/time'
import clsx from 'clsx'

interface ProgramScheduleViewProps {
  data: FilteredProgramData
  talkStatusMap?: Map<string, TalkStatus>
  currentPosition?: CurrentPosition | null
  isLive?: boolean
}

const SCROLL_THRESHOLD = 5
const SCROLL_DELAY = 100
const MOBILE_BREAKPOINT = '(min-width: 640px)'

const getAllTimeSlots = (tracks: ScheduleTrack[]): string[] => {
  const timeSlots = new Set<string>()
  tracks.forEach((track) => {
    track.talks.forEach((talk) => {
      timeSlots.add(talk.startTime)
    })
  })
  return Array.from(timeSlots).sort()
}

const getTalkAtTime = (track: ScheduleTrack, startTime: string) => {
  return track.talks.find((talk) => talk.startTime === startTime)
}

const ScheduleTabbed = React.memo(function ScheduleTabbed({
  tracks,
  date,
  talkStatusMap,
  currentPosition,
  scheduleIndex,
  scrollTargetRef,
}: {
  tracks: ScheduleTrack[]
  date: string
  talkStatusMap?: Map<string, TalkStatus>
  currentPosition?: CurrentPosition | null
  scheduleIndex: number
  scrollTargetRef: React.RefObject<HTMLDivElement | null>
}) {
  const [tabOrientation, setTabOrientation] = useState('horizontal')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const tabListRef = useRef<HTMLDivElement>(null)
  const hasUserInteracted = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const trackKeys = useMemo(
    () => tracks.map((_, index) => `track-${index}`),
    [tracks],
  )

  const scrollToSelectedTab = useCallback(
    (index: number) => {
      if (
        tabOrientation !== 'horizontal' ||
        !tabListRef.current ||
        index < 0 ||
        index >= tracks.length
      ) {
        return
      }

      const tabList = tabListRef.current
      const selectedTab = tabList.children[index] as HTMLElement

      if (!selectedTab) {
        console.warn(`Tab at index ${index} not found`)
        return
      }

      try {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }

        const containerScrollLeft = tabList.scrollLeft
        const containerWidth = tabList.clientWidth
        const tabLeft = selectedTab.offsetLeft
        const tabWidth = selectedTab.offsetWidth

        const tabCenter = tabLeft + tabWidth / 2
        const containerCenter = containerWidth / 2
        const newScrollLeft = tabCenter - containerCenter

        const maxScrollLeft = Math.max(0, tabList.scrollWidth - containerWidth)
        const clampedScrollLeft = Math.max(
          0,
          Math.min(newScrollLeft, maxScrollLeft),
        )

        if (
          Math.abs(clampedScrollLeft - containerScrollLeft) > SCROLL_THRESHOLD
        ) {
          tabList.scrollTo({
            left: clampedScrollLeft,
            behavior: 'smooth',
          })
        }

        scrollTimeoutRef.current = setTimeout(() => {
          const tabListTop =
            tabList.getBoundingClientRect().top + window.scrollY
          window.scrollTo({
            top: tabListTop,
            behavior: 'smooth',
          })
        }, SCROLL_DELAY)
      } catch (error) {
        console.error('Error during tab scrolling:', error)
      }
    },
    [tabOrientation, tracks.length],
  )

  const handleTabClick = useCallback(
    (index: number) => {
      hasUserInteracted.current = true
      const wasAlreadySelected = selectedIndex === index
      setSelectedIndex(index)

      if (wasAlreadySelected) {
        scrollToSelectedTab(index)
      }
    },
    [selectedIndex, scrollToSelectedTab],
  )

  useEffect(() => {
    const smMediaQuery = window.matchMedia(MOBILE_BREAKPOINT)

    const onMediaQueryChange = ({ matches }: { matches: boolean }) => {
      setTabOrientation(matches ? 'vertical' : 'horizontal')
    }

    onMediaQueryChange(smMediaQuery)
    smMediaQuery.addEventListener('change', onMediaQueryChange)

    return () => {
      smMediaQuery.removeEventListener('change', onMediaQueryChange)
    }
  }, [])

  useEffect(() => {
    if (!hasUserInteracted.current) {
      return
    }

    scrollToSelectedTab(selectedIndex)

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [selectedIndex, scrollToSelectedTab])

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  return (
    <TabGroup
      as="div"
      className="mx-auto grid max-w-2xl grid-cols-1 gap-y-4 sm:grid-cols-2 lg:hidden"
      vertical={tabOrientation === 'vertical'}
      selectedIndex={selectedIndex}
      onChange={handleTabClick}
    >
      <TabList
        ref={tabListRef}
        className="-mx-4 flex gap-x-4 gap-y-6 overflow-x-auto pb-4 pl-4 sm:mx-0 sm:flex-col sm:pr-8 sm:pb-0 sm:pl-0"
      >
        {tracks.map((track, trackIndex) => (
          <div
            key={trackKeys[trackIndex]}
            className={clsx(
              'relative w-3/4 flex-none pr-4 sm:w-auto sm:pr-0',
              trackIndex !== selectedIndex && 'opacity-70',
            )}
          >
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-4 dark:border-gray-600 dark:bg-gray-800">
              <h3 className="font-space-grotesk text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                <Tab className="ui-not-focus-visible:outline-none">
                  <span className="absolute inset-0" />
                  <time dateTime={date}>{track.trackTitle}</time>
                </Tab>
              </h3>
              <p className="font-inter mt-1 text-sm text-brand-slate-gray dark:text-gray-300">
                {track.trackDescription}
              </p>
            </div>
          </div>
        ))}
      </TabList>
      <TabPanels>
        {tracks.map((track, trackIndex) => (
          <TabPanel
            key={trackKeys[trackIndex]}
            className="ui-not-focus-visible:outline-none"
          >
            <div className="space-y-3">
              {track.talks.map((talk, talkIndex) => {
                const talkData = {
                  ...talk,
                  scheduleDate: date,
                  trackTitle: track.trackTitle,
                  trackIndex,
                }
                const status = talkStatusMap?.get(
                  getTalkStatusKey(
                    date,
                    talk.startTime,
                    trackIndex,
                    talk.talk?._id,
                  ),
                )
                const isScrollTarget =
                  currentPosition &&
                  currentPosition.scheduleIndex === scheduleIndex &&
                  currentPosition.trackIndex === trackIndex &&
                  currentPosition.talkIndex === talkIndex
                return (
                  <div
                    key={`mobile-talk-${trackIndex}-${talkIndex}-${talk.startTime}-${talk.talk?._id || talk.placeholder || 'empty'}`}
                    ref={isScrollTarget ? scrollTargetRef : undefined}
                  >
                    <TalkCard
                      talk={talkData}
                      status={status}
                      compact={true}
                      fixedHeight={true}
                    />
                  </div>
                )
              })}
            </div>
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  )
})

const ScheduleStatic = React.memo(function ScheduleStatic({
  tracks,
  date,
  talkStatusMap,
  currentPosition,
  scheduleIndex,
  scrollTargetRef,
}: {
  tracks: ScheduleTrack[]
  date: string
  talkStatusMap?: Map<string, TalkStatus>
  currentPosition?: CurrentPosition | null
  scheduleIndex: number
  scrollTargetRef: React.RefObject<HTMLDivElement | null>
}) {
  const timeSlots = getAllTimeSlots(tracks)

  return (
    <div className="hidden lg:block">
      <div
        className="mb-6 grid gap-x-4"
        style={{
          gridTemplateColumns: `120px repeat(${tracks.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="font-space-grotesk text-sm font-medium text-brand-slate-gray dark:text-gray-300">
          Time
        </div>
        {tracks.map((track, trackIndex) => (
          <div
            key={`header-${trackIndex}`}
            className="rounded-lg border border-brand-frosted-steel bg-white p-3 dark:border-gray-600 dark:bg-gray-800"
          >
            <h3 className="font-space-grotesk text-sm font-semibold text-brand-cloud-blue dark:text-blue-400">
              {track.trackTitle}
            </h3>
            {track.trackDescription && (
              <p className="font-inter mt-1 line-clamp-2 text-xs text-brand-slate-gray dark:text-gray-300">
                {track.trackDescription}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {timeSlots.map((timeSlot) => {
          return (
            <div
              key={timeSlot}
              className="grid items-start gap-x-4"
              style={{
                gridTemplateColumns: `120px repeat(${tracks.length}, minmax(0, 1fr))`,
              }}
            >
              <div className="sticky left-0 bg-white p-2 text-center dark:bg-gray-900">
                <div className="font-mono text-sm font-medium text-brand-slate-gray dark:text-gray-300">
                  {timeSlot}
                </div>
              </div>

              {tracks.map((track, trackIndex) => {
                const talk = getTalkAtTime(track, timeSlot)
                const talkIndex = talk
                  ? track.talks.findIndex((t) => t.startTime === talk.startTime)
                  : -1
                const isScrollTarget =
                  talk &&
                  talkIndex !== -1 &&
                  currentPosition &&
                  currentPosition.scheduleIndex === scheduleIndex &&
                  currentPosition.trackIndex === trackIndex &&
                  currentPosition.talkIndex === talkIndex

                return (
                  <div
                    key={`${timeSlot}-track-${trackIndex}-${track.trackTitle}`}
                    className="min-h-15"
                    ref={isScrollTarget ? scrollTargetRef : undefined}
                  >
                    {talk ? (
                      <TalkCard
                        key={`talk-${timeSlot}-${trackIndex}-${talk.talk?._id || talk.placeholder || 'empty'}`}
                        talk={{
                          ...talk,
                          scheduleDate: date,
                          trackTitle: track.trackTitle,
                          trackIndex,
                        }}
                        status={talkStatusMap?.get(
                          getTalkStatusKey(
                            date,
                            talk.startTime,
                            trackIndex,
                            talk.talk?._id,
                          ),
                        )}
                        compact={true}
                        fixedHeight={true}
                      />
                    ) : (
                      <div className="h-full min-h-15" />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
})

const DaySchedule = React.memo(function DaySchedule({
  schedule,
  talkStatusMap,
  currentPosition,
  scheduleIndex,
  scrollTargetRef,
}: {
  schedule: ConferenceSchedule
  talkStatusMap?: Map<string, TalkStatus>
  currentPosition?: CurrentPosition | null
  scheduleIndex: number
  scrollTargetRef: React.RefObject<HTMLDivElement | null>
}) {
  if (schedule.tracks.length === 0) {
    return (
      <div className="py-12 text-center">
        <MagnifyingGlassIcon className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
        <p className="font-inter text-gray-600 dark:text-gray-400">
          No talks scheduled for this day with current filters.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
          {formatConferenceDateLong(schedule.date)}
        </h2>
        <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-400">
          {schedule.tracks.length} track
          {schedule.tracks.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-6">
        <ScheduleTabbed
          tracks={schedule.tracks}
          date={schedule.date}
          talkStatusMap={talkStatusMap}
          currentPosition={currentPosition}
          scheduleIndex={scheduleIndex}
          scrollTargetRef={scrollTargetRef}
        />
        <ScheduleStatic
          tracks={schedule.tracks}
          date={schedule.date}
          talkStatusMap={talkStatusMap}
          currentPosition={currentPosition}
          scheduleIndex={scheduleIndex}
          scrollTargetRef={scrollTargetRef}
        />
      </div>
    </div>
  )
})

export const ProgramScheduleView = React.memo(function ProgramScheduleView({
  data,
  talkStatusMap,
  currentPosition,
  isLive,
}: ProgramScheduleViewProps) {
  const scrollTargetRef = useRef<HTMLDivElement>(null)
  const hasScrolledRef = useRef(false)

  useEffect(() => {
    if (
      !isLive ||
      !currentPosition ||
      !scrollTargetRef.current ||
      hasScrolledRef.current
    ) {
      return
    }

    hasScrolledRef.current = true
    setTimeout(() => {
      scrollTargetRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 100)
  }, [isLive, currentPosition])

  if (data.schedules.length === 0) {
    return (
      <div className="py-16 text-center">
        <MagnifyingGlassIcon className="mx-auto mb-4 h-16 w-16 text-gray-400 dark:text-gray-500" />
        <h3 className="font-space-grotesk mb-2 text-lg font-medium text-brand-slate-gray dark:text-gray-200">
          No scheduled content found
        </h3>
        <p className="font-inter text-gray-600 dark:text-gray-400">
          Try adjusting your filters to see more content.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {data.schedules.map((schedule, scheduleIndex) => (
        <div key={schedule._id || `schedule-${scheduleIndex}`}>
          <DaySchedule
            schedule={schedule}
            talkStatusMap={talkStatusMap}
            currentPosition={currentPosition}
            scheduleIndex={scheduleIndex}
            scrollTargetRef={scrollTargetRef}
          />
          {scheduleIndex < data.schedules.length - 1 && (
            <div className="mt-8 border-t border-brand-frosted-steel dark:border-gray-700" />
          )}
        </div>
      ))}
    </div>
  )
})
