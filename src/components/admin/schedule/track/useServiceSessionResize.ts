'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { PIXELS_PER_MINUTE, SLOT_INTERVAL } from '@/lib/schedule/geometry'
import {
  SCHEDULE_END,
  calculateEndTime,
  durationBetween,
  toMinutes,
} from '@/lib/schedule/time'
import { isTrackIntervalFree, matchService } from '@/lib/schedule/rules'

const MIN_DURATION = 5
const MAX_DURATION = 180

/**
 * Resize interaction for a service session's bottom handle.
 *
 * Uses POINTER events (`onPointerDown` + `pointermove`/`pointerup` with
 * `setPointerCapture`) rather than the old mouse-only `document` listeners, so
 * the handle works under touch — matching the drag path, which already uses
 * dnd-kit's TouchSensor. `pointercapture` routes every subsequent move/up to the
 * handle element even when the finger/cursor leaves it, so no global listeners
 * are needed.
 *
 * The proposed duration is CLAMPED (reusing `rules.isTrackIntervalFree` and
 * `SCHEDULE_END`) so the session's new end never overlaps a following
 * talk/session and never runs past the end of the day. The reducer re-validates,
 * but clamping here gives the drag live feedback at the boundary instead of a
 * silently-rejected no-op.
 */
export function useServiceSessionResize({
  talk,
  talkIndex,
  track,
  height,
  onUpdateSession,
}: {
  talk: TrackTalk
  talkIndex: number
  track: ScheduleTrack
  height: number
  onUpdateSession: (index: number, newDuration: number) => void
}) {
  const [isResizing, setIsResizing] = useState(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)
  // Duration when the resize started, so Escape can revert to it.
  const originalDurationRef = useRef(0)
  // Last duration actually dispatched, so pointermove only dispatches CHANGES
  // (not one resizeService per pixel of movement).
  const lastDispatchedRef = useRef<number | null>(null)
  // Capture target + pointer id, so Escape / unmount can release the capture
  // (pointer events keep streaming to the handle until released).
  const captureElRef = useRef<Element | null>(null)
  const capturePointerIdRef = useRef<number | null>(null)

  const releaseCapture = useCallback(() => {
    const el = captureElRef.current
    const pointerId = capturePointerIdRef.current
    if (el && pointerId !== null && el.hasPointerCapture?.(pointerId)) {
      el.releasePointerCapture(pointerId)
    }
    captureElRef.current = null
    capturePointerIdRef.current = null
  }, [])

  // Largest duration (quantized to the slot interval, within [MIN, MAX]) whose
  // end stays free and inside the schedule — i.e. clamp `requested` down until
  // both scheduling rules hold. Reuses the tested rule, no new overlap math.
  const clampDuration = useCallback(
    (requested: number): number => {
      let duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, requested))
      const exclude = matchService(talk.placeholder ?? '', talk.startTime)
      while (duration > MIN_DURATION) {
        const end = calculateEndTime(talk.startTime, duration)
        const withinDay = toMinutes(end) <= toMinutes(SCHEDULE_END)
        if (
          withinDay &&
          isTrackIntervalFree(track, talk.startTime, end, exclude)
        ) {
          break
        }
        duration -= SLOT_INTERVAL
      }
      return duration
    },
    [track, talk.placeholder, talk.startTime],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      captureElRef.current = e.currentTarget
      capturePointerIdRef.current = e.pointerId
      startYRef.current = e.clientY
      startHeightRef.current = height
      originalDurationRef.current = durationBetween(
        talk.startTime,
        talk.endTime,
      )
      lastDispatchedRef.current = originalDurationRef.current
      setIsResizing(true)
    },
    [height, talk.startTime, talk.endTime],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing) return
      e.preventDefault()

      const deltaY = e.clientY - startYRef.current
      const newHeight = Math.max(12, startHeightRef.current + deltaY)
      const rawDuration =
        Math.round(newHeight / PIXELS_PER_MINUTE / SLOT_INTERVAL) *
        SLOT_INTERVAL

      const duration = clampDuration(rawDuration)
      // Only dispatch when the quantized duration actually CHANGED — a
      // pointermove fires per pixel and would otherwise flood the reducer with
      // identical resizeService actions.
      if (duration >= MIN_DURATION && duration !== lastDispatchedRef.current) {
        lastDispatchedRef.current = duration
        onUpdateSession(talkIndex, duration)
      }
    },
    [isResizing, clampDuration, talkIndex, onUpdateSession],
  )

  const endResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    captureElRef.current = null
    capturePointerIdRef.current = null
    lastDispatchedRef.current = null
    setIsResizing(false)
  }, [])

  // Escape CANCELS an in-progress resize: revert to the duration the resize
  // started from and release the pointer capture (otherwise moves keep
  // streaming to the handle and the "cancel" left the intermediate size).
  useEffect(() => {
    if (!isResizing) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (lastDispatchedRef.current !== originalDurationRef.current) {
        onUpdateSession(talkIndex, originalDurationRef.current)
      }
      lastDispatchedRef.current = null
      releaseCapture()
      setIsResizing(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isResizing, talkIndex, onUpdateSession, releaseCapture])

  // If the handle unmounts mid-resize, don't leave the pointer captured.
  useEffect(() => releaseCapture, [releaseCapture])

  return {
    isResizing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: endResize,
    handlePointerCancel: endResize,
  }
}
