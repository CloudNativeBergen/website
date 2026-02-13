'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { ModalShell } from '@/components/ModalShell'
import { ContractReadinessIndicator } from './ContractReadinessIndicator'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  ArrowLeftIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

type Step = 'readiness' | 'preview' | 'confirm'

interface SendContractModalProps {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function SendContractModal({
  conferenceId,
  sponsor,
  isOpen,
  onClose,
  onSuccess,
}: SendContractModalProps) {
  const [step, setStep] = useState<Step>('readiness')
  const [pdfData, setPdfData] = useState<string | null>(null)
  const [pdfFilename, setPdfFilename] = useState<string>('')
  const [signerEmail, setSignerEmail] = useState(
    sponsor.signerEmail || getPrimaryContactEmail(sponsor) || '',
  )
  const [error, setError] = useState<string | null>(null)

  const { data: readiness } =
    api.sponsor.contractTemplates.contractReadiness.useQuery(
      { id: sponsor._id },
      { enabled: isOpen },
    )

  const { data: bestTemplate } =
    api.sponsor.contractTemplates.findBest.useQuery(
      {
        conferenceId,
        tierId: sponsor.tier?._id,
      },
      { enabled: isOpen },
    )

  const generatePdf = api.sponsor.contractTemplates.generatePdf.useMutation({
    onSuccess: (data) => {
      setPdfData(data.pdf)
      setPdfFilename(data.filename)
      setStep('preview')
    },
    onError: (err) => setError(err.message),
  })

  const sendContract = api.sponsor.crm.sendContract.useMutation({
    onSuccess: () => {
      onSuccess?.()
      handleClose()
    },
    onError: (err) => setError(err.message),
  })

  const handleClose = () => {
    setStep('readiness')
    setPdfData(null)
    setError(null)
    onClose()
  }

  const handleGeneratePdf = () => {
    if (!bestTemplate) {
      setError('No contract template found for this sponsor&apos;s tier.')
      return
    }
    setError(null)
    generatePdf.mutate({
      sponsorForConferenceId: sponsor._id,
      templateId: bestTemplate._id,
    })
  }

  const handleSend = () => {
    if (!pdfData || !bestTemplate) return
    setError(null)
    sendContract.mutate({
      sponsorForConferenceId: sponsor._id,
      templateId: bestTemplate._id,
      signerEmail: signerEmail.trim() || undefined,
    })
  }

  const isReady = readiness?.ready === true
  const primaryContact = getPrimaryContact(sponsor)
  const isBusy = generatePdf.isPending || sendContract.isPending

  return (
    <ModalShell isOpen={isOpen} onClose={handleClose} size="3xl" padded={false}>
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {step !== 'readiness' && (
            <button
              type="button"
              onClick={() =>
                setStep(step === 'confirm' ? 'preview' : 'readiness')
              }
              className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
          )}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {step === 'readiness' && 'Send Contract'}
              {step === 'preview' && 'Contract Preview'}
              {step === 'confirm' && 'Confirm & Send'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {sponsor.sponsor.name}
              {sponsor.tier && ` \u2014 ${sponsor.tier.title}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="cursor-pointer text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
        >
          <span className="sr-only">Close</span>
          <span className="text-xl">&times;</span>
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {step === 'readiness' && (
          <div className="space-y-4">
            <ContractReadinessIndicator sponsorForConferenceId={sponsor._id} />

            {bestTemplate ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                <div className="flex items-center gap-2">
                  <DocumentTextIcon className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                      Template: {bestTemplate.title}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Language:{' '}
                      {bestTemplate.language === 'nb' ? 'Norwegian' : 'English'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    No contract template found. Create one in the contract
                    templates section first.
                  </p>
                </div>
              </div>
            )}

            {primaryContact && (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Primary contact
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {primaryContact.name} &lt;{primaryContact.email}&gt;
                </p>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && pdfData && (
          <div className="space-y-4">
            <iframe
              src={`data:application/pdf;base64,${pdfData}`}
              className="h-[55vh] w-full rounded-lg border border-gray-200 dark:border-gray-700"
              title="Contract preview"
            />
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Contract details
              </h4>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Sponsor</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {sponsor.sponsor.name}
                  </dd>
                </div>
                {sponsor.tier && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Tier</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {sponsor.tier.title}
                    </dd>
                  </div>
                )}
                {sponsor.contractValue != null && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Value</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {sponsor.contractValue.toLocaleString()}{' '}
                      {sponsor.contractCurrency}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">File</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {pdfFilename}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Signer email (for digital signing)
              </label>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                The person who should receive and sign the contract. Leave empty
                to skip digital signing for now.
              </p>
              <input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder={primaryContact?.email || 'signer@company.com'}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Digital signing via Posten signering is not yet integrated.
                  The contract will be generated and the status updated, but
                  signing must be handled manually.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
        >
          Cancel
        </button>

        {step === 'readiness' && (
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={!isReady || !bestTemplate || isBusy}
            className={clsx(
              'inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
              !isReady || !bestTemplate
                ? 'bg-gray-400 dark:bg-gray-600'
                : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
            )}
          >
            <DocumentTextIcon className="h-4 w-4" />
            {generatePdf.isPending ? 'Generating\u2026' : 'Generate PDF'}
          </button>
        )}

        {step === 'preview' && (
          <button
            type="button"
            onClick={() => setStep('confirm')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <CheckCircleIcon className="h-4 w-4" />
            Looks good, continue
          </button>
        )}

        {step === 'confirm' && (
          <button
            type="button"
            onClick={handleSend}
            disabled={isBusy}
            className={clsx(
              'inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
              isBusy
                ? 'bg-gray-400 dark:bg-gray-600'
                : 'bg-green-600 hover:bg-green-500 dark:bg-green-500 dark:hover:bg-green-400',
            )}
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {sendContract.isPending ? 'Sending\u2026' : 'Send Contract'}
          </button>
        )}
      </div>
    </ModalShell>
  )
}

function getPrimaryContact(sponsor: SponsorForConferenceExpanded) {
  return (
    sponsor.contactPersons?.find((c) => c.isPrimary) ||
    sponsor.contactPersons?.[0] ||
    null
  )
}

function getPrimaryContactEmail(sponsor: SponsorForConferenceExpanded) {
  return getPrimaryContact(sponsor)?.email || null
}
