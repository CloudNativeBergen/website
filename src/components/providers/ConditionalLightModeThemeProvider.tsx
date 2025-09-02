'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'

interface ConditionalLightModeThemeProviderProps {
  children: React.ReactNode
}

function ConditionalLightModeForcer() {
  const { setTheme } = useTheme()
  const pathname = usePathname()

  useEffect(() => {
    // Force light mode for main pages, but allow theme switching for CFP dashboard pages (/cfp/)
    // The /cfp page itself should be forced to light mode, only /cfp/ sub-routes should allow theme switching
    if (!pathname.startsWith('/cfp/')) {
      setTheme('light')
    }
  }, [setTheme, pathname])

  return null
}

export function ConditionalLightModeThemeProvider({
  children,
}: ConditionalLightModeThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" disableTransitionOnChange>
      <ConditionalLightModeForcer />
      {children}
    </NextThemesProvider>
  )
}
