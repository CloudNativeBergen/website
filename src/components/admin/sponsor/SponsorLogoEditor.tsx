'use client'

import React, { useRef } from 'react'
import { InlineSvg } from '@/components/InlineSvg'
import { SponsorLogo } from '@/components/SponsorLogo'
import { downloadSvg } from '@/lib/sponsor/utils'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { sanitizeSvg } from '@/lib/svg'

const LOGO_PREVIEW_SIZE = { width: '100px', height: '100px' }

interface SponsorLogoEditorProps {
  logo: string | null
  logoBright?: string | null
  name: string
  onChange: (updates: {
    logo?: string | null
    logo_bright?: string | null
  }) => void
  className?: string
}

export function SponsorLogoEditor({
  logo,
  logoBright,
  name,
  onChange,
  className = '',
}: SponsorLogoEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const brightFileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'image/svg+xml') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const svgContent = e.target?.result as string
        onChange({ logo: sanitizeSvg(svgContent) })
      }
      reader.readAsText(file)
    } else {
      alert('Please select an SVG file.')
    }
  }

  const handleBrightFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'image/svg+xml') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const svgContent = e.target?.result as string
        onChange({ logo_bright: sanitizeSvg(svgContent) })
      }
      reader.readAsText(file)
    } else {
      alert('Please select an SVG file.')
    }
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Primary Logo */}
        <div>
          <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
            Logo (SVG) *
          </label>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Primary logo for light backgrounds
          </p>
          <div className="mt-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".svg"
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-indigo-500/10 dark:file:text-indigo-400 dark:hover:file:bg-indigo-500/20"
            />
            {logo && (
              <div className="mt-3">
                <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                  Logo Preview:
                </p>
                <div className="inline-block rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <InlineSvg value={logo} style={LOGO_PREVIEW_SIZE} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => downloadSvg(logo, `${name}-logo`)}
                    className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ logo: null })}
                    className="cursor-pointer text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bright Logo */}
        <div>
          <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
            Logo (Bright/White) - Optional
          </label>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Version for dark backgrounds
          </p>
          <div className="mt-2">
            <input
              type="file"
              ref={brightFileInputRef}
              onChange={handleBrightFileUpload}
              accept=".svg"
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-indigo-500/10 dark:file:text-indigo-400 dark:hover:file:bg-indigo-500/20"
            />
            {logoBright && (
              <div className="mt-3">
                <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                  Bright Logo Preview:
                </p>
                <div className="inline-block rounded-lg border border-gray-200 bg-gray-900 p-4 dark:border-white/10 dark:bg-gray-900">
                  <InlineSvg value={logoBright} style={LOGO_PREVIEW_SIZE} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      downloadSvg(logoBright, `${name}-logo-bright`)
                    }
                    className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ logo_bright: null })}
                    className="cursor-pointer text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Responsive Preview */}
      {logo && logoBright && (
        <div className="border-t border-gray-200 pt-6 dark:border-white/10">
          <h5 className="mb-3 block text-sm/6 font-medium text-gray-900 dark:text-white">
            Theme Preview
          </h5>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
                Light Mode
              </p>
              <div className="inline-block rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                <InlineSvg value={logo} style={LOGO_PREVIEW_SIZE} />
              </div>
            </div>
            <div className="flex-1">
              <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
                Dark Mode
              </p>
              <div className="inline-block rounded-lg border border-gray-600 bg-gray-900 p-4 dark:border-white/10 dark:bg-gray-900">
                <InlineSvg value={logoBright} style={LOGO_PREVIEW_SIZE} />
              </div>
            </div>
            <div className="flex-1">
              <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
                Responsive (SponsorLogo)
              </p>
              <div className="inline-block rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-gray-900">
                <SponsorLogo
                  logo={logo}
                  logoBright={logoBright}
                  name={name || 'Logo Preview'}
                  style={LOGO_PREVIEW_SIZE}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
