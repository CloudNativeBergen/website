'use client'

import { useMemo, useState, useCallback } from 'react'
import { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import { Format, Level, Audience } from '@/lib/proposal/types'
import { Topic } from '@/lib/topic/types'

interface PortableTextChild {
  _type: string
  text?: string
}

export interface ProgramFilterOptions {
  searchQuery: string
  selectedDay: string
  selectedTrack: string
  selectedFormat: Format | ''
  selectedLevel: Level | ''
  selectedAudience: Audience | ''
  selectedTopic: string
}

export interface FilteredProgramData {
  schedules: ConferenceSchedule[]
  allTalks: (TrackTalk & {
    scheduleDate: string
    trackTitle: string
    trackIndex: number
  })[]
  availableFilters: {
    days: string[]
    tracks: string[]
    formats: Format[]
    levels: Level[]
    audiences: Audience[]
    topics: Topic[]
  }
}

export function useProgramFilter(schedules: ConferenceSchedule[]) {
  const [filters, setFilters] = useState<ProgramFilterOptions>({
    searchQuery: '',
    selectedDay: '',
    selectedTrack: '',
    selectedFormat: '',
    selectedLevel: '',
    selectedAudience: '',
    selectedTopic: '',
  })

  const availableFilters = useMemo(() => {
    const days = schedules.map((s) => s.date).sort()
    const tracks = new Set<string>()
    const formats = new Set<Format>()
    const levels = new Set<Level>()
    const audiences = new Set<Audience>()
    const topics = new Set<Topic>()

    schedules.forEach((schedule) => {
      schedule.tracks.forEach((track) => {
        tracks.add(track.trackTitle)
        track.talks.forEach((talk) => {
          if (talk.talk) {
            if (talk.talk.format) formats.add(talk.talk.format)
            if (talk.talk.level) levels.add(talk.talk.level)
            if (talk.talk.audiences) {
              talk.talk.audiences.forEach((audience) => audiences.add(audience))
            }
            if (talk.talk.topics) {
              talk.talk.topics.forEach((topic) => {
                if (typeof topic === 'object' && 'title' in topic) {
                  topics.add(topic)
                }
              })
            }
          }
        })
      })
    })

    return {
      days,
      tracks: Array.from(tracks).sort(),
      formats: Array.from(formats).sort(),
      levels: Array.from(levels).sort(),
      audiences: Array.from(audiences).sort(),
      topics: Array.from(topics).sort((a, b) => a.title.localeCompare(b.title)),
    }
  }, [schedules])

  const allTalks = useMemo(() => {
    const talks: (TrackTalk & {
      scheduleDate: string
      trackTitle: string
      trackIndex: number
    })[] = []

    schedules.forEach((schedule) => {
      schedule.tracks.forEach((track, trackIndex) => {
        track.talks.forEach((talk) => {
          talks.push({
            ...talk,
            scheduleDate: schedule.date,
            trackTitle: track.trackTitle,
            trackIndex,
          })
        })
      })
    })

    return talks
  }, [schedules])

  const filteredData = useMemo<FilteredProgramData>(() => {
    let filteredSchedules = [...schedules]
    let filteredTalks = [...allTalks]

    if (filters.selectedDay) {
      filteredSchedules = filteredSchedules.filter(
        (s) => s.date === filters.selectedDay,
      )
      filteredTalks = filteredTalks.filter(
        (t) => t.scheduleDate === filters.selectedDay,
      )
    }

    if (filters.selectedTrack) {
      filteredSchedules = filteredSchedules
        .map((schedule) => ({
          ...schedule,
          tracks: schedule.tracks.filter(
            (track) => track.trackTitle === filters.selectedTrack,
          ),
        }))
        .filter((schedule) => schedule.tracks.length > 0)

      filteredTalks = filteredTalks.filter(
        (t) => t.trackTitle === filters.selectedTrack,
      )
    }

    filteredTalks = filteredTalks.filter((talk) => {
      if (!talk.talk) return true

      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase()
        const matchesTitle = talk.talk.title?.toLowerCase().includes(query)
        const matchesSpeaker = talk.talk.speakers?.some(
          (speaker) =>
            typeof speaker === 'object' &&
            'name' in speaker &&
            speaker.name.toLowerCase().includes(query),
        )
        const matchesDescription =
          Array.isArray(talk.talk.description) &&
          talk.talk.description.some(
            (block) =>
              block._type === 'block' &&
              Array.isArray(block.children) &&
              block.children.some(
                (child: PortableTextChild) =>
                  child._type === 'span' &&
                  child.text?.toLowerCase().includes(query),
              ),
          )

        if (!matchesTitle && !matchesSpeaker && !matchesDescription) {
          return false
        }
      }

      if (
        filters.selectedFormat &&
        talk.talk.format !== filters.selectedFormat
      ) {
        return false
      }

      if (filters.selectedLevel && talk.talk.level !== filters.selectedLevel) {
        return false
      }

      if (
        filters.selectedAudience &&
        (!talk.talk.audiences ||
          !talk.talk.audiences.includes(filters.selectedAudience))
      ) {
        return false
      }

      if (filters.selectedTopic && talk.talk.topics) {
        const matchesTopic = talk.talk.topics.some(
          (topic) =>
            typeof topic === 'object' &&
            'slug' in topic &&
            topic.slug.current === filters.selectedTopic,
        )
        if (!matchesTopic) {
          return false
        }
      }

      return true
    })

    const rebuiltSchedules = filteredSchedules
      .map((schedule) => ({
        ...schedule,
        tracks: schedule.tracks
          .map((track) => ({
            ...track,
            talks: track.talks.filter((talk) =>
              filteredTalks.some(
                (ft) =>
                  ft.scheduleDate === schedule.date &&
                  ft.trackTitle === track.trackTitle &&
                  ft.startTime === talk.startTime &&
                  ft.endTime === talk.endTime,
              ),
            ),
          }))
          .filter((track) => track.talks.length > 0),
      }))
      .filter((schedule) => schedule.tracks.length > 0)

    return {
      schedules: rebuiltSchedules,
      allTalks: filteredTalks,
      availableFilters,
    }
  }, [schedules, allTalks, availableFilters, filters])

  const hasActiveFilters = useMemo(() => {
    return (
      filters.searchQuery !== '' ||
      filters.selectedDay !== '' ||
      filters.selectedTrack !== '' ||
      filters.selectedFormat !== '' ||
      filters.selectedLevel !== '' ||
      filters.selectedAudience !== '' ||
      filters.selectedTopic !== ''
    )
  }, [filters])

  const updateFilter = useCallback(
    <K extends keyof ProgramFilterOptions>(
      key: K,
      value: ProgramFilterOptions[K],
    ) => {
      setFilters((prev) => ({
        ...prev,
        [key]: value,
      }))
    },
    [],
  )

  const clearFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      selectedDay: '',
      selectedTrack: '',
      selectedFormat: '',
      selectedLevel: '',
      selectedAudience: '',
      selectedTopic: '',
    })
  }, [])

  return {
    filters,
    filteredData,
    updateFilter,
    clearFilters,
    hasActiveFilters,
  }
}
