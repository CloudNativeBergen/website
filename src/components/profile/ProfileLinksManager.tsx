'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, LinkIcon } from '@heroicons/react/24/outline'
import { ExclamationCircleIcon } from '@heroicons/react/24/solid'

interface ProfileLinksManagerProps {
  initialLinks: string[]
  onUpdate: (links: string[]) => Promise<void>
}

// Common social platforms for quick selection
const SOCIAL_PLATFORMS = [
  { label: 'Twitter/X', urlPattern: 'https://twitter.com/' },
  { label: 'LinkedIn', urlPattern: 'https://linkedin.com/in/' },
  { label: 'GitHub', urlPattern: 'https://github.com/' },
  { label: 'Bluesky', urlPattern: 'https://bsky.app/profile/' },
  { label: 'Personal Website', urlPattern: 'https://' },
  { label: 'Blog', urlPattern: 'https://' },
  { label: 'YouTube', urlPattern: 'https://youtube.com/@' },
  { label: 'Mastodon', urlPattern: 'https://' },
]

export function ProfileLinksManager({
  initialLinks,
  onUpdate,
}: ProfileLinksManagerProps) {
  const [links, setLinks] = useState<string[]>(initialLinks)
  const [newLink, setNewLink] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // Update local state when initialLinks change
  useEffect(() => {
    setLinks(initialLinks)
  }, [initialLinks])

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const addLink = () => {
    const trimmedLink = newLink.trim()

    if (!trimmedLink) {
      setError('URL is required')
      return
    }

    if (!validateUrl(trimmedLink)) {
      setError('Please enter a valid URL')
      return
    }

    if (links.includes(trimmedLink)) {
      setError('This link already exists')
      return
    }

    const updatedLinks = [...links, trimmedLink]
    setLinks(updatedLinks)
    setNewLink('')
    setError('')
  }

  const removeLink = (index: number) => {
    const updatedLinks = links.filter((_, i) => i !== index)
    setLinks(updatedLinks)
  }

  const updateLink = (index: number, value: string) => {
    const updatedLinks = [...links]
    updatedLinks[index] = value
    setLinks(updatedLinks)
  }

  const quickFill = (platform: (typeof SOCIAL_PLATFORMS)[0]) => {
    setNewLink(platform.urlPattern)
    setError('')
  }

  const handleSave = async () => {
    setIsSubmitting(true)
    setError('')
    setSuccessMessage('')

    try {
      await onUpdate(links)
      setSuccessMessage('Links updated successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      console.error('Error updating links:', error)
      setError(
        error instanceof Error ? error.message : 'Failed to update links',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Check if links have changed from initial
  const hasChanges = JSON.stringify(links) !== JSON.stringify(initialLinks)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-brand-slate-gray">
          Social Links
        </label>
        <span className="text-sm text-brand-frosted-steel">
          {links.length} link{links.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-brand-mint-frost/20 rounded-md p-4">
          <p className="text-sm font-medium text-brand-fresh-green">
            {successMessage}
          </p>
        </div>
      )}

      {/* Existing Links */}
      {links.length > 0 && (
        <div className="space-y-3">
          {links.map((link, index) => (
            <div
              key={`${link}_${index}`}
              className="flex items-center space-x-3 rounded-lg bg-brand-sky-mist p-3"
            >
              <LinkIcon className="h-5 w-5 flex-shrink-0 text-brand-frosted-steel" />
              <input
                type="url"
                value={link}
                onChange={(e) => updateLink(index, e.target.value)}
                placeholder="URL"
                className="block w-full rounded-md border-brand-frosted-steel shadow-sm focus:border-brand-cloud-blue focus:ring-brand-cloud-blue sm:text-sm"
              />
              <button
                type="button"
                onClick={() => removeLink(index)}
                className="text-brand-sunset-glow hover:text-brand-sunset-glow/80"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Link Form */}
      <div className="border-t pt-4">
        <h4 className="mb-3 text-sm font-medium text-brand-slate-gray">
          Add New Link
        </h4>

        {/* Quick Fill Buttons */}
        <div className="mb-3 flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((platform) => (
            <button
              key={platform.label}
              type="button"
              onClick={() => quickFill(platform)}
              className="inline-flex items-center rounded border border-brand-frosted-steel bg-brand-glacier-white px-2.5 py-1.5 text-xs font-medium text-brand-slate-gray shadow-sm hover:bg-brand-sky-mist focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none"
            >
              {platform.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <input
              type="url"
              value={newLink}
              onChange={(e) => {
                setNewLink(e.target.value)
                if (error) {
                  setError('')
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addLink()
                }
              }}
              placeholder="URL (e.g., https://twitter.com/username)"
              className={`block w-full rounded-md shadow-sm sm:text-sm ${
                error
                  ? 'border-brand-sunset-glow focus:border-brand-sunset-glow focus:ring-brand-sunset-glow'
                  : 'border-brand-frosted-steel focus:border-brand-cloud-blue focus:ring-brand-cloud-blue'
              }`}
            />
            {error && (
              <div className="mt-1 flex items-center">
                <ExclamationCircleIcon className="text-brand-sunset-glow/70 mr-1 h-4 w-4" />
                <p className="text-brand-sunset-glow text-sm">{error}</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={addLink}
            disabled={!newLink}
            className="hover:bg-brand-kubernetes-blue inline-flex items-center rounded-md border border-transparent bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white shadow-sm focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Add Link
          </button>
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end border-t pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="inline-flex items-center rounded-md border border-transparent bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-cloud-blue/90 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              'Save Links'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
