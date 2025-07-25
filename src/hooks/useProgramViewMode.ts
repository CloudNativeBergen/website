'use client'

import { useState, useMemo } from 'react'

export type ProgramViewMode = 'grid' | 'schedule' | 'list' | 'agenda'

export interface ViewModeConfig {
  id: ProgramViewMode
  label: string
  description: string
  icon: string
  suitableFor: string[]
}

export function useProgramViewMode() {
  const [viewMode, setViewMode] = useState<ProgramViewMode>('schedule')

  const viewModes = useMemo<ViewModeConfig[]>(
    () => [
      {
        id: 'schedule',
        label: 'Schedule View',
        description: 'Traditional time-based schedule layout',
        icon: 'calendar',
        suitableFor: ['time-oriented navigation', 'conference flow'],
      },
      {
        id: 'grid',
        label: 'Card Grid',
        description: 'Browse talks as cards with filtering',
        icon: 'grid',
        suitableFor: ['talk discovery', 'content browsing'],
      },
      {
        id: 'list',
        label: 'List View',
        description: 'Compact list with detailed information',
        icon: 'list',
        suitableFor: ['quick scanning', 'mobile browsing'],
      },
      {
        id: 'agenda',
        label: 'Personal Agenda',
        description: 'Build your personalized conference agenda',
        icon: 'bookmark',
        suitableFor: ['planning', 'personal schedule'],
      },
    ],
    [],
  )

  const currentViewConfig = useMemo(
    () => viewModes.find((mode) => mode.id === viewMode) || viewModes[0],
    [viewMode, viewModes],
  )

  return {
    viewMode,
    setViewMode,
    viewModes,
    currentViewConfig,
  }
}
