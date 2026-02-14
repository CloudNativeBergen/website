'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { ContractReadinessIndicator } from './ContractReadinessIndicator'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

type Step = 'overview' | 'preview' | 'confirm'

interface SponsorContractViewProps {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded
  onSuccess?: () => void
}

export function SponsorContractView({
  conferenceId,
  sponsor,
  onSuccess,
}: SponsorContractViewProps) {
  const [step, setStep] = useState<Step>('overview')
  const [pdfData, setPdfData] = useState<string | null>(null)
  const [pdfFilename, setPdfFilename] = useState<string>('')
  const [signerEmail, setSignerEmail] = useState(
    sponsor.signerEmail || getPrimaryContactEmail(sponsor) || '',
  )
  const [error, setError] = useState<string | null>(null)

  const { data: readiness } =
    api.sponsor.contractTemplates.contractReadiness.useQuery({
      id: sponsor._id,
    })

  const { data: bestTemplate } =
    api.sponsor.contractTemplates.findBest.useQuery({
      conferenceId,
      tierId: sponsor.tier?._id,
    })

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
      setStep('overview')
      setPdfData(null)
    },
    onError: (err) => setError(err.message),
  })

  const checkStatus = api.sponsor.crm.checkSignatureStatus.useMutation({
    onSuccess: () => onSuccess?.(),
    onError: (err) =>
      setError(`Failed to check signature status: ${err.message}`),
  })

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

  const canSend = readiness?.canSend === true
  const primaryContact = getPrimaryContact(sponsor)
  const isBusy = generatePdf.isPending || sendContract.isPending
  const isSigned = sponsor.contractStatus === 'contract-signed'
  const isSent = sponsor.contractStatus === 'contract-sent'
  const isPendingSignature =
    sponsor.signatureStatus === 'pending' && !!sponsor.signatureId
  const isPortalComplete = sponsor.onboardingComplete === true

  // Preview step (manual send flow)
  if (step === 'preview' && pdfData) {
    return (
      <div className="space-y-4 py-4">
        <iframe
          src={`data:application/pdf;base64,${pdfData}`}
          className="h-[50vh] w-full rounded-lg border border-gray-200 dark:border-gray-700"
          title="Contract preview"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep('confirm')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <CheckCircleIcon className="h-4 w-4" />
            Looks good, continue
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('overview')
              setPdfData(null)
            }}
            className="inline-flex cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // Confirm step (manual send flow)
  if (step === 'confirm') {
    return (
      <div className="space-y-4 py-4">
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
            The person who should receive and sign the contract. Leave empty to
            skip digital signing for now.
          </p>
          <input
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder={primaryContact?.email || 'signer@company.com'}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>

        {signerEmail.trim() ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 shrink-0 text-blue-500" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                The contract will be sent to{' '}
                <strong>{signerEmail.trim()}</strong> for digital signing via
                Adobe Acrobat Sign.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                No signer email provided. The contract will be generated and
                status updated, but digital signing will not be initiated.
              </p>
            </div>
          </div>
        )}

        {error && <ErrorBanner message={error} />}

        <div className="flex gap-3">
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
          <button
            type="button"
            onClick={() => setStep('preview')}
            className="inline-flex cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // Overview step
  return (
    <div className="space-y-4 py-4">
      {error && <ErrorBanner message={error} />}

      {/* Step 1: Registration */}
      <ContractFlowStep
        step={1}
        title="Sponsor registration"
        status={
          isPortalComplete
            ? 'complete'
            : sponsor.onboardingToken
              ? 'active'
              : 'pending'
        }
      >
        {isPortalComplete ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Company details, contacts, billing, and logo collected.
            {sponsor.onboardingCompletedAt &&
              ` Completed ${new Date(sponsor.onboardingCompletedAt).toLocaleDateString()}.`}
          </p>
        ) : (
          <SponsorPortalSection
            sponsorForConferenceId={sponsor._id}
            existingToken={sponsor.onboardingToken}
            portalComplete={false}
          />
        )}
      </ContractFlowStep>

      {/* Step 2: Contract */}
      <ContractFlowStep
        step={2}
        title="Generate &amp; send contract"
        status={
          isSigned
            ? 'complete'
            : isSent
              ? 'complete'
              : isPortalComplete
                ? 'active'
                : 'pending'
        }
      >
        {isSigned ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Contract signed
            {sponsor.contractSignedAt &&
              ` on ${new Date(sponsor.contractSignedAt).toLocaleDateString()}`}
            .
          </p>
        ) : isSent ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Contract sent
            {sponsor.contractSentAt &&
              ` on ${new Date(sponsor.contractSentAt).toLocaleDateString()}`}
            .
          </p>
        ) : isPortalComplete ? (
          <div className="space-y-3">
            <ContractReadinessIndicator
              sponsorForConferenceId={sponsor._id}
              conferenceId={conferenceId}
            />

            {bestTemplate ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <DocumentTextIcon className="h-3.5 w-3.5" />
                Template: {bestTemplate.title} (
                {bestTemplate.language === 'nb' ? 'Norwegian' : 'English'})
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    No contract template found. Create one in the contract
                    templates section first.
                  </p>
                </div>
              </div>
            )}

            {primaryContact && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Primary contact: {primaryContact.name} &lt;
                {primaryContact.email}&gt;
              </p>
            )}

            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={!canSend || !bestTemplate || isBusy}
              className={clsx(
                'inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
                !canSend || !bestTemplate
                  ? 'bg-gray-400 dark:bg-gray-600'
                  : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
              )}
            >
              <DocumentTextIcon className="h-4 w-4" />
              {generatePdf.isPending
                ? 'Generating\u2026'
                : 'Generate contract PDF'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Waiting for sponsor to complete registration.
          </p>
        )}
      </ContractFlowStep>

      {/* Step 3: Signature */}
      <ContractFlowStep
        step={3}
        title="Digital signing"
        status={
          isSigned ? 'complete' : isPendingSignature ? 'active' : 'pending'
        }
        isLast
      >
        {isSigned ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Signed
            {sponsor.contractSignedAt &&
              ` on ${new Date(sponsor.contractSignedAt).toLocaleDateString()}`}
            .
          </p>
        ) : isPendingSignature ? (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Awaiting signature from {sponsor.signerEmail || 'signer'}.
            </p>
            <button
              type="button"
              onClick={() => checkStatus.mutate({ id: sponsor._id })}
              disabled={checkStatus.isPending}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-600 dark:hover:bg-gray-700"
              title="Check signing status with Adobe Sign"
            >
              <ArrowPathIcon
                className={`h-3.5 w-3.5 ${checkStatus.isPending ? 'animate-spin' : ''}`}
              />
              Check status
            </button>
          </div>
        ) : isSent ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Contract sent without digital signing.
          </p>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Contract will be sent for digital signing after generation.
          </p>
        )}
      </ContractFlowStep>
    </div>
  )
}

