'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'

export type ProgramViewMode = 'grid' | 'schedule' | 'list' | 'agenda'

export interface ViewModeConfig {
  id: ProgramViewMode
  label: string
  description: string
  icon: string
  suitableFor: string[]
}

const STORAGE_KEY = 'cnb-program-view-mode'
const MOBILE_BREAKPOINT = 768
const VALID_VIEW_MODES: readonly ProgramViewMode[] = [
  'grid',
  'schedule',
  'list',
  'agenda',
] as const

const MOBILE_KEYWORDS = [
  'mobile',
  'iphone',
  'ipad',
  'android',
  'blackberry',
  'nokia',
  'opera mini',
  'windows mobile',
  'windows phone',
  'iemobile',
] as const

function isValidViewMode(value: string): value is ProgramViewMode {
  return VALID_VIEW_MODES.includes(value as ProgramViewMode)
}

const isMobileDevice = (() => {
  let cachedResult: boolean | null = null
  let cachedUserAgent: string | null = null

  return (): boolean => {
    if (typeof window === 'undefined') return false

    const currentUserAgent = window.navigator.userAgent.toLowerCase()

    if (cachedResult === null || cachedUserAgent !== currentUserAgent) {
      cachedUserAgent = currentUserAgent

      const isMobileViewport = window.innerWidth <= MOBILE_BREAKPOINT

      const isMobileUserAgent = MOBILE_KEYWORDS.some((keyword) =>
        currentUserAgent.includes(keyword),
      )

      const isTouchDevice =
        'ontouchstart' in window || navigator.maxTouchPoints > 0

      cachedResult =
        isMobileViewport ||
        isMobileUserAgent ||
        (isTouchDevice && isMobileViewport)
    }

    return cachedResult
  }
})()

const storageOperations = {
  get(): ProgramViewMode | null {
    if (typeof window === 'undefined') return null

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && isValidViewMode(stored)) {
        return stored
      }

      if (stored) {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[useProgramViewMode] Failed to read from localStorage:',
          error,
        )
      }
    }

    return null
  },

  set(mode: ProgramViewMode): void {
    if (typeof window === 'undefined') return

    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[useProgramViewMode] Failed to write to localStorage:',
          error,
        )
      }
    }
  },
}

const VIEW_MODES: readonly ViewModeConfig[] = [
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
] as const

export function useProgramViewMode() {
  const [viewMode, setViewMode] = useState<ProgramViewMode | null>(null)

  useEffect(() => {
    const storedViewMode = storageOperations.get()
    if (storedViewMode) {
      setViewMode(storedViewMode)
      return
    }

    const defaultViewMode = isMobileDevice() ? 'list' : 'schedule'
    setViewMode(defaultViewMode)
  }, [])

  const handleSetViewMode = useCallback((mode: ProgramViewMode) => {
    setViewMode(mode)
    storageOperations.set(mode)
  }, [])

  const viewModes = useMemo<ViewModeConfig[]>(
    () => VIEW_MODES as ViewModeConfig[],
    [],
  )

  const currentViewConfig = useMemo(() => {
    if (!viewMode) {
      return viewModes.find((mode) => mode.id === 'schedule') || viewModes[0]
    }

    return viewModes.find((mode) => mode.id === viewMode) || viewModes[0]
  }, [viewMode, viewModes])

  return useMemo(
    () => ({
      viewMode: viewMode || 'schedule',
      setViewMode: handleSetViewMode,
      viewModes,
      currentViewConfig,
    }),
    [viewMode, handleSetViewMode, viewModes, currentViewConfig],
  )
}
