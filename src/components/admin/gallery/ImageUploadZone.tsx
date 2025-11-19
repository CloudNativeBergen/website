'use client'

import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { CloudArrowUpIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useNotification } from '../NotificationProvider'
import { GALLERY_CONSTANTS } from '@/lib/gallery/constants'
import {
  getCurrentDateTime,
  fileTimestampToISO,
  extractDateFromISO,
  extractTimeFromISO,
  updateDateInISO,
  updateTimeInISO,
  exifDateTimeToISO,
} from '@/lib/time'

/**
 * ImageUploadZone Component
 *
 * Drag-and-drop file upload zone with progress tracking and metadata entry.
 *
 * Design Choice: react-dropzone was chosen over @dnd-kit/core for this use case because:
 * - react-dropzone is specifically optimized for file upload scenarios
 * - It provides built-in file validation, preview generation, and MIME type handling
 * - @dnd-kit is better suited for sortable lists and complex drag interactions (used elsewhere in admin)
 * - This component focuses solely on file drops, not element reordering
 *
 * Features:
 * - Concurrent uploads with configurable limit (3)
 * - Real-time progress tracking per file
 * - Conference-scoped uploads (multi-tenant support)
 * - Metadata entry for photographer, date, location
 * - Validation for conference selection
 */

interface UploadFile {
  file: File
  preview: string
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
  extractedDate?: string // EXIF or file timestamp for this specific file
}

interface ImageUploadZoneProps {
  onUploadComplete: (uploadedCount: number) => Promise<void>
  defaultMetadata?: {
    photographer?: string
    date?: string
    location?: string
    conference?: string
    featured?: boolean
  }
}

