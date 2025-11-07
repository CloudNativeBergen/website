'use client'

import { useState } from 'react'
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'

interface ValidationCheck {
  name: string
  status: 'pending' | 'success' | 'warning' | 'error'
  message: string
  details?: Record<string, unknown>
}

interface BadgeCredential {
  '@context': string[]
  id: string
  type: string[]
  issuer: {
    id: string
    name?: string
    url?: string
  }
  credentialSubject: {
    id?: string
    type?: string[]
    achievement?: {
      id?: string
      name?: string
      description?: string
    }
  }
  validFrom?: string
  proof?: Array<{
    type: string
    created: string
    verificationMethod: string
    cryptosuite: string
    proofPurpose: string
    proofValue: string
  }>
}

export default function BadgeValidator() {
  const [file, setFile] = useState<File | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [checks, setChecks] = useState<ValidationCheck[]>([])
  const [credential, setCredential] = useState<BadgeCredential | null>(null)
  const [svgPreview, setSvgPreview] = useState<string | null>(null)

  const resetState = () => {
    setFile(null)
    setChecks([])
    setCredential(null)
    setSvgPreview(null)
    setIsValidating(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.svg')) {
        alert('Please upload an SVG file')
        return
      }
      resetState()
      setFile(selectedFile)

      // Generate preview
      const reader = new FileReader()
      reader.onload = (event) => {
        const svgContent = event.target?.result as string
        setSvgPreview(svgContent)
      }
      reader.readAsText(selectedFile)
    }
  }

  const updateCheck = (
    name: string,
    status: ValidationCheck['status'],
    message: string,
    details?: Record<string, unknown>,
  ) => {
    setChecks((prev) => {
      const existing = prev.find((c) => c.name === name)
      if (existing) {
        return prev.map((c) =>
          c.name === name ? { name, status, message, details } : c,
        )
      }
      return [...prev, { name, status, message, details }]
    })
  }

  const validateBadge = async () => {
    if (!file) return

    setIsValidating(true)
    setChecks([])
    setCredential(null)

    try {
      // Step 1: Read SVG content
      updateCheck('file', 'pending', 'Reading SVG file...')
      const svgContent = await file.text()
      updateCheck('file', 'success', 'SVG file loaded successfully')

      // Call server-side API (avoids CORS issues)
      const response = await fetch('/api/badge/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ svg: svgContent }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        updateCheck(
          'validation',
          'error',
          `Server validation failed: ${errorData.error || 'Unknown error'}`,
        )
        setIsValidating(false)
        return
      }

      const { checks: serverChecks, credential: extractedCredential } =
        await response.json()

      // Update all checks from server response
      serverChecks.forEach((check: ValidationCheck) => {
        updateCheck(check.name, check.status, check.message, check.details)
      })

      // Set credential if extracted
      if (extractedCredential) {
        setCredential(extractedCredential)
      }
    } catch (err) {
      updateCheck(
        'error',
        'error',
        `Validation error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setIsValidating(false)
    }
  }

  const getStatusIcon = (status: ValidationCheck['status']) => {
    switch (status) {
      case 'success':
        return (
          <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
        )
      case 'error':
        return <XCircleIcon className="h-5 w-5 text-red-500" />
      case 'warning':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
      case 'pending':
        return <ClockIcon className="h-5 w-5 animate-spin text-blue-500" />
    }
  }

  const getStatusColor = (status: ValidationCheck['status']) => {
    switch (status) {
      case 'success':
        return 'border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-950/50'
      case 'error':
        return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
      case 'warning':
        return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950'
      case 'pending':
        return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          OpenBadges 3.0 Validator
        </h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Upload a baked badge SVG to validate its authenticity according to the
          OpenBadges 3.0 specification. This validator will extract the
          credential, verify the issuer profile, validate the Data Integrity
          Proof, and check all endpoints referenced in the credential.
        </p>

        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 transition-colors hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500">
            <ArrowUpTrayIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {file ? file.name : 'Choose SVG file...'}
            </span>
            <input
              type="file"
              accept=".svg"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {file && (
            <button
              onClick={validateBadge}
              disabled={isValidating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isValidating ? 'Validating...' : 'Validate Badge'}
            </button>
          )}

          {file && !isValidating && (
            <button
              onClick={resetState}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Preview & Results */}
      {(svgPreview || checks.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* SVG Preview */}
          {svgPreview && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                Badge Preview
              </h3>
              <div
                className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
                dangerouslySetInnerHTML={{ __html: svgPreview }}
              />
            </div>
          )}

          {/* Validation Results */}
          {checks.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                Validation Results
              </h3>
              <div className="space-y-3">
                {checks.map((check, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border p-3 ${getStatusColor(check.status)}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getStatusIcon(check.status)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {check.name}
                        </p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {check.message}
                        </p>
                        {check.details && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                              View details
                            </summary>
                            <pre className="mt-2 overflow-auto rounded bg-white p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                              {JSON.stringify(check.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Credential Details */}
      {credential && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
            Credential Details
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Credential ID:
              </span>
              <a
                href={credential.id}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-blue-600 hover:underline dark:text-blue-400"
              >
                {credential.id}
              </a>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Issuer:
              </span>
              <a
                href={credential.issuer.id}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-blue-600 hover:underline dark:text-blue-400"
              >
                {credential.issuer.name || credential.issuer.id}
              </a>
            </div>
            {credential.credentialSubject?.achievement && (
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Achievement:
                </span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">
                  {credential.credentialSubject.achievement.name ||
                    'Unnamed achievement'}
                </span>
              </div>
            )}
            {credential.validFrom && (
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Valid From:
                </span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">
                  {new Date(credential.validFrom).toLocaleString()}
                </span>
              </div>
            )}
            {credential.proof && credential.proof.length > 0 && (
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Proof Type:
                </span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">
                  {credential.proof[0].type} ({credential.proof[0].cryptosuite})
                </span>
              </div>
            )}
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100">
              View full credential JSON
            </summary>
            <pre className="mt-2 overflow-auto rounded border border-gray-200 bg-gray-50 p-4 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {JSON.stringify(credential, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
