'use client'

import { useMemo, useState, useEffect } from 'react'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { ImageGrid } from './ImageGrid'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface GroupedImageGridProps {
  images: GalleryImageWithSpeakers[]
  onImageUpdate: (image: GalleryImageWithSpeakers) => void
  onImageDelete: (imageId: string) => void
  onToggleFeatured: (imageId: string, featured: boolean) => Promise<void>
  selectedImages: string[]
  onSelectionChange: (images: string[]) => void
}

export function GroupedImageGrid({
  images,
  onImageUpdate,
  onImageDelete,
  onToggleFeatured,
  selectedImages,
  onSelectionChange,
}: GroupedImageGridProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Group images by conference
  const groupedImages = useMemo(() => {
    const groups = new Map<string, {
      conference: { id: string; title: string; domain?: string }
      images: GalleryImageWithSpeakers[]
    }>()

    // Handle images without conference
    const noConferenceImages: GalleryImageWithSpeakers[] = []

    images.forEach(image => {
      if (image.conference) {
        const conferenceId = image.conference._id
        if (!groups.has(conferenceId)) {
          groups.set(conferenceId, {
            conference: {
              id: conferenceId,
              title: image.conference.title,
              domain: image.conference.domains?.[0],
            },
            images: [],
          })
        }
        groups.get(conferenceId)!.images.push(image)
      } else {
        noConferenceImages.push(image)
      }
    })

    // Add "No Conference" group if there are orphaned images
    if (noConferenceImages.length > 0) {
      groups.set('no-conference', {
        conference: {
          id: 'no-conference',
          title: 'No Conference',
        },
        images: noConferenceImages,
      })
    }

    // Sort groups by conference title
    return Array.from(groups.values()).sort((a, b) => {
      if (a.conference.id === 'no-conference') return 1
      if (b.conference.id === 'no-conference') return -1
      return a.conference.title.localeCompare(b.conference.title)
    })
  }, [images])

  const toggleGroup = (conferenceId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(conferenceId)) {
        newSet.delete(conferenceId)
      } else {
        newSet.add(conferenceId)
      }
      return newSet
    })
  }

  const toggleAllGroups = () => {
    if (expandedGroups.size === groupedImages.length) {
      setExpandedGroups(new Set())
    } else {
      setExpandedGroups(new Set(groupedImages.map(g => g.conference.id)))
    }
  }

  // Auto-expand all groups on first render
  useEffect(() => {
    setExpandedGroups(new Set(groupedImages.map(g => g.conference.id)))
  }, []) // Only run once on mount

  if (groupedImages.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">No images found</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Expand/Collapse All Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Gallery Images by Conference</h3>
        <button
          onClick={toggleAllGroups}
          className="text-sm text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
        >
          {expandedGroups.size === groupedImages.length ? (
            <>
              <ChevronDownIcon className="h-4 w-4" />
              Collapse All
            </>
          ) : (
            <>
              <ChevronRightIcon className="h-4 w-4" />
              Expand All
            </>
          )}
        </button>
      </div>

      {/* Conference Groups */}
      {groupedImages.map(group => {
        const isExpanded = expandedGroups.has(group.conference.id)
        const groupImages = group.images
        const selectedInGroup = groupImages.filter(img => selectedImages.includes(img._id)).length

        return (
          <div key={group.conference.id} className="border rounded-lg overflow-hidden">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.conference.id)}
              className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                )}
                <div className="text-left">
                  <h4 className="font-medium text-gray-900">
                    {group.conference.title}
                    {group.conference.id === 'no-conference' && (
                      <span className="ml-2 text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">
                        Needs Assignment
                      </span>
                    )}
                  </h4>
                  {group.conference.domain && (
                    <p className="text-sm text-gray-500">{group.conference.domain}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {selectedInGroup > 0 && (
                  <span className="text-sm text-indigo-600">
                    {selectedInGroup} selected
                  </span>
                )}
                <span className="text-sm text-gray-500">
                  {groupImages.length} {groupImages.length === 1 ? 'image' : 'images'}
                </span>
              </div>
            </button>

            {/* Group Content */}
            {isExpanded && (
              <div className="p-4 border-t">
                <ImageGrid
                  images={groupImages}
                  onImageUpdate={onImageUpdate}
                  onImageDelete={onImageDelete}
                  onToggleFeatured={onToggleFeatured}
                  selectedImages={selectedImages}
                  onSelectionChange={onSelectionChange}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}