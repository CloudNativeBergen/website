import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Form/SponsorLogoEditor',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'SVG logo upload and preview with light/dark variant support. Validates SVG format, shows live previews on both light and dark backgrounds, and supports clearing uploads.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// Example SVG for demo
const exampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40" fill="#2563eb"/><text x="50" y="25" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14" font-weight="bold">LOGO</text></svg>`
const exampleBrightSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40" fill="#60a5fa"/><text x="50" y="25" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14" font-weight="bold">LOGO</text></svg>`

function LogoPreview({
  svg,
  label,
  background,
}: {
  svg: string | null
  label: string
  background: 'light' | 'dark'
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </p>
      <div
        className={`flex h-24 items-center justify-center rounded-lg border ${background === 'dark'
            ? 'border-gray-600 bg-gray-900'
            : 'border-gray-200 bg-white'
          }`}
      >
        {svg ? (
          <div
            className="h-10 w-24"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <span className="text-sm text-gray-400">No logo</span>
        )}
      </div>
    </div>
  )
}

function LogoEditorDemo() {
  const [logo, setLogo] = useState<string | null>(exampleSvg)
  const [logoBright, setLogoBright] = useState<string | null>(exampleBrightSvg)

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Primary Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-white">
            Logo (SVG) *
          </label>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Primary logo for light backgrounds
          </p>
          <div className="mt-2">
            <input
              type="file"
              accept=".svg"
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-indigo-500/10 dark:file:text-indigo-400"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = (e) => setLogo(e.target?.result as string)
                  reader.readAsText(file)
                }
              }}
            />
          </div>
          {logo && (
            <div className="mt-3 flex items-center justify-between">
              <LogoPreview svg={logo} label="Preview" background="light" />
              <div className="flex gap-2">
                <button
                  onClick={() => setLogo(null)}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  Remove
                </button>
                <button className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400">
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Download
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bright Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-white">
            Bright Logo (SVG)
          </label>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Alternative for dark backgrounds
          </p>
          <div className="mt-2">
            <input
              type="file"
              accept=".svg"
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-indigo-500/10 dark:file:text-indigo-400"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = (e) =>
                    setLogoBright(e.target?.result as string)
                  reader.readAsText(file)
                }
              }}
            />
          </div>
          {logoBright && (
            <div className="mt-3 flex items-center justify-between">
              <LogoPreview
                svg={logoBright}
                label="Preview (dark)"
                background="dark"
              />
              <button
                onClick={() => setLogoBright(null)}
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preview Section */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h4 className="mb-3 font-medium text-gray-900 dark:text-white">
          Logo Previews
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <LogoPreview svg={logo} label="Light Background" background="light" />
          <LogoPreview
            svg={logoBright || logo}
            label="Dark Background"
            background="dark"
          />
        </div>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => <LogoEditorDemo />,
}

export const EmptyState: Story = {
  render: () => (
    <div className="max-w-md">
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
        <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          Upload SVG Logo
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          SVG format required. Recommended: 200x80px or similar ratio.
        </p>
        <button className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Select File
        </button>
      </div>
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorLogoEditor
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Dual-logo upload component supporting primary (light background) and
          bright (dark background) variants. Accepts SVG files only and
          sanitizes content for security.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              logo
            </code>{' '}
            - Primary SVG string (for light backgrounds)
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              logoBright?
            </code>{' '}
            - Alternative SVG for dark backgrounds
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              name
            </code>{' '}
            - Sponsor name for download filename
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onChange
            </code>{' '}
            - Callback with updated logo values
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• SVG-only file validation</li>
          <li>• Automatic SVG sanitization (removes scripts, unsafe attrs)</li>
          <li>• Live preview on both light and dark backgrounds</li>
          <li>• Download functionality for stored logos</li>
          <li>• Support for bright variant fallback</li>
        </ul>
      </div>
    </div>
  ),
}
