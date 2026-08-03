'use client'

import { useState, useEffect, useLayoutEffect } from 'react'
import { useTheme } from 'next-themes'
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'

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

  return (
    <button
      type="button"
      // Identifies this control across a document boundary. The homepage
      // composer preview renders the REAL Header, and this toggle writes
      // next-themes' ORIGIN-WIDE storage key — clicking it inside the preview
      // would re-theme the admin app around it. `PreviewChrome` matches on this
      // attribute and reroutes the click to the preview's own theme state.
      data-slot="theme-toggle"
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
        <div className="h-5 w-5 opacity-50">
          <div className="h-full w-full rounded-full border border-zinc-400 dark:border-zinc-500" />
        </div>
      )}
    </button>
  )
}

export { ThemeToggle }
