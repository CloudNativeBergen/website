'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'

interface ConditionalLightModeThemeProviderProps {
  children: React.ReactNode
}

function ConditionalLightModeForcer() {
  const { setTheme } = useTheme()
  const pathname = usePathname()

  useEffect(() => {
    // Force light mode for main pages, but allow theme switching for CFP dashboard pages (/cfp/)
    if (!pathname.startsWith('/cfp/') || !pathname.startsWith('/branding')) {
      setTheme('light')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]) // Only depend on pathname, not setTheme to avoid loops

  return null
}

export function ConditionalLightModeThemeProvider({
  children,
}: ConditionalLightModeThemeProviderProps) {
  return (
    <>
      <ConditionalLightModeForcer />
      {children}
    </>
  )
}
