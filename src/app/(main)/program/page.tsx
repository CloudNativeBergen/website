import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import clsx from 'clsx'
import Link from 'next/link'

export const revalidate = 3600

interface Slot {
  // title, start_time and end_time is only set for service slots (e.g. breaks)
  title?: string
  start_time?: string
  end_time?: string
  tracks: SlotTrack[]
}

interface SlotTrack {
  title: string
  talks: SlotItem[]
}

interface SlotItem extends TrackTalk {
  trackIndex: number
  trackTitle: string
}

function timeDiff(start: string, end: string) {
  const [startHours, startMinutes] = start.split(':').map(Number)
  const [endHours, endMinutes] = end.split(':').map(Number)

  const startTime = new Date()
  startTime.setHours(startHours, startMinutes, 0, 0)

  const endTime = new Date()
  endTime.setHours(endHours, endMinutes, 0, 0)

  const timeDifference = endTime.getTime() - startTime.getTime()
  return timeDifference
}

function scheduleToSlots(schedule: ConferenceSchedule) {
  const slots: Slot[] = []

  let previousItem
  let currentSlotIndex = 0

  for (const [trackIndex, track] of schedule.tracks.entries()) {
    for (const [itemIndex, item] of track.talks.entries()) {
      if (!item.talk) {
        continue
      }

      if (previousItem) {
        if (itemIndex === 0) {
          currentSlotIndex = 0
        } else if (
          !item.talk?.speakers ||
          item.talk.speakers.length === 0 ||
          !previousItem.talk?.speakers ||
          previousItem.talk.speakers.length === 0
        ) {
          currentSlotIndex++
        } else if (item.startTime !== previousItem.endTime) {
          const timeDifference = timeDiff(previousItem.endTime, item.startTime)
          if (timeDifference > 10 * 60 * 1000) {
            currentSlotIndex++
            slots[currentSlotIndex] = {
              title: 'Break',
              start_time: previousItem.endTime,
              end_time: item.startTime,
              tracks: [],
            }
            currentSlotIndex++
          }
        }
      }

      if (!slots[currentSlotIndex]) {
        slots[currentSlotIndex] = {
          tracks: [],
        }

        if (!item.talk?.speakers || item.talk.speakers.length === 0) {
          slots[currentSlotIndex].title = item.talk?.title
          slots[currentSlotIndex].start_time = item.startTime
          slots[currentSlotIndex].end_time = item.endTime
        }
      }

      if (!slots[currentSlotIndex].tracks[trackIndex]) {
        slots[currentSlotIndex].tracks[trackIndex] = {
          //number: item.trackIndex,
          title: track.trackTitle,
          talks: [],
        }
      }

      slots[currentSlotIndex].tracks[trackIndex].talks.push({
        ...item,
        trackIndex: trackIndex,
        trackTitle: track.trackTitle,
      })

      previousItem = item
    }
  }

  return slots
}

export default async function Info() {
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: false,
    schedule: true,
  })

  if (error) {
    console.error('Error fetching conference data:', error)
    return (
      <div className="container mx-auto mt-10">
        <h2 className="text-lg font-bold text-red-600">
          Error loading conference data
        </h2>
        <p className="text-gray-600">Please try again later.</p>
      </div>
    )
  }

  const slots =
    conference.schedules && conference.schedules.length > 0
      ? scheduleToSlots(conference.schedules[0])
      : []

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="container mx-auto">
            <div className="text-left">
              <h1 className="text-3xl leading-9 font-bold tracking-tight text-gray-900 sm:text-4xl">
                Conference Program
              </h1>
              <p className="mt-4 text-lg leading-7 text-gray-600">
                Here you can find the program for Cloud Native Day Bergen.
              </p>
            </div>
          </div>

          {/* Schedule Layout */}
          <div className="container mx-auto mt-10">
            {slots.map((slot, slotIndex) =>
              slot.title ? (
                <div
                  key={slotIndex}
                  className="mb-4 rounded-lg bg-white p-4 shadow"
                >
                  <h2 className="text-lg font-bold">
                    {slot.title} {slot.start_time} - {slot.end_time}
                  </h2>
                </div>
              ) : (
                <div
                  key={slotIndex}
                  className="mb-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
                >
                  {slot.tracks.map((track, trackIndex) => (
                    <div
                      key={trackIndex}
                      className="rounded-lg bg-white p-4 shadow-lg"
                    >
                      <h3
                        className={clsx(
                          'text-xl font-semibold',
                          track.title === 'Platform Engineering (Teglverket)'
                            ? 'text-green-600'
                            : '',
                          track.title === 'Cloud Native Technology (Tivoli)'
                            ? 'text-red-600'
                            : '',
                          track.title === 'Observability (Storelogen)'
                            ? 'text-blue-600'
                            : '',
                        )}
                      >
                        {track.title}
                      </h3>
                      {track.talks.map((talk, talkIndex) => (
                        <div key={talkIndex} className="mt-4">
                          <p>{talk.startTime}</p>
                          <p>
                            <Link
                              href={`/speaker/${talk.talk!.speakers && talk.talk!.speakers.length > 0 && 'slug' in talk.talk!.speakers[0] ? talk.talk!.speakers[0].slug : ''}`}
                              className="hover:underline"
                            >
                              <span className="font-semibold">
                                {' '}
                                {talk.talk!.title}{' '}
                              </span>
                              (
                              {timeDiff(talk.startTime, talk.endTime) /
                                1000 /
                                60}{' '}
                              minutes)
                            </Link>
                          </p>
                          <p className="text-gray-500">
                            by{' '}
                            {talk.talk!.speakers &&
                            talk.talk!.speakers.length > 0 &&
                            'name' in talk.talk!.speakers[0]
                              ? talk.talk!.speakers[0].name
                              : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
        </Container>
      </div>
    </>
  )
}
