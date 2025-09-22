'use client'

import { useState, useEffect } from 'react'
import { DarkModeToggle } from './DarkModeToggle'

interface BrandingPageWrapperProps {
  children: React.ReactNode
}

export function BrandingPageWrapper({ children }: BrandingPageWrapperProps) {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const html = document.documentElement
    html.style.transition = 'background-color 0.3s ease, color 0.3s ease'

    return () => {
      html.style.transition = ''
    }
  }, [])

  return (
    <div className={`${isDarkMode ? 'dark' : ''} transition-all duration-300`}>
      <DarkModeToggle onToggle={setIsDarkMode} />
      <div
        className={`min-h-screen transition-colors duration-300 ${
          isDarkMode
            ? 'bg-gray-900 text-white'
            : 'bg-brand-glacier-white text-brand-slate-gray'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
