import { useState, useCallback } from 'react'

export interface ImageUploadResult {
  assetId: string
  url: string
}

export interface ImageUploadOptions {
  speakerId?: string
}

export interface UseSpeakerImageUploadReturn {
  uploadImage: (file: File) => Promise<ImageUploadResult>
  isUploading: boolean
  error: string | null
  clearError: () => void
}

// Constants for image upload validation
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]

/**
 * Validates image file before upload
 * @param file - The file to validate
 * @returns Error message if invalid, null if valid
 */
function validateImageFile(file: File): string | null {
  if (!file) {
    return 'No file provided'
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `Invalid file type "${file.type}". Please upload a JPEG, PNG, GIF, or WebP image.`
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'File size is too large. Maximum file size is 10MB.'
  }

  return null
}

/**
 * Custom hook for handling speaker image uploads
 * Provides consistent image upload functionality across speaker forms
 * Includes client-side validation for immediate feedback
 */
export function useSpeakerImageUpload(
  options: ImageUploadOptions = {},
): UseSpeakerImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadImage = useCallback(
    async (file: File): Promise<ImageUploadResult> => {
      setIsUploading(true)
      setError(null)

      try {
        // Client-side validation for immediate feedback
        const validationError = validateImageFile(file)
        if (validationError) {
          throw new Error(validationError)
        }

        const formData = new FormData()
        formData.append('file', file)

        if (options.speakerId) {
          formData.append('speakerId', options.speakerId)
        }

        const response = await fetch('/api/upload/speaker-image', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          // API returns error messages in the 'error' field
          throw new Error(
            errorData.error || errorData.message || 'Failed to upload image',
          )
        }

        const result = await response.json()
        return result as ImageUploadResult
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to upload image'
        setError(errorMessage)
        throw err
      } finally {
        setIsUploading(false)
      }
    },
    [options.speakerId],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    uploadImage,
    isUploading,
    error,
    clearError,
  }
}
