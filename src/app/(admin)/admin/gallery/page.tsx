'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/trpc/client'
import { NotificationProvider, useNotification } from '@/components/admin/NotificationProvider'
import { ImageUploadZone } from '@/components/admin/gallery/ImageUploadZone'
import { ImageGrid } from '@/components/admin/gallery/ImageGrid'
import { ImageMetadataModal } from '@/components/admin/gallery/ImageMetadataModal'
import { GalleryFilters } from '@/components/admin/gallery/GalleryFilters'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

function GalleryPageContent() {
  const { showNotification } = useNotification()
  const [filters, setFilters] = useState({
    featured: undefined as boolean | undefined,
    speakerId: undefined as string | undefined,
    dateFrom: undefined as string | undefined,
    dateTo: undefined as string | undefined,
    photographerSearch: undefined as string | undefined,
    locationSearch: undefined as string | undefined,
  })
  const [selectedImage, setSelectedImage] = useState<GalleryImageWithSpeakers | null>(null)
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false)
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  const { data: images, isLoading, refetch } = api.gallery.list.useQuery({
    featured: filters.featured,
    speakerId: filters.speakerId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    photographerSearch: filters.photographerSearch,
    locationSearch: filters.locationSearch,
    limit: itemsPerPage,
    offset: (currentPage - 1) * itemsPerPage,
  })

  const { data: stats } = api.gallery.stats.useQuery()
  
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
      refetch()
    },
    onError: (error: Error) => {
      showNotification({ title: error.message || 'Failed to delete image', type: 'error' })
    },
  })

  const toggleFeaturedMutation = api.gallery.toggleFeatured.useMutation({
    onSuccess: () => {
      showNotification({ title: 'Featured status updated', type: 'success' })
      refetch()
    },
    onError: (error: Error) => {
      showNotification({ title: error.message || 'Failed to update featured status', type: 'error' })
    },
  })

  const handleUploadComplete = useCallback(() => {
    refetch()
    showNotification({ title: 'Images uploaded successfully', type: 'success' })
  }, [refetch, showNotification])

  const handleImageUpdate = useCallback(() => {
    refetch()
    setIsMetadataModalOpen(false)
    setSelectedImage(null)
    showNotification({ title: 'Image updated successfully', type: 'success' })
  }, [refetch, showNotification])

  const handleImageDelete = useCallback((imageId: string) => {
    deleteMutation.mutate({ id: imageId })
  }, [deleteMutation])

  const handleToggleFeatured = useCallback(async (imageId: string, featured: boolean) => {
    await toggleFeaturedMutation.mutateAsync({ id: imageId, featured })
  }, [toggleFeaturedMutation])

  const handleEditImage = useCallback((image: GalleryImageWithSpeakers) => {
    setSelectedImage(image)
    setIsMetadataModalOpen(true)
  }, [])

  const totalImages = stats?.totalCount || 0
  const featuredCount = stats?.featuredCount || 0
  const filteredTotal = filteredCount || 0
  const totalPages = Math.ceil(filteredTotal / itemsPerPage)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Gallery Management</h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload and manage event photos
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <span className="text-gray-600">
              Total Images: <span className="font-semibold">{totalImages}</span>
            </span>
            <span className="text-gray-600">
              Featured: <span className="font-semibold">{featuredCount}</span>
            </span>
          </div>
        </div>

        <div className="mb-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Upload Images</h2>
          <ImageUploadZone
            onUploadComplete={handleUploadComplete}
            defaultMetadata={{
              photographer: '',
              date: new Date().toISOString().split('T')[0],
              location: '',
              featured: false,
            }}
          />
        </div>

        <div className="mb-6">
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
              setCurrentPage(1) // Reset to first page when filters change
            }}
          />
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-gray-500">Loading images...</div>
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
            <div className="flex h-64 items-center justify-center">
              <div className="text-gray-500">No images found</div>
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
                  <p className="text-sm text-gray-700">
                    Showing{' '}
                    <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span>
                    {' to '}
                    <span className="font-medium">
                      {Math.min(currentPage * itemsPerPage, filteredTotal)}
                    </span>
                    {' of '}
                    <span className="font-medium">{filteredTotal}</span>
                    {' results'}
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
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
                              ? 'z-10 bg-indigo-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                              : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="sr-only">Next</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
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
    </div>
  )
}

export default function GalleryPage() {
  return (
    <NotificationProvider>
      <GalleryPageContent />
    </NotificationProvider>
  )
}