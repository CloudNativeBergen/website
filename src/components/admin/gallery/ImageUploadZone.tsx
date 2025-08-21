'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { CloudArrowUpIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useNotification } from '../NotificationProvider'
import { api } from '@/lib/trpc/client'

/**
 * ImageUploadZone Component
 * 
 * Uses react-dropzone for file selection and drag-and-drop functionality.
 * 
 * Design Choice: react-dropzone was chosen over @dnd-kit/core for this use case because:
 * - react-dropzone is specifically optimized for file upload scenarios
 * - It provides built-in file validation, preview generation, and MIME type handling
 * - @dnd-kit is better suited for sortable lists and complex drag interactions (used elsewhere in admin)
 * - This component focuses solely on file drops, not element reordering
 */

interface UploadFile {
  file: File
  preview: string
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
}

interface ImageUploadZoneProps {
  onUploadComplete: () => void
  defaultMetadata?: {
    photographer?: string
    date?: string
    location?: string
    conference?: string
    featured?: boolean
  }
  currentConferenceId?: string // Passed from parent component
}

export function ImageUploadZone({ onUploadComplete, defaultMetadata = {}, currentConferenceId }: ImageUploadZoneProps) {
  const { showNotification } = useNotification()
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [metadata, setMetadata] = useState({
    photographer: defaultMetadata.photographer || '',
    date: defaultMetadata.date || new Date().toISOString().split('T')[0],
    location: defaultMetadata.location || '',
    conference: defaultMetadata.conference || currentConferenceId || '',
    featured: defaultMetadata.featured || false,
  })
  const uploadAbortController = useRef<AbortController | null>(null)

  // Fetch available conferences
  const { data: conferences, isLoading: conferencesLoading } = api.gallery.conferences.useQuery()

  // Set the current conference only on initial mount
  useEffect(() => {
    if (currentConferenceId && !defaultMetadata.conference) {
      setMetadata(prev => ({ ...prev, conference: currentConferenceId }))
    }
  }, [currentConferenceId, defaultMetadata.conference])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      progress: 0,
      status: 'pending' as const,
    }))
    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    maxSize: 10 * 1024 * 1024,
  })

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const newFiles = [...prev]
      URL.revokeObjectURL(newFiles[index].preview)
      newFiles.splice(index, 1)
      return newFiles
    })
  }, [])

  const uploadFiles = async () => {
    if (files.length === 0) {
      showNotification({ title: 'No files selected', type: 'error' })
      return
    }

    // Validate conference is selected
    if (!metadata.conference) {
      showNotification({ title: 'Please select a conference', type: 'error' })
      return
    }

    setIsUploading(true)
    
    // Local counters for tracking success/failure
    let successCount = 0
    let failCount = 0
    
    // Upload files with concurrency limit of 3
    const uploadFile = (file: UploadFile, index: number): Promise<void> => {
      return new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest()
        const formData = new FormData()
        
        formData.append('files', file.file)
        formData.append('metadata', JSON.stringify(metadata))
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100)
            setFiles(prev => {
              const newFiles = [...prev]
              newFiles[index] = { ...newFiles[index], progress: percentComplete, status: 'uploading' }
              return newFiles
            })
          }
        }
        
        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText)
              const uploadResult = result.results[0]
              const isSuccess = uploadResult.success
              setFiles(prev => {
                const newFiles = [...prev]
                newFiles[index] = {
                  ...newFiles[index],
                  status: isSuccess ? 'completed' : 'error',
                  error: uploadResult.error,
                  progress: 100,
                }
                return newFiles
              })
              // Update local counters
              if (isSuccess) {
                successCount++
              } else {
                failCount++
              }
            } catch {
              setFiles(prev => {
                const newFiles = [...prev]
                newFiles[index] = {
                  ...newFiles[index],
                  status: 'error',
                  error: 'Invalid response',
                  progress: 100,
                }
                return newFiles
              })
              failCount++
            }
          } else {
            setFiles(prev => {
              const newFiles = [...prev]
              newFiles[index] = {
                ...newFiles[index],
                status: 'error',
                error: 'Upload failed',
                progress: 100,
              }
              return newFiles
            })
            failCount++
          }
          resolve()
        }
        
        xhr.onerror = () => {
          setFiles(prev => {
            const newFiles = [...prev]
            newFiles[index] = {
              ...newFiles[index],
              status: 'error',
              error: 'Network error',
              progress: 0,
            }
            return newFiles
          })
          failCount++
          resolve()
        }
        
        xhr.open('POST', '/api/admin/gallery/upload')
        xhr.send(formData)
        
        // Store xhr for potential cancellation
        if (!uploadAbortController.current) {
          uploadAbortController.current = new AbortController()
        }
        uploadAbortController.current.signal.addEventListener('abort', () => {
          xhr.abort()
        })
      })
    }
    
    // Process uploads with concurrency limit
    const concurrencyLimit = 3
    const uploadQueue = [...files.map((file, index) => ({ file, index }))]
    const activeUploads: Promise<void>[] = []
    
    try {
      while (uploadQueue.length > 0 || activeUploads.length > 0) {
        // Start new uploads up to the concurrency limit
        while (activeUploads.length < concurrencyLimit && uploadQueue.length > 0) {
          const next = uploadQueue.shift()!
          const uploadPromise = uploadFile(next.file, next.index).then(() => {
            // Remove from active uploads when done
            const idx = activeUploads.indexOf(uploadPromise)
            if (idx !== -1) activeUploads.splice(idx, 1)
          })
          activeUploads.push(uploadPromise)
        }
        
        // Wait for at least one upload to complete before continuing
        if (activeUploads.length > 0) {
          await Promise.race(activeUploads)
        }
      }
      
      if (successCount > 0) {
        showNotification({ title: `Successfully uploaded ${successCount} image(s)`, type: 'success' })
        onUploadComplete()
      }
      
      if (failCount > 0) {
        showNotification({ title: `Failed to upload ${failCount} image(s)`, type: 'error' })
      }
      
      setTimeout(() => {
        setFiles(prev => {
          prev.forEach(f => URL.revokeObjectURL(f.preview))
          return []
        })
      }, 2000)
    } catch {
      showNotification({ title: 'Upload failed', type: 'error' })
    } finally {
      setIsUploading(false)
      uploadAbortController.current = null
    }
  }

  const cancelUpload = () => {
    if (uploadAbortController.current) {
      uploadAbortController.current.abort()
    }
  }

  return (
    <div className="space-y-6">
      {/* Conference Selection Warning */}
      {!metadata.conference && (
        <div className="rounded-md bg-yellow-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Conference Required
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  A conference must be selected before uploading images. This ensures images are properly organized for multi-tenant support.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="conference" className="block text-sm font-medium text-gray-700">
            Conference <span className="text-red-500">*</span>
          </label>
          <select
            id="conference"
            value={metadata.conference}
            onChange={(e) => setMetadata(prev => ({ ...prev, conference: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            required
            disabled={conferencesLoading}
          >
            <option value="">Select a conference</option>
            {conferences?.map((conf) => (
              <option key={conf._id} value={conf._id}>
                {conf.title}
                {conf.domains && conf.domains.length > 0 && ` (${conf.domains[0]})`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="photographer" className="block text-sm font-medium text-gray-700">
            Photographer
          </label>
          <input
            type="text"
            id="photographer"
            value={metadata.photographer}
            onChange={(e) => setMetadata(prev => ({ ...prev, photographer: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="John Doe"
          />
        </div>
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700">
            Date
          </label>
          <input
            type="date"
            id="date"
            value={metadata.date}
            onChange={(e) => setMetadata(prev => ({ ...prev, date: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700">
            Location
          </label>
          <input
            type="text"
            id="location"
            value={metadata.location}
            onChange={(e) => setMetadata(prev => ({ ...prev, location: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Conference Hall"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={metadata.featured}
              onChange={(e) => setMetadata(prev => ({ ...prev, featured: e.target.checked }))}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="ml-2 text-sm text-gray-700">Featured</span>
          </label>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`relative rounded-lg border-2 border-dashed p-6 text-center ${
          isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          {isDragActive
            ? 'Drop the images here...'
            : 'Drag and drop images here, or click to select'}
        </p>
        <p className="mt-1 text-xs text-gray-500">PNG, JPG, GIF up to 10MB each</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {files.map((file, index) => (
              <div key={index} className="relative">
                <img
                  src={file.preview}
                  alt=""
                  className="h-32 w-full rounded-lg object-cover"
                />
                {file.status === 'error' && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-red-500 bg-opacity-75">
                    <p className="text-sm text-white">Failed</p>
                  </div>
                )}
                {file.status === 'completed' && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-green-500 bg-opacity-75">
                    <p className="text-sm text-white">Uploaded</p>
                  </div>
                )}
                {file.status === 'uploading' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-blue-500 bg-opacity-75">
                    <p className="text-sm text-white">Uploading...</p>
                    <p className="text-xs text-white">{file.progress}%</p>
                    <div className="mt-2 h-1 w-3/4 rounded-full bg-white bg-opacity-30">
                      <div 
                        className="h-full rounded-full bg-white transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  </div>
                )}
                {!isUploading && file.status === 'pending' && (
                  <button
                    onClick={() => removeFile(index)}
                    className="absolute right-1 top-1 rounded-full bg-white p-1 text-gray-500 hover:text-gray-700"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
                <p className="mt-1 truncate text-xs text-gray-600">{file.file.name}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={uploadFiles}
              disabled={isUploading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : `Upload ${files.length} Image(s)`}
            </button>
            {isUploading && (
              <button
                onClick={cancelUpload}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Cancel
              </button>
            )}
            {!isUploading && files.length > 0 && (
              <button
                onClick={() => {
                  files.forEach(f => URL.revokeObjectURL(f.preview))
                  setFiles([])
                }}
                className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}