export function ImageUploadZone({
  onUploadComplete,
  defaultMetadata = {},
}: ImageUploadZoneProps) {
  const { showNotification } = useNotification()
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [metadata, setMetadata] = useState({
    photographer: defaultMetadata.photographer || '',
    date: defaultMetadata.date || '',
    location: defaultMetadata.location || '',
    featured: defaultMetadata.featured || false,
  })
  const uploadAbortController = useRef<AbortController | null>(null)

  const resizeImage = useCallback(async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img')
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      img.onload = () => {
        let { width, height } = img
        const maxWidth = GALLERY_CONSTANTS.UPLOAD.RESIZE_MAX_WIDTH
        const maxHeight = GALLERY_CONSTANTS.UPLOAD.RESIZE_MAX_HEIGHT

        if (width <= maxWidth && height <= maxHeight) {
          resolve(file)
          return
        }

        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height
        ctx?.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const resizedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              })
              resolve(resizedFile)
            } else {
              reject(new Error(`Failed to resize ${file.name}`))
            }
          },
          file.type,
          GALLERY_CONSTANTS.UPLOAD.RESIZE_QUALITY,
        )
      }

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${file.name}`))
      }
      img.src = URL.createObjectURL(file)
    })
  }, [])

  const extractExifMetadata = useCallback(
    async (
      file: File,
    ): Promise<{
      date?: string
      location?: string
    }> => {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const dataView = new DataView(arrayBuffer)

        if (dataView.getUint16(0) !== 0xffd8) {
          return { date: fileTimestampToISO(file) }
        }

        let offset = 2
        const exifData: { date?: string; location?: string } = {}

        while (offset < dataView.byteLength) {
          const marker = dataView.getUint16(offset)
          offset += 2

          if (marker === 0xffe1) {
            const length = dataView.getUint16(offset)
            offset += 2

            const exifString = String.fromCharCode(
              dataView.getUint8(offset),
              dataView.getUint8(offset + 1),
              dataView.getUint8(offset + 2),
              dataView.getUint8(offset + 3),
            )

            if (exifString === 'Exif') {
              const exifBlock = new Uint8Array(arrayBuffer, offset, length - 2)
              const exifString = new TextDecoder().decode(exifBlock)

              const dateTimeMatch = exifString.match(
                /(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
              )
              if (dateTimeMatch) {
                const exifDateTimeStr = `${dateTimeMatch[1]}:${dateTimeMatch[2]}:${dateTimeMatch[3]} ${dateTimeMatch[4]}:${dateTimeMatch[5]}:${dateTimeMatch[6]}`
                exifData.date = exifDateTimeToISO(exifDateTimeStr)
              }
            }

            break
          }

          if (marker >= 0xffc0 && marker <= 0xffef) {
            const length = dataView.getUint16(offset)
            offset += length
          } else {
            break
          }
        }

        if (!exifData.date) {
          exifData.date = fileTimestampToISO(file)
        }

        return exifData
      } catch (error) {
        console.warn('Failed to extract EXIF data:', error)
        return { date: fileTimestampToISO(file) }
      }
    },
    [],
  )

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: Array<{ file: File; errors: Array<{ code: string; message: string }> }>) => {
      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach((rejection) => {
          const fileName = rejection.file.name
          const errors = rejection.errors.map((e) => {
            switch (e.code) {
              case 'file-too-large':
                return `File too large (max ${GALLERY_CONSTANTS.UPLOAD.MAX_FILE_SIZE_MB}MB)`
              case 'file-invalid-type':
                return 'Invalid file type (only images allowed)'
              default:
                return e.message
            }
          }).join(', ')

          showNotification({
            title: `Rejected: ${fileName}`,
            message: errors,
            type: 'error',
          })
        })
      }

      if (acceptedFiles.length === 0) {
        return
      }

      const processedFiles = await Promise.allSettled(
        acceptedFiles.map(async (file) => {
          try {
            const resized = await resizeImage(file)
            const exifData = await extractExifMetadata(file)
            return {
              file: resized,
              preview: URL.createObjectURL(resized),
              progress: 0,
              status: 'pending' as const,
              extractedDate: exifData.date,
            }
          } catch (error) {
            showNotification({
              title: `Failed to process ${file.name}`,
              message: error instanceof Error ? error.message : 'Processing failed',
              type: 'error',
            })
            throw error
          }
        }),
      )

      const successfulFiles = processedFiles
        .filter((result): result is PromiseFulfilledResult<UploadFile> => result.status === 'fulfilled')
        .map((result) => result.value)

      const failedCount = processedFiles.filter(
        (result) => result.status === 'rejected',
      ).length

      if (failedCount > 0) {
        showNotification({
          title: `${failedCount} file(s) failed to process`,
          type: 'error',
        })
      }

      if (successfulFiles.length > 0) {
        setFiles((prev) => [...prev, ...successfulFiles])
      }
    },
    [resizeImage, extractExifMetadata, showNotification],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: GALLERY_CONSTANTS.UPLOAD.ACCEPTED_MIME_TYPES,
    maxSize: GALLERY_CONSTANTS.UPLOAD.MAX_FILE_SIZE_BYTES,
  })

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
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

    setIsUploading(true)
    showNotification({
      title: `Uploading ${files.length} ${files.length === 1 ? 'image' : 'images'}...`,
      type: 'info',
    })

    let successCount = 0
    let failCount = 0

    const uploadFile = (file: UploadFile, index: number): Promise<void> => {
      return new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest()
        const formData = new FormData()

        const fileMetadata = {
          ...metadata,
          date: metadata.date || file.extractedDate || getCurrentDateTime(),
        }

        formData.append('files', file.file)
        formData.append('metadata', JSON.stringify(fileMetadata))

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round(
              (event.loaded / event.total) * 100,
            )
            setFiles((prev) => {
              const newFiles = [...prev]
              newFiles[index] = {
                ...newFiles[index],
                progress: percentComplete,
                status: 'uploading',
              }
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
              setFiles((prev) => {
                const newFiles = [...prev]
                newFiles[index] = {
                  ...newFiles[index],
                  status: isSuccess ? 'completed' : 'error',
                  error: uploadResult.error,
                  progress: 100,
                }
                return newFiles
              })
              if (isSuccess) {
                successCount++
              } else {
                failCount++
                showNotification({
                  title: `Failed: ${file.file.name}`,
                  message: uploadResult.error || 'Upload failed',
                  type: 'error',
                })
              }
            } catch {
              setFiles((prev) => {
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
              showNotification({
                title: `Failed: ${file.file.name}`,
                message: 'Invalid response from server',
                type: 'error',
              })
            }
          } else if (xhr.status === 413) {
            // Body size limit exceeded
            setFiles((prev) => {
              const newFiles = [...prev]
              newFiles[index] = {
                ...newFiles[index],
                status: 'error',
                error: 'File too large',
                progress: 100,
              }
              return newFiles
            })
            failCount++
            showNotification({
              title: `Failed: ${file.file.name}`,
              message:
                'Image is too large. Maximum file size is 10MB. Please resize your image.',
              type: 'error',
            })
          } else {
            setFiles((prev) => {
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
            showNotification({
              title: `Failed: ${file.file.name}`,
              message: `Server error: ${xhr.status}`,
              type: 'error',
            })
          }
          resolve()
        }

        xhr.onerror = () => {
          setFiles((prev) => {
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
          showNotification({
            title: `Failed: ${file.file.name}`,
            message: 'Network error occurred',
            type: 'error',
          })
          resolve()
        }

        xhr.open('POST', '/api/admin/gallery/upload')
        xhr.send(formData)

        if (!uploadAbortController.current) {
          uploadAbortController.current = new AbortController()
        }
        uploadAbortController.current.signal.addEventListener('abort', () => {
          xhr.abort()
        })
      })
    }

    const concurrencyLimit = GALLERY_CONSTANTS.UPLOAD.CONCURRENT_UPLOADS
    const uploadQueue = [...files.map((file, index) => ({ file, index }))]
    const activeUploads: Promise<void>[] = []

    try {
      while (uploadQueue.length > 0 || activeUploads.length > 0) {
        while (
          activeUploads.length < concurrencyLimit &&
          uploadQueue.length > 0
        ) {
          const next = uploadQueue.shift()!
          const uploadPromise = uploadFile(next.file, next.index).then(() => {
            const idx = activeUploads.indexOf(uploadPromise)
            if (idx !== -1) activeUploads.splice(idx, 1)
          })
          activeUploads.push(uploadPromise)
        }

        if (activeUploads.length > 0) {
          await Promise.race(activeUploads)
        }
      }

      if (successCount > 0) {
        showNotification({
          title: `Uploaded ${successCount} image(s)`,
          message: 'Processing and indexing images...',
          type: 'info',
        })
        await onUploadComplete(successCount)

        showNotification({
          title: `Successfully added ${successCount} image(s) to gallery`,
          type: 'success',
        })

        setTimeout(() => {
          setFiles((prev) => {
            prev.forEach((f) => URL.revokeObjectURL(f.preview))
            return []
          })
        }, 1500)
      } else if (failCount > 0) {
        showNotification({
          title: `Failed to upload ${failCount} image(s)`,
          type: 'error',
        })
      } else {
        setFiles((prev) => {
          prev.forEach((f) => URL.revokeObjectURL(f.preview))
          return []
        })
      }
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label
            htmlFor="photographer"
            className="mb-1 block text-sm font-medium text-gray-900 dark:text-white"
          >
            Photographer
          </label>
          <input
            type="text"
            id="photographer"
            value={metadata.photographer}
            onChange={(e) =>
              setMetadata((prev) => ({
                ...prev,
                photographer: e.target.value,
              }))
            }
            className="block h-9 w-full rounded-md border-0 px-3 text-sm text-gray-900 ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-gray-500 dark:focus:ring-indigo-500"
            placeholder="John Doe"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label
            htmlFor="location"
            className="mb-1 block text-sm font-medium text-gray-900 dark:text-white"
          >
            Location
          </label>
          <input
            type="text"
            id="location"
            value={metadata.location}
            onChange={(e) =>
              setMetadata((prev) => ({ ...prev, location: e.target.value }))
            }
            className="block h-9 w-full rounded-md border-0 px-3 text-sm text-gray-900 ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-gray-500 dark:focus:ring-indigo-500"
            placeholder="Conference Hall"
          />
        </div>
        <div className="w-40">
          <label
            htmlFor="date"
            className="mb-1 block text-sm font-medium text-gray-900 dark:text-white"
          >
            Date
          </label>
          <input
            type="date"
            id="date"
            value={metadata.date ? extractDateFromISO(metadata.date) : ''}
            onChange={(e) => {
              if (e.target.value) {
                const baseDate = metadata.date || getCurrentDateTime()
                setMetadata((prev) => ({
                  ...prev,
                  date: updateDateInISO(baseDate, e.target.value),
                }))
              } else {
                setMetadata((prev) => ({ ...prev, date: '' }))
              }
            }}
            placeholder="Auto from EXIF"
            className="block h-9 w-full rounded-md border-0 px-3 text-sm text-gray-900 ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:bg-white/5 dark:text-white dark:scheme-dark dark:ring-white/10 dark:placeholder:text-gray-500 dark:focus:ring-indigo-500"
          />
        </div>
        <div className="w-[120px]">
          <label
            htmlFor="time"
            className="mb-1 block text-sm font-medium text-gray-900 dark:text-white"
          >
            Time
          </label>
          <input
            type="time"
            id="time"
            value={metadata.date ? extractTimeFromISO(metadata.date) : ''}
            onChange={(e) => {
              if (e.target.value) {
                const baseDate = metadata.date || getCurrentDateTime()
                setMetadata((prev) => ({
                  ...prev,
                  date: updateTimeInISO(baseDate, e.target.value),
                }))
              } else {
                setMetadata((prev) => ({ ...prev, date: '' }))
              }
            }}
            placeholder="Auto from EXIF"
            className="block h-9 w-full rounded-md border-0 px-3 text-sm text-gray-900 ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:bg-white/5 dark:text-white dark:scheme-dark dark:ring-white/10 dark:placeholder:text-gray-500 dark:focus:ring-indigo-500"
          />
        </div>
        <div className="flex h-9 items-center">
          <label className="flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={metadata.featured}
              onChange={(e) =>
                setMetadata((prev) => ({ ...prev, featured: e.target.checked }))
              }
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-indigo-500 dark:focus:ring-indigo-500"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Featured
            </span>
          </label>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${isDragActive
            ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/30'
            : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
          }`}
      >
        <input {...getInputProps()} aria-label="Upload images" />
        <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {isDragActive
            ? 'Drop the images here...'
            : 'Drag and drop images here, or click to select'}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
          PNG, JPG, GIF up to {GALLERY_CONSTANTS.UPLOAD.MAX_FILE_SIZE_MB}MB each
        </p>
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
                  <div className="bg-opacity-75 absolute inset-0 flex items-center justify-center rounded-lg bg-red-500">
                    <p className="text-sm text-white">Failed</p>
                  </div>
                )}
                {file.status === 'completed' && (
                  <div className="bg-opacity-75 absolute inset-0 flex items-center justify-center rounded-lg bg-green-700 dark:bg-green-800">
                    <p className="text-sm text-white">Uploaded</p>
                  </div>
                )}
                {file.status === 'uploading' && (
                  <div className="bg-opacity-75 absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-blue-600 dark:bg-blue-800">
                    <p className="text-sm text-white">Uploading...</p>
                    <p className="text-xs text-white">{file.progress}%</p>
                    <div className="bg-opacity-30 mt-2 h-1 w-3/4 rounded-full bg-white">
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
                    className="absolute top-1 right-1 rounded-full bg-white p-1 text-gray-500 hover:text-gray-700"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
                <p className="mt-1 truncate text-xs text-gray-600">
                  {file.file.name}
                </p>
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
                  files.forEach((f) => URL.revokeObjectURL(f.preview))
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
