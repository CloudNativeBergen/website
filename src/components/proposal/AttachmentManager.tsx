'use client'

import { useState } from 'react'
import {
  ArrowUpTrayIcon,
  XMarkIcon,
  DocumentIcon,
  LinkIcon,
} from '@heroicons/react/24/outline'
import {
  validateAttachmentFile,
  formatFileSize,
} from '@/lib/attachment/validation'
import { AttachmentConfig, AttachmentType } from '@/lib/attachment/config'
import { Attachment } from '@/lib/attachment/types'
import { getNonRecordingAttachments } from '@/lib/attachment/filters'
import { Input, Dropdown } from '@/components/Form'
import { v4 as uuidv4 } from 'uuid'

interface AttachmentManagerProps {
  proposalId: string
  attachments: Attachment[]
  onAttachmentsChange: (attachments: Attachment[]) => void
  onDeleteAttachment: (attachmentKey: string) => void
  readonly?: boolean
}

const attachmentTypeOptions = new Map([
  ['slides', 'Slides'],
  ['recording', 'Recording'],
  ['resource', 'Resource'],
])

export function AttachmentManager({
  proposalId,
  attachments,
  onAttachmentsChange,
  onDeleteAttachment,
  readonly = false,
}: AttachmentManagerProps) {
  const visibleAttachments = getNonRecordingAttachments(attachments)

  const [isAdding, setIsAdding] = useState(false)
  const [addType, setAddType] = useState<'file' | 'url'>('file')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attachmentType, setAttachmentType] = useState<AttachmentType>('slides')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const resetForm = () => {
    setAttachmentType('slides')
    setTitle('')
    setDescription('')
    setUrl('')
    setSelectedFile(null)
    setError(null)
    setIsAdding(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateAttachmentFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file')
      return
    }

    setSelectedFile(file)
    // Pre-populate title with filename (without extension) if title is empty
    if (!title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
      setTitle(nameWithoutExt)
    }
    setError(null)
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!readonly && !isAdding) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (readonly || isAdding) return

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const validation = validateAttachmentFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file')
      setIsAdding(true)
      return
    }

    setSelectedFile(file)
    // Pre-populate title with filename (without extension)
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
    setTitle(nameWithoutExt)
    setError(null)
    setIsAdding(true)
    setAddType('file')
  }

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file')
      return
    }

    setIsUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('proposalId', proposalId)

      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(),
        AttachmentConfig.timeouts.fileUpload,
      )

      const response = await fetch('/api/upload/proposal-attachment', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = 'Upload failed'
        try {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json()
            errorMessage = data.error || errorMessage
          } else {
            const text = await response.text()
            errorMessage = text || `Upload failed (${response.status})`
          }
        } catch (parseError) {
          console.error('Error parsing response:', parseError)
          errorMessage = `Upload failed (${response.status})`
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()

      const newAttachment: Attachment = {
        _type: 'fileAttachment',
        _key: uuidv4(),
        file: {
          _type: 'file',
          asset: data.asset,
        },
        attachmentType,
        title: title || undefined,
        description: description || undefined,
        filename: data.filename,
        uploadedAt: new Date().toISOString(),
      }

      onAttachmentsChange([...attachments, newAttachment])
      resetForm()
    } catch (err) {
      console.error('Upload error:', err)
      let errorMsg = 'Failed to upload attachment'
      if (err instanceof Error) {
        errorMsg = err.message
        // Provide more helpful context for common errors
        if (
          errorMsg.includes('413') ||
          errorMsg.toLowerCase().includes('too large') ||
          errorMsg.toLowerCase().includes('entity too large')
        ) {
          errorMsg =
            'File is too large. The current hosting limit is approximately 4.5MB. Please use a smaller file or compress your slides.'
        }
      }
      setError(errorMsg)
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const validateUrl = (urlString: string): boolean => {
    if (!urlString) {
      setError('Please enter a URL')
      return false
    }

    try {
      new URL(urlString)
      setError(null)
      return true
    } catch {
      setError('Please enter a valid URL')
      return false
    }
  }

  const handleAddUrl = () => {
    if (!validateUrl(url)) return

    const newAttachment: Attachment = {
      _type: 'urlAttachment',
      _key: uuidv4(),
      url,
      attachmentType,
      title: title || undefined,
      description: description || undefined,
      uploadedAt: new Date().toISOString(),
    }

    onAttachmentsChange([...attachments, newAttachment])
    resetForm()
  }

  const handleRemove = (key: string) => {
    setDeleteConfirm(key)
  }

  const confirmDelete = (key: string) => {
    onDeleteAttachment(key)
    setDeleteConfirm(null)
  }

  const cancelDelete = () => {
    setDeleteConfirm(null)
  }

  return (
    <div className="space-y-4">
      {visibleAttachments.length > 0 && (
        <div className="space-y-2">
          {visibleAttachments.map((attachment) => {
            const typeLabel =
              attachmentTypeOptions.get(attachment.attachmentType) ||
              'Attachment'
            const displayTitle =
              attachment.title ||
              (attachment._type === 'fileAttachment'
                ? attachment.filename
                : attachment._type === 'urlAttachment'
                  ? attachment.url
                  : 'Untitled')

            return (
              <div
                key={attachment._key}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                {deleteConfirm === attachment._key ? (
                  /* Delete confirmation - full width, no title/label */
                  <div className="flex w-full items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Delete this attachment?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => confirmDelete(attachment._key)}
                        className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={cancelDelete}
                        className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal display */
                  <>
                    <div className="flex items-center space-x-3">
                      {attachment._type === 'fileAttachment' ? (
                        <DocumentIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <LinkIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      )}
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {displayTitle}
                          </p>
                          <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                            {typeLabel}
                          </span>
                        </div>
                        {attachment.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {attachment.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {attachment._type === 'urlAttachment' && (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-indigo-600 transition-colors hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                          Open
                        </a>
                      )}
                      {!readonly && (
                        <button
                          type="button"
                          onClick={() => handleRemove(attachment._key)}
                          className="text-red-600 transition-colors hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          aria-label="Remove attachment"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!readonly && !isAdding && (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-lg border-2 border-dashed transition-colors ${isDragging
              ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20'
              : 'border-gray-300 dark:border-gray-600'
            }`}
        >
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className={`flex w-full items-center justify-center p-4 text-sm font-medium transition-colors ${isDragging
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400'
              }`}
          >
            <ArrowUpTrayIcon className="mr-2 h-5 w-5" />
            {isDragging ? 'Drop file to upload' : 'Upload Attachment'}
          </button>
        </div>
      )}

      {!readonly && isAdding && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              Upload Attachment
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setAddType('file')}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${addType === 'file'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-300'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700'
                }`}
            >
              <DocumentIcon className="mx-auto mb-1 h-5 w-5" />
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setAddType('url')}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${addType === 'url'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-300'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700'
                }`}
            >
              <LinkIcon className="mx-auto mb-1 h-5 w-5" />
              Add URL
            </button>
          </div>

          <Dropdown
            name="attachmentType"
            label="Attachment Type"
            value={attachmentType}
            options={attachmentTypeOptions}
            setValue={(value) => setAttachmentType(value as AttachmentType)}
          />

          <Input
            name="title"
            label="Title (optional)"
            value={title}
            setValue={setTitle}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-white">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-indigo-400"
              placeholder="Additional information about this attachment"
            />
          </div>

          {addType === 'file' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-white">
                  Select File
                </label>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.pptx,.ppt,.odp,.key"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-gray-400 dark:file:bg-indigo-900/30 dark:file:text-indigo-300 dark:hover:file:bg-indigo-900/50"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Accepted formats: PDF, PPTX, PPT, ODP, KEY (max ~4MB due to
                  hosting limits)
                </p>
              </div>

              {selectedFile && (
                <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <DocumentIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {addType === 'url' && (
            <Input
              name="url"
              label="URL"
              type="url"
              value={url}
              setValue={setUrl}
            />
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          {isUploading && (
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-2 rounded-full bg-indigo-600 transition-all dark:bg-indigo-400"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-center text-xs text-gray-600 dark:text-gray-400">
                Uploading...
              </p>
            </div>
          )}

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={addType === 'file' ? handleFileUpload : handleAddUrl}
              disabled={isUploading || (addType === 'file' && !selectedFile)}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
            >
              {addType === 'file' ? 'Upload' : 'Add URL'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={isUploading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
