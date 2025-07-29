'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { PhotoIcon, TrashIcon } from '@heroicons/react/24/outline'
import { ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { useProfile } from '@/hooks/useProfile'

interface ProfileImageUploadProps {
  currentImage?: string
  speakerName: string
}

export function ProfileImageUpload({
  currentImage,
  speakerName,
}: ProfileImageUploadProps) {
  const { uploadImage, removeImage } = useProfile()
  const [imageUrl, setImageUrl] = useState(currentImage || '')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update imageUrl when currentImage changes
  useEffect(() => {
    setImageUrl(currentImage || '')
  }, [currentImage])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB')
      return
    }

    setError('')
    setIsUploading(true)

    try {
      const newImageUrl = await uploadImage(file)
      setImageUrl(newImageUrl)
    } catch (error) {
      console.error('Error uploading image:', error)
      setError(
        error instanceof Error ? error.message : 'Failed to upload image',
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveImage = async () => {
    if (!confirm('Are you sure you want to remove your profile picture?')) {
      return
    }

    setIsUploading(true)
    setError('')

    try {
      await removeImage()
      setImageUrl('')

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Error removing image:', error)
      setError(
        error instanceof Error ? error.message : 'Failed to remove image',
      )
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-brand-slate-gray">
        Profile Picture
      </label>

      {/* Error Message */}
      {error && (
        <div className="bg-brand-sunset-glow/10 rounded-md p-3">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationCircleIcon
                className="text-brand-sunset-glow/70 h-5 w-5"
                aria-hidden="true"
              />
            </div>
            <div className="ml-3">
              <p className="text-brand-sunset-glow text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center space-x-6">
        {/* Current Image or Placeholder */}
        <div className="relative h-24 w-24 overflow-hidden rounded-full bg-brand-sky-mist">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={`${speakerName} profile picture`}
              fill
              className="object-cover"
              sizes="96px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PhotoIcon className="h-12 w-12 text-brand-frosted-steel" />
            </div>
          )}
        </div>

        {/* Upload/Remove Buttons */}
        <div className="flex flex-col space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center rounded-md border border-brand-frosted-steel bg-brand-glacier-white px-3 py-2 text-sm leading-4 font-medium text-brand-slate-gray shadow-sm hover:bg-brand-sky-mist focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-brand-slate-gray"></div>
                Uploading...
              </>
            ) : (
              <>
                <PhotoIcon className="mr-2 h-4 w-4" />
                {imageUrl ? 'Change Photo' : 'Upload Photo'}
              </>
            )}
          </button>

          {imageUrl && (
            <button
              type="button"
              onClick={handleRemoveImage}
              disabled={isUploading}
              className="border-brand-sunset-glow text-brand-sunset-glow hover:bg-brand-sunset-glow/10 focus:ring-brand-sunset-glow inline-flex items-center rounded-md border bg-brand-glacier-white px-3 py-2 text-sm leading-4 font-medium shadow-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TrashIcon className="mr-2 h-4 w-4" />
              Remove Photo
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-brand-frosted-steel">
        Recommended: Square image, at least 400x400 pixels, max 5MB
      </p>
    </div>
  )
}
