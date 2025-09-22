import { useState, useEffect, useCallback } from 'react'
import type { Speaker } from '@/lib/speaker/types'

interface UseProfileReturn {
  profile: Speaker | null
  loading: boolean
  error: string | null
  updateProfile: (data: Partial<Speaker>) => Promise<void>
  uploadImage: (file: File) => Promise<string>
  removeImage: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = useState<Speaker | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/profile')
      if (!response.ok) {
        throw new Error('Failed to fetch profile')
      }

      const data = await response.json()

      setProfile(data.speaker || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  const updateProfile = useCallback(async (data: Partial<Speaker>) => {
    try {
      setError(null)

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update profile')
      }

      const updatedData = await response.json()

      setProfile(updatedData.speaker || updatedData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    }
  }, [])

  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      try {
        setError(null)

        const formData = new FormData()
        formData.append('image', file)

        const response = await fetch('/api/profile/image', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to upload image')
        }

        const { imageUrl } = await response.json()

        if (profile) {
          setProfile({ ...profile, image: imageUrl })
        }

        return imageUrl
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
        throw err
      }
    },
    [profile],
  )

  const removeImage = useCallback(async () => {
    try {
      setError(null)

      const response = await fetch('/api/profile/image', {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to remove image')
      }

      if (profile) {
        setProfile({ ...profile, image: undefined })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    }
  }, [profile])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  return {
    profile,
    loading,
    error,
    updateProfile,
    uploadImage,
    removeImage,
    refreshProfile: fetchProfile,
  }
}
