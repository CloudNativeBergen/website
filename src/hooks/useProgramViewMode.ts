'use client'

import { useState, useMemo, useEffect } from 'react'

export type ProgramViewMode = 'grid' | 'schedule' | 'list' | 'agenda'

export interface ViewModeConfig {
  id: ProgramViewMode
  label: string
  description: string
  icon: string
  suitableFor: string[]
}

// Detect if the user is on a mobile device
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false

  // Check viewport width (mobile-first approach)
  const isMobileViewport = window.innerWidth <= 768

  // Check user agent for mobile indicators
  const userAgent = window.navigator.userAgent.toLowerCase()
  const mobileKeywords = [
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
  ]
  const isMobileUserAgent = mobileKeywords.some((keyword) =>
    userAgent.includes(keyword),
  )

  // Check for touch support (additional indicator)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  return (
    isMobileViewport || isMobileUserAgent || (isTouchDevice && isMobileViewport)
  )
}

export function useProgramViewMode() {
  // Initialize with null to handle client-side detection
  const [viewMode, setViewMode] = useState<ProgramViewMode | null>(null)

  // Set initial view mode based on device type after component mounts
  useEffect(() => {
    const defaultViewMode = isMobileDevice() ? 'list' : 'schedule'
    setViewMode(defaultViewMode)
  }, [])

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

  const currentViewConfig = useMemo(() => {
    // Return the first view mode as fallback during initial load
    if (!viewMode) return viewModes[0]
    return viewModes.find((mode) => mode.id === viewMode) || viewModes[0]
  }, [viewMode, viewModes])

  return {
    viewMode: viewMode || 'schedule', // Fallback to schedule during initial load
    setViewMode: (mode: ProgramViewMode) => setViewMode(mode),
    viewModes,
    currentViewConfig,
  }
}