function ContractFlowStep({
  step,
  title,
  status,
  isLast,
  children,
}: {
  step: number
  title: string
  status: 'pending' | 'active' | 'complete'
  isLast?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative flex gap-3">
      {/* Vertical connector line */}
      {!isLast && (
        <div
          className={clsx(
            'absolute top-7 left-3 w-0.5',
            status === 'complete'
              ? 'bg-green-300 dark:bg-green-700'
              : 'bg-gray-200 dark:bg-gray-700',
          )}
          style={{ bottom: '-1rem' }}
        />
      )}

      {/* Step indicator */}
      <div
        className={clsx(
          'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          status === 'complete' &&
          'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
          status === 'active' &&
          'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-500',
          status === 'pending' &&
          'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
        )}
      >
        {status === 'complete' ? <CheckIcon className="h-3.5 w-3.5" /> : step}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-4">
        <h4
          className={clsx(
            'text-sm font-semibold',
            status === 'complete' && 'text-green-700 dark:text-green-400',
            status === 'active' && 'text-gray-900 dark:text-white',
            status === 'pending' && 'text-gray-400 dark:text-gray-500',
          )}
        >
          {title}
        </h4>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  )
}

function SponsorPortalSection({
  sponsorForConferenceId,
  existingToken,
  portalComplete,
}: {
  sponsorForConferenceId: string
  existingToken?: string
  portalComplete?: boolean
}) {
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const generateMutation = api.onboarding.generateToken.useMutation({
    onSuccess: (data) => setGeneratedUrl(data.url),
  })

  const sendInviteMutation = api.onboarding.sendPortalInvite.useMutation({
    onSuccess: (data) => {
      setGeneratedUrl(data.url)
      setEmailSent(true)
    },
  })

  const handleGenerate = () => {
    if (existingToken) {
      const baseUrl = window.location.origin
      setGeneratedUrl(`${baseUrl}/sponsor/portal/${existingToken}`)
    } else {
      generateMutation.mutate({ sponsorForConferenceId })
    }
  }

  const handleSendEmail = () => {
    sendInviteMutation.mutate({ sponsorForConferenceId })
  }

  const handleCopy = async () => {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.querySelector<HTMLInputElement>(
        'input[readonly][value="' + generatedUrl + '"]',
      )
      if (input) {
        input.select()
        input.setSelectionRange(0, input.value.length)
        document.execCommand('copy')
      }
    }
  }

  const isBusy = generateMutation.isPending || sendInviteMutation.isPending

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
        Sponsor registration
      </h4>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Send the sponsor a registration form to collect their company details
        (org number, address), contact persons, billing information, and logo.
      </p>

      {portalComplete ? (
        <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckIcon className="h-4 w-4" />
          Sponsor completed registration
        </div>
      ) : generatedUrl ? (
        <div className="mt-3 space-y-2">
          {emailSent && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              Registration email sent to sponsor contacts
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={generatedUrl}
              readOnly
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600"
              title="Copy to clipboard"
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {!emailSent && (
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendInviteMutation.isPending}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                title="Send registration link via email to sponsor contacts"
              >
                <EnvelopeIcon className="h-3.5 w-3.5" />
                {sendInviteMutation.isPending ? 'Sending\u2026' : 'Send'}
              </button>
            )}
          </div>
          {sendInviteMutation.isError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {sendInviteMutation.error.message}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={isBusy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <EnvelopeIcon className="h-4 w-4" />
            {sendInviteMutation.isPending
              ? 'Sending\u2026'
              : 'Send registration email'}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isBusy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
          >
            <LinkIcon className="h-4 w-4" />
            {generateMutation.isPending ? 'Generating\u2026' : 'Copy link only'}
          </button>
          {sendInviteMutation.isError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {sendInviteMutation.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
      <div className="flex items-center gap-2">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-500" />
        <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      </div>
    </div>
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
