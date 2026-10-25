'use client'

import clsx from 'clsx'
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ScreenBoard,
  useLiveScreenPoll,
  type ScreenConference,
} from '@/components/photo-wall'
import type { ConferenceSchedule } from '@/lib/conference/types'
import type { ScreenView } from '@/lib/photo-wall/screen'
import type { WallLook } from '@/lib/photo-wall/types'
import { onSimulatedTimeChange } from '@/lib/program/dev-time'
import { getCurrentConferenceTime } from '@/lib/program/time-utils'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { roomTrackOn, trackSponsorOf } from '@/lib/stream/track-sponsor'
import {
  CROSSFADE_MS,
  holdsRoom,
  nextTurn,
  type Turn,
} from '@/lib/stream/wall-rotation'

/** How often the rotation looks at the clock, the wall and the hold. */
const TICK_MS = 1_000

/** What a room screen needs to show the wall in turns. */
export interface StreamWall {
  initial: ScreenView
  conference: ScreenConference
  /** The room link's `?look=`, overriding the wall's look. */
  look?: WallLook
}

/**
 * A wall that fails to render leaves the room view alone on screen, and is
 * tried again with the next poll's answer (`retryKey`); the room screen has
 * no error page that reloads, as `/wall/screen` has.
 */
class WallBoundary extends Component<
  { retryKey: number; onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('The Photo Wall failed on the room screen', error)
    this.props.onError()
  }
  componentDidUpdate(previous: { retryKey: number }) {
    if (this.state.failed && previous.retryKey !== this.props.retryKey) {
      this.setState({ failed: false })
    }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * A room's stream screen with the Photo Wall in turns (`?wall=1`): the room
 * view, then Screen Mode over it, full screen, crossfading. Both stay
 * mounted, so a turn starts at once and the photos never reload. The wall
 * takes its turn only while open, never in the minutes before the room's
 * next talk, and thanks a sponsored room's track sponsor alone.
 */
export function StreamWallRotation({
  schedules,
  roomTrackTitle,
  sponsors,
  wall,
  children,
}: {
  schedules: ConferenceSchedule[]
  roomTrackTitle: string
  sponsors: ConferenceSponsor[]
  wall: StreamWall
  /** The room view. */
  children: ReactNode
}) {
  const poll = useLiveScreenPoll(wall.initial)
  // The answer the wall failed to render: no turns until the next one.
  const [failedAt, setFailedAt] = useState<number | null>(null)
  const wallOpen =
    failedAt !== poll.dataUpdatedAt && !poll.gone && poll.data?.closed === false

  // The tick reads the latest poll, not the one it was set up with.
  const wallOpenRef = useRef(wallOpen)
  useEffect(() => {
    wallOpenRef.current = wallOpen
  }, [wallOpen])

  // Null until the first tick: the server renders the room view, and cannot
  // know the screen's day (or the simulated time).
  const [turn, setTurn] = useState<Turn | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const started = Date.now()
    const tick = () => {
      const conferenceNow = getCurrentConferenceTime()
      setNow(conferenceNow)
      setTurn((current) =>
        nextTurn(current ?? { view: 'room', since: started }, {
          // Turns run on the screen's own clock; the hold, on the
          // conference's, which a simulated time can move.
          now: Date.now(),
          wallOpen: wallOpenRef.current,
          held: holdsRoom(schedules, roomTrackTitle, conferenceNow),
        }),
      )
    }
    tick()
    const interval = setInterval(tick, TICK_MS)
    const unsubscribe = onSimulatedTimeChange(tick)
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [schedules, roomTrackTitle])

  const track = roomTrackOn(schedules, roomTrackTitle, now ?? new Date(0))
  const trackSponsor = track ? trackSponsorOf(track, sponsors) : null
  const showWall = turn?.view === 'wall'

  return (
    <>
      <div inert={showWall}>{children}</div>
      <div
        data-testid="stream-wall"
        data-shown={showWall || undefined}
        inert={!showWall}
        className={clsx(
          'fixed inset-0 z-50 transition-opacity ease-in-out motion-reduce:transition-none',
          showWall ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ transitionDuration: `${CROSSFADE_MS}ms` }}
      >
        <WallBoundary
          retryKey={poll.dataUpdatedAt}
          onError={() => setFailedAt(poll.dataUpdatedAt)}
        >
          <ScreenBoard
            poll={poll}
            conference={{ ...wall.conference, trackSponsor }}
            look={wall.look}
          />
        </WallBoundary>
      </div>
    </>
  )
}
