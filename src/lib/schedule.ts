export type Schedule = {
  _id: string
  date: string
  time_start: string
  time_end: string
  track: {
    number: number
    title: string
    description?: string
  }
  talk?: {
    title: string
    description?: string
    speaker?: {
      name: string
      slug: string
      title: string
      image?: string
    }
  }
}

export type ScheduleTrack = {
  date: string
  number: number
  name: React.ReactNode
  title: string
  description?: string
  talks: ScheduleTalk[]
  speakers: ScheduleSpeaker[]
}

export type ScheduleTalk = {
  title: string
  description?: string
  start: string
  end: string
  speaker?: ScheduleSpeaker
}

export type ScheduleSpeaker = {
  name: string
  slug: string
  title: string
  image?: string
}

export function scheduleToTracks(schedule: Schedule[]): ScheduleTrack[] {
  const tracks: ScheduleTrack[] = []

  for (const scheduleItem of schedule) {
    if (!scheduleItem.track) {
      continue
    }

    let track = tracks.find(
      (track) => track.number === scheduleItem.track.number,
    )

    if (!track) {
      tracks.push({
        date: scheduleItem.date,
        number: scheduleItem.track.number,
        name: `Track ${scheduleItem.track.number}`,
        title: scheduleItem.track.title,
        description: scheduleItem.track.description,
        speakers: [],
        talks: [],
      })
      track = tracks[tracks.length - 1]
    }

    if (scheduleItem.talk) {
      track.talks.push({
        title: scheduleItem.talk.title,
        description: scheduleItem.talk.description,
        start: scheduleItem.time_start,
        end: scheduleItem.time_end,
        speaker: scheduleItem.talk.speaker,
      })

      if (scheduleItem.talk.speaker) {
        if (
          !track.speakers.find(
            (speaker) => speaker.name === scheduleItem.talk!.speaker!.name,
          )
        ) {
          track.speakers.push(scheduleItem.talk.speaker)
        }
      }
    } else {
      track.talks.push({
        title: 'TBD',
        description: '',
        start: scheduleItem.time_start,
        end: scheduleItem.time_end,
      })
    }
  }

  return tracks
}
