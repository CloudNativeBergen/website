'use client'

import { useState, useEffect } from 'react'
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'

interface DarkModeToggleProps {
  onToggle: (isDark: boolean) => void
}

export function DarkModeToggle({ onToggle }: DarkModeToggleProps) {
  const [isDark, setIsDark] = useState(false)

  const toggleDarkMode = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    onToggle(newIsDark)
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-brand-frosted-steel bg-white/95 px-4 py-2 shadow-lg backdrop-blur-sm dark:border-gray-600 dark:bg-gray-800/95">
      <span className="font-inter text-sm font-medium text-brand-slate-gray dark:text-gray-300">
        Preview Mode
      </span>
      <div className="flex items-center gap-1 rounded-md bg-gray-100 p-1 dark:bg-gray-700">
        <button
          onClick={() => !isDark && toggleDarkMode()}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            !isDark
              ? 'bg-white text-brand-slate-gray shadow-sm dark:bg-gray-600 dark:text-white'
              : 'text-brand-slate-gray hover:text-brand-cloud-blue dark:text-gray-400 dark:hover:text-blue-400'
          }`}
        >
          <SunIcon className="h-4 w-4" />
          Light
        </button>
        <button
          onClick={() => isDark && toggleDarkMode()}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            isDark
              ? 'bg-white text-brand-slate-gray shadow-sm dark:bg-gray-600 dark:text-white'
              : 'text-brand-slate-gray hover:text-brand-cloud-blue dark:text-gray-400 dark:hover:text-blue-400'
          }`}
        >
          <MoonIcon className="h-4 w-4" />
          Dark
        </button>
      </div>
    </div>
  )
}
