import { useState, useEffect, useCallback } from 'react'

interface Email {
  email: string
  is_primary: boolean
  is_verified: boolean
}

interface UseEmailsReturn {
  emails: Email[]
  loading: boolean
  error: string | null
  refreshEmails: () => Promise<void>
}

export function useEmails(): UseEmailsReturn {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/profile/emails')
      if (!response.ok) {
        throw new Error('Failed to fetch emails')
      }

      const data = await response.json()
      setEmails(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])

  return {
    emails,
    loading,
    error,
    refreshEmails: fetchEmails,
  }
}
