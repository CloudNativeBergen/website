'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/trpc/client'
import { useNotification, AdminPageHeader } from '@/components/admin'
import {
  ImageUploadZone,
  ImageGrid,
  ImageMetadataModal,
  GalleryFilters,
} from '@/components/admin/gallery'
import { PhotoIcon } from '@heroicons/react/24/outline'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

function GalleryPageContent() {
  const { showNotification } = useNotification()
  const utils = api.useUtils()
  const [filters, setFilters] = useState({
    featured: undefined as boolean | undefined,
    speakerId: undefined as string | undefined,
    dateFrom: undefined as string | undefined,
    dateTo: undefined as string | undefined,
    photographerSearch: undefined as string | undefined,
    locationSearch: undefined as string | undefined,
  })
  const [selectedImage, setSelectedImage] =
    useState<GalleryImageWithSpeakers | null>(null)
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false)
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [isWaitingForUpload, setIsWaitingForUpload] = useState(false)
  const itemsPerPage = 50

  const {
    data: images,
    isLoading,
    refetch: refetchImages,
  } = api.gallery.list.useQuery(
    {
      featured: filters.featured,
      speakerId: filters.speakerId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      photographerSearch: filters.photographerSearch,
      locationSearch: filters.locationSearch,
      limit: itemsPerPage,
      offset: (currentPage - 1) * itemsPerPage,
    },
    {
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    },
  )

  const { data: filteredCount } = api.gallery.count.useQuery({
    featured: filters.featured,
    speakerId: filters.speakerId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    photographerSearch: filters.photographerSearch,
    locationSearch: filters.locationSearch,
  })

  const deleteMutation = api.gallery.delete.useMutation({
    onSuccess: () => {
      showNotification({ title: 'Image deleted successfully', type: 'success' })
      utils.gallery.list.invalidate()
      utils.gallery.count.invalidate()
    },
    onError: (error) => {
      showNotification({
        title: error.message || 'Failed to delete image',
        type: 'error',
      })
    },
  })

  const toggleFeaturedMutation = api.gallery.toggleFeatured.useMutation({
    onSuccess: () => {
      showNotification({ title: 'Featured status updated', type: 'success' })
      utils.gallery.list.invalidate()
      utils.gallery.count.invalidate()
    },
    onError: (error) => {
      showNotification({
        title: error.message || 'Failed to update featured status',
        type: 'error',
      })
    },
  })

  const handleUploadComplete = useCallback(
    async (uploadedCount: number) => {
      setIsWaitingForUpload(true)
      const startCount = images?.length ?? 0

      let attempts = 0
      const maxAttempts = 10

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        await utils.gallery.list.invalidate()
        await utils.gallery.count.invalidate()
        const result = await refetchImages()

        const newCount = result.data?.length ?? 0
        if (newCount >= startCount + uploadedCount) {
          break
        }
        attempts++
      }

      setIsWaitingForUpload(false)
    },
    [utils, refetchImages, images],
  )

  const handleImageUpdate = useCallback(() => {
    utils.gallery.list.invalidate()
    utils.gallery.count.invalidate()
    setIsMetadataModalOpen(false)
    setSelectedImage(null)
  }, [utils])

  const handleImageDelete = useCallback(
    (imageId: string) => {
      deleteMutation.mutate({ id: imageId })
    },
    [deleteMutation],
  )

  const handleToggleFeatured = useCallback(
    async (imageId: string, featured: boolean) => {
      await toggleFeaturedMutation.mutateAsync({ id: imageId, featured })
    },
    [toggleFeaturedMutation],
  )

  const handleEditImage = useCallback((image: GalleryImageWithSpeakers) => {
    setSelectedImage(image)
    setIsMetadataModalOpen(true)
  }, [])

  const filteredTotal = filteredCount || 0
  const totalPages = Math.ceil(filteredTotal / itemsPerPage)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={<PhotoIcon />}
        title="Gallery Management"
        description="Upload and manage event photos"
      />

      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-900 dark:ring-1 dark:ring-gray-800">
        <ImageUploadZone
          onUploadComplete={handleUploadComplete}
          defaultMetadata={{
            photographer: '',
            location: '',
            featured: false,
          }}
        />
      </div>

      <GalleryFilters
        filters={filters}
        onFiltersChange={(newFilters) => {
          setFilters({
            featured: newFilters.featured ?? undefined,
            speakerId: newFilters.speakerId ?? undefined,
            dateFrom: newFilters.dateFrom ?? undefined,
            dateTo: newFilters.dateTo ?? undefined,
            photographerSearch: newFilters.photographerSearch ?? undefined,
            locationSearch: newFilters.locationSearch ?? undefined,
          })
          setCurrentPage(1)
        }}
      />

      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-900 dark:ring-1 dark:ring-gray-800">
        {isLoading || isWaitingForUpload ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-gray-500 dark:text-gray-400">
              {isWaitingForUpload
                ? 'Processing uploaded images...'
                : 'Loading images...'}
            </div>
          </div>
        ) : images && images.length > 0 ? (
          <ImageGrid
            images={images}
            onImageUpdate={handleEditImage}
            onImageDelete={handleImageDelete}
            onToggleFeatured={handleToggleFeatured}
            selectedImages={selectedImages}
            onSelectionChange={setSelectedImages}
          />
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <PhotoIcon className="h-16 w-16 text-gray-300 dark:text-gray-600" />
            <div className="text-center">
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
                {Object.values(filters).some((v) => v !== undefined)
                  ? 'No matching images'
                  : 'No images yet'}
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {Object.values(filters).some((v) => v !== undefined) ? (
                  <>Try adjusting your filters to see more results</>
                ) : (
                  <>Upload your first conference photos using the form above</>
                )}
              </p>
            </div>
          </div>
        )}

        {!isLoading && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-gray-200 px-4 pt-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {(currentPage - 1) * itemsPerPage + 1}-
                  {Math.min(currentPage * itemsPerPage, filteredTotal)} of{' '}
                  {filteredTotal}
                </p>
              </div>
              <div>
                <nav
                  className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                  aria-label="Pagination"
                >
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="sr-only">Previous</span>
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                          pageNum === currentPage
                            ? 'z-10 bg-indigo-600 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                            : 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-800'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="sr-only">Next</span>
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedImage && (
        <ImageMetadataModal
          image={selectedImage}
          isOpen={isMetadataModalOpen}
          onClose={() => {
            setIsMetadataModalOpen(false)
            setSelectedImage(null)
          }}
          onUpdate={handleImageUpdate}
        />
      )}
    </div>
  )
}

export default function GalleryPageClient() {
  return <GalleryPageContent />
}
