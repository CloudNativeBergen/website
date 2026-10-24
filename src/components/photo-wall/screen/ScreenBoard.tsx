'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import { markScreenMode } from '@/components/pwa/screen-update'
import type { ScreenView } from '@/lib/photo-wall/screen'
import type { WallLook } from '@/lib/photo-wall/types'
import { boardReducer, initialBoard, type BoardAction } from './board'
import { MosaicScreen } from './MosaicScreen'
import { useScreenPoll } from './polling'
import { ScreenLayout } from './ScreenLayout'
import type { ScreenConference } from './ScreenShell'
import { SpotlightScreen } from './SpotlightScreen'
import { initialStream, streamReducer, type StreamLook } from './stream'

/** How often the board's clock runs: the resolution of every timed rule. */
const TICK_MS = 100

/** What the board needs of a poll: the last answer and when it last failed. */
export interface ScreenPoll {
  data: ScreenView | undefined
  /** Changes on every successful poll, even one that answered the same list. */
  dataUpdatedAt: number
  /** Changes on every failed poll; 0 until one fails. */
  errorUpdatedAt: number
}

/**
 * A look's state machine, live: driven by the polls, the images the browser
 * reports loaded or failed, and a heartbeat tick.
 */
function useLiveBoard<S>(
  reducer: (state: S, action: BoardAction) => S,
  init: () => S,
  { data, dataUpdatedAt, errorUpdatedAt }: ScreenPoll,
) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  // A poll reaches the board DURING the render it arrives in (the "adjust
  // state when a prop changes" pattern), stamped with the poll's own time,
  // not from an effect after the commit: a dispatch from an effect on every
  // poll, with the tick alongside, trips React's nested-update limit on a
  // screen left open for hours. A look mounted later (switched to) takes
  // the latest answer as its first load.
  // A look switched to does not count a failure from before it mounted.
  const [seen, setSeen] = useState({ dataAt: 0, errorAt: errorUpdatedAt })
  if (seen.dataAt !== dataUpdatedAt || seen.errorAt !== errorUpdatedAt) {
    setSeen({ dataAt: dataUpdatedAt, errorAt: errorUpdatedAt })
    if (data && seen.dataAt !== dataUpdatedAt) {
      dispatch({ type: 'poll', view: data, now: dataUpdatedAt })
    }
    if (errorUpdatedAt > 0 && seen.errorAt !== errorUpdatedAt) {
      dispatch({ type: 'pollFailed', now: errorUpdatedAt })
    }
  }
  useEffect(() => {
    const id = setInterval(
      () => dispatch({ type: 'tick', now: Date.now() }),
      TICK_MS,
    )
    return () => clearInterval(id)
  }, [])

  const onImageLoaded = useCallback(
    (key: string) => dispatch({ type: 'imageLoaded', key, now: Date.now() }),
    [],
  )
  const onImageFailed = useCallback(
    (key: string) => dispatch({ type: 'imageFailed', key, now: Date.now() }),
    [],
  )
  return { state, onImageLoaded, onImageFailed }
}

interface LookProps {
  poll: ScreenPoll
  conference: ScreenConference
}

function PinboardBoard({ poll, conference }: LookProps) {
  const { state, ...images } = useLiveBoard(boardReducer, initialBoard, poll)
  return <ScreenLayout board={state} conference={conference} {...images} />
}

function StreamBoard({
  look,
  poll,
  conference,
}: LookProps & { look: StreamLook }) {
  const { state, ...images } = useLiveBoard(
    streamReducer,
    () => initialStream(look),
    poll,
  )
  const Screen = look === 'mosaic' ? MosaicScreen : SpotlightScreen
  return <Screen state={state} conference={conference} {...images} />
}

/**
 * Screen Mode in the wall's look, or in `look` when the screen's own link
 * asks for one (`?look=`, Photo Wall spec §9). A look switched on the admin
 * page arrives with the next poll; the screen starts that look afresh from
 * the latest answer, with nothing marked new.
 */
export function ScreenBoard({
  poll,
  conference,
  look,
}: LookProps & { look?: WallLook }) {
  const shown = look ?? poll.data?.look ?? 'pinboard'
  return shown === 'pinboard' ? (
    <PinboardBoard key={shown} poll={poll} conference={conference} />
  ) : (
    <StreamBoard key={shown} look={shown} poll={poll} conference={conference} />
  )
}

/**
 * `/wall/screen` (Photo Wall spec §9.2): starts from the server's answer and
 * polls `photoWallPublic.screen` every 5 s for as long as it is open (§8).
 */
export function ScreenMode({
  initial,
  conference,
  look,
}: {
  initial: ScreenView
  conference: ScreenConference
  /** The screen link's `?look=`, overriding the wall's look. */
  look?: WallLook
}) {
  const { data, dataUpdatedAt, errorUpdatedAt } = useScreenPoll(initial)
  // Tells the service worker registrar this is a venue screen, also when it
  // was reached (or left) by a client-side navigation.
  useEffect(() => {
    markScreenMode(true)
    return () => markScreenMode(false)
  }, [])
  return (
    <ScreenBoard
      poll={{ data, dataUpdatedAt, errorUpdatedAt }}
      conference={conference}
      look={look}
    />
  )
}
