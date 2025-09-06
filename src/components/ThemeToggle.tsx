'use client'

import { useState, useEffect, useLayoutEffect } from 'react'
import { useTheme } from 'next-themes'
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'

// Use useLayoutEffect on client side to prevent double render
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useIsomorphicLayoutEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === 'dark' : false
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  // Always render the same button structure to prevent layout shift
  return (
    <button
      type="button"
      aria-label={
        mounted
          ? `Switch to ${isDark ? 'light' : 'dark'} theme`
          : 'Toggle theme'
      }
      className="group rounded-full bg-white/90 p-2 shadow-lg ring-1 ring-zinc-900/5 backdrop-blur-sm transition hover:bg-white dark:bg-zinc-800/90 dark:ring-white/10 dark:hover:bg-zinc-800"
      onClick={mounted ? toggleTheme : undefined}
      disabled={!mounted}
    >
      {mounted ? (
        <>
          <SunIcon
            className={`h-5 w-5 fill-zinc-100 stroke-zinc-500 transition group-hover:stroke-zinc-700 ${
              isDark ? 'hidden' : 'block'
            }`}
          />
          <MoonIcon
            className={`h-5 w-5 fill-zinc-700 stroke-zinc-500 transition group-hover:stroke-zinc-400 ${
              isDark ? 'block' : 'hidden'
            }`}
          />
        </>
      ) : (
        // Placeholder that matches the visual space of the icons
        <div className="h-5 w-5 opacity-50">
          {/* Use a subtle icon placeholder that works in both themes */}
          <div className="h-full w-full rounded-full border border-zinc-400 dark:border-zinc-500" />
        </div>
      )}
    </button>
  )
}

export { ThemeToggle }
