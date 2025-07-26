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

// Constants
const STORAGE_KEY = 'cnb-program-view-mode'
const MOBILE_BREAKPOINT = 768
const VALID_VIEW_MODES: readonly ProgramViewMode[] = [
  'grid',
  'schedule',
  'list',
  'agenda',
] as const

// Mobile detection keywords for better performance
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

// Type guard for valid view modes
function isValidViewMode(value: string): value is ProgramViewMode {
  return VALID_VIEW_MODES.includes(value as ProgramViewMode)
}

// Optimized mobile device detection with memoization
const isMobileDevice = (() => {
  let cachedResult: boolean | null = null
  let cachedUserAgent: string | null = null

  return (): boolean => {
    if (typeof window === 'undefined') return false

    const currentUserAgent = window.navigator.userAgent.toLowerCase()

    // Only recalculate if user agent changed (rare) or not cached
    if (cachedResult === null || cachedUserAgent !== currentUserAgent) {
      cachedUserAgent = currentUserAgent

      // Check viewport width (mobile-first approach)
      const isMobileViewport = window.innerWidth <= MOBILE_BREAKPOINT

      // Check user agent for mobile indicators
      const isMobileUserAgent = MOBILE_KEYWORDS.some((keyword) =>
        currentUserAgent.includes(keyword),
      )

      // Check for touch support (additional indicator)
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

// Optimized localStorage operations with better error handling
const storageOperations = {
  get(): ProgramViewMode | null {
    if (typeof window === 'undefined') return null

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && isValidViewMode(stored)) {
        return stored
      }

      // Clean up invalid data
      if (stored) {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (error) {
      // Silent fail for localStorage issues (private browsing, quota exceeded, etc.)
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
      // Silent fail for localStorage issues
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[useProgramViewMode] Failed to write to localStorage:',
          error,
        )
      }
    }
  },
}

// Static view modes configuration (extracted for better performance)
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
  // Initialize with null to handle client-side detection
  const [viewMode, setViewMode] = useState<ProgramViewMode | null>(null)

  // Set initial view mode with priority: localStorage > mobile detection > default
  useEffect(() => {
    // 1. First, try to get user's stored preference
    const storedViewMode = storageOperations.get()
    if (storedViewMode) {
      setViewMode(storedViewMode)
      return
    }

    // 2. If no stored preference, use mobile detection
    const defaultViewMode = isMobileDevice() ? 'list' : 'schedule'
    setViewMode(defaultViewMode)
  }, [])

  // Enhanced setViewMode that also stores in localStorage
  const handleSetViewMode = useCallback((mode: ProgramViewMode) => {
    setViewMode(mode)
    storageOperations.set(mode)
  }, [])

  // Memoized view modes configuration (static data that never changes)
  const viewModes = useMemo<ViewModeConfig[]>(
    () => VIEW_MODES as ViewModeConfig[],
    [],
  )

  // Optimized currentViewConfig with better fallback handling
  const currentViewConfig = useMemo(() => {
    // Use a more specific fallback strategy
    if (!viewMode) {
      // During loading, return schedule view config as default
      return viewModes.find((mode) => mode.id === 'schedule') || viewModes[0]
    }

    return viewModes.find((mode) => mode.id === viewMode) || viewModes[0]
  }, [viewMode, viewModes])

  // Memoized return object to prevent unnecessary re-renders of consuming components
  return useMemo(
    () => ({
      viewMode: viewMode || 'schedule', // Fallback to schedule during initial load
      setViewMode: handleSetViewMode,
      viewModes,
      currentViewConfig,
    }),
    [viewMode, handleSetViewMode, viewModes, currentViewConfig],
  )
}
