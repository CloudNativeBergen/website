'use client'

import { useEffect, useState } from 'react'
import type { ConferenceSchedule } from '@/lib/conference/types'
import { feedbackCodeDisplayUrl } from '@/lib/feedback/code-assets'
import { onSimulatedTimeChange } from '@/lib/program/dev-time'
import { getCurrentConferenceTime } from '@/lib/program/time-utils'
import {
  roomFeedbackCodes,
  type RoomFeedbackCode,
} from '@/lib/stream/room-feedback'
import { useFeedbackQrPng } from '@/components/feedback/useFeedbackQrPng'

function FeedbackCodeCard({ code }: { code: RoomFeedbackCode }) {
  const { src, failed } = useFeedbackQrPng(code.url, 768)
  return (
    <li className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center text-black shadow-xl">
      <div className="aspect-square w-full max-w-[22rem]">
        {src ? (
          <img
            src={src}
            alt={`QR code for feedback on ${code.title}`}
            className="h-full w-full"
          />
        ) : failed ? null : (
          <div className="h-full w-full animate-pulse rounded bg-gray-200" />
        )}
      </div>
      <p className="font-space-grotesk text-2xl leading-tight font-semibold">
        {code.title}
      </p>
      <p className="font-jetbrains text-xl break-all">
        {feedbackCodeDisplayUrl(code.url)}
      </p>
    </li>
  )
}

/** The cards alone, for a given set of codes (speaker feedback spec §7.6). */
export function RoomFeedbackCodeCards({
  codes,
}: {
  codes: RoomFeedbackCode[]
}) {
  if (codes.length === 0) return null
  return (
    <section aria-labelledby="room-feedback-heading" className="mt-12">
      <h2
        id="room-feedback-heading"
        className="font-space-grotesk text-center text-4xl font-bold text-brand-slate-gray dark:text-white"
      >
        {codes.length === 1
          ? 'How was this session?'
          : 'How were these sessions?'}
      </h2>
      <ul
        className={`mx-auto mt-6 grid gap-8 ${
          codes.length === 1
            ? 'max-w-md'
            : codes.length === 2
              ? 'max-w-4xl grid-cols-2'
              : 'grid-cols-3'
        }`}
      >
        {codes.map((code) => (
          <FeedbackCodeCard key={code.talkId} code={code} />
        ))}
      </ul>
    </section>
  )
}

/**
 * The room screen's Feedback Codes for the talks that just ended (§7.6),
 * picked from the conference time, so the dev-time control moves them too.
 */
export function RoomFeedbackCodes({
  schedules,
  roomTrackTitle,
  urls,
}: {
  schedules: ConferenceSchedule[]
  roomTrackTitle: string
  urls: Record<string, string>
}) {
  const [codes, setCodes] = useState<RoomFeedbackCode[]>([])
  useEffect(() => {
    const update = () =>
      setCodes(
        roomFeedbackCodes(
          schedules,
          roomTrackTitle,
          urls,
          getCurrentConferenceTime(),
        ),
      )
    update()
    const interval = setInterval(update, 30_000)
    const unsubscribe = onSimulatedTimeChange(update)
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [schedules, roomTrackTitle, urls])
  return <RoomFeedbackCodeCards codes={codes} />
}
