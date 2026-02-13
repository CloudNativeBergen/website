'use client'

import { useRef } from 'react'
import { InlineSvg } from '@/components/InlineSvg'
import {
  ArrowDownTrayIcon,
  TrashIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import { sanitizeSvg } from '@/lib/svg'
import { downloadSvg } from '@/lib/sponsor/utils'

const LOGO_PREVIEW_SIZE = { width: '120px', height: '120px' }

interface SponsorOnboardingLogoUploadProps {
  logo: string | null
  logoBright: string | null
  sponsorName: string
  onChange: (updates: {
    logo?: string | null
    logoBright?: string | null
  }) => void
}

function LogoUploadField({
  label,
  description,
  previewBg,
  value,
  sponsorName,
  filenameSuffix,
  onChange,
}: {
  label: string
  description: string
  previewBg: string
  value: string | null
  sponsorName: string
  filenameSuffix: string
  onChange: (svg: string | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.type !== 'image/svg+xml') {
      alert('Please select an SVG file.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const svgContent = e.target?.result as string
      onChange(sanitizeSvg(svgContent))
    }
    reader.readAsText(file)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </label>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {description}
      </p>
      <div className="mt-2">
        {value ? (
          <div>
            <div
              className={`inline-block rounded-lg border border-gray-200 p-4 dark:border-gray-700 ${previewBg}`}
            >
              <InlineSvg value={value} style={LOGO_PREVIEW_SIZE} />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  downloadSvg(value, `${sponsorName}${filenameSuffix}`)
                }
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Download
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-500"
              >
                <TrashIcon className="h-4 w-4" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 text-center hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
          >
            <div>
              <PhotoIcon className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500" />
              <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                Click to upload SVG
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                SVG files only
              </p>
            </div>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg"
          onChange={handleFileUpload}
          className="hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Replace
          </button>
        )}
      </div>
    </div>
  )
}

export function SponsorOnboardingLogoUpload({
  logo,
  logoBright,
  sponsorName,
  onChange,
}: SponsorOnboardingLogoUploadProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <LogoUploadField
          label="Company Logo (SVG)"
          description="Primary logo for light backgrounds"
          previewBg="bg-gray-50"
          value={logo}
          sponsorName={sponsorName}
          filenameSuffix="-logo"
          onChange={(svg) => onChange({ logo: svg })}
        />
        <LogoUploadField
          label="White/Bright Logo (SVG) — Optional"
          description="Alternative version for dark backgrounds"
          previewBg="bg-gray-900"
          value={logoBright}
          sponsorName={sponsorName}
          filenameSuffix="-logo-bright"
          onChange={(svg) => onChange({ logoBright: svg })}
        />
      </div>
    </div>
  )
}
