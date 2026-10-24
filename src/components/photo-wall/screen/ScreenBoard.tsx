'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import { markScreenMode } from '@/components/pwa/screen-update'
import type { ScreenView } from '@/lib/photo-wall/screen'
import { boardReducer, initialBoard } from './board'
import { useScreenPoll } from './polling'
import { ScreenLayout, type ScreenConference } from './ScreenLayout'

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
 * The pinboard, live: the board's state machine driven by the polls, the
 * images the browser reports loaded or failed, and a heartbeat tick. What
 * the connected `ScreenMode` and the stories render.
 */
export function ScreenBoard({
  poll: { data, dataUpdatedAt, errorUpdatedAt },
  conference,
}: {
  poll: ScreenPoll
  conference: ScreenConference
}) {
  const [board, dispatch] = useReducer(boardReducer, undefined, initialBoard)

  // A poll reaches the board DURING the render it arrives in (the "adjust
  // state when a prop changes" pattern), stamped with the poll's own time,
  // not from an effect after the commit: a dispatch from an effect on every
  // poll, with the tick alongside, trips React's nested-update limit on a
  // screen left open for hours.
  const [seen, setSeen] = useState({ dataAt: 0, errorAt: 0 })
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
  return (
    <ScreenLayout
      board={board}
      conference={conference}
      onImageLoaded={onImageLoaded}
      onImageFailed={onImageFailed}
    />
  )
}

/**
 * `/wall/screen` (Photo Wall spec §9.2): starts from the server's answer and
 * polls `photoWallPublic.screen` every 5 s for as long as it is open (§8).
 */
export function ScreenMode({
  initial,
  conference,
}: {
  initial: ScreenView
  conference: ScreenConference
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
    />
  )
}
