'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        type="button"
        className="rounded-full bg-white/90 p-2 shadow-lg ring-1 ring-zinc-900/5 transition dark:bg-zinc-800/90 dark:ring-white/10"
        disabled
      >
        <div className="h-5 w-5" />
      </button>
    )
  }

  const isDark = resolvedTheme === 'dark'
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  return (
    <button
      type="button"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className="group rounded-full bg-white/90 p-2 shadow-lg ring-1 ring-zinc-900/5 backdrop-blur-sm transition hover:bg-white dark:bg-zinc-800/90 dark:ring-white/10 dark:hover:bg-zinc-800"
      onClick={toggleTheme}
    >
      <SunIcon className="h-5 w-5 fill-zinc-100 stroke-zinc-500 transition group-hover:stroke-zinc-700 dark:hidden" />
      <MoonIcon className="hidden h-5 w-5 fill-zinc-700 stroke-zinc-500 transition group-hover:stroke-zinc-400 dark:block" />
    </button>
  )
}

export { ThemeToggle }
