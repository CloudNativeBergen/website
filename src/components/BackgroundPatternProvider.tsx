'use client'

import { createContext, useContext } from 'react'
import {
  DEFAULT_BACKGROUND_PATTERN,
  type BackgroundPattern,
} from '@/lib/conference/backgroundPattern'

/**
 * Supplies the resolved per-conference {@link BackgroundPattern} to every
 * {@link import('./BackgroundImage').BackgroundImage} beneath it, without
 * threading a prop through the ~30 call sites that render one.
 *
 * A server layout that has resolved the conference wraps its subtree once with
 * `<BackgroundPatternProvider pattern={…}>`. Outside any provider (route groups
 * that never resolve a tenant, isolated stories) the context defaults to
 * `'cloud-native'`, i.e. the historical behaviour — so nothing regresses.
 */
const BackgroundPatternContext = createContext<BackgroundPattern>(
  DEFAULT_BACKGROUND_PATTERN,
)

export function BackgroundPatternProvider({
  pattern,
  children,
}: {
  pattern: BackgroundPattern
  children: React.ReactNode
}) {
  return (
    <BackgroundPatternContext.Provider value={pattern}>
      {children}
    </BackgroundPatternContext.Provider>
  )
}

/** The active background pattern for the current subtree. */
export function useBackgroundPattern(): BackgroundPattern {
  return useContext(BackgroundPatternContext)
}
