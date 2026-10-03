'use client'

import { useState, useCallback } from 'react'
import { formatDate } from '@/lib/time'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'
import { ContractReadinessIndicator } from './ContractReadinessIndicator'
import { ContractFlowStep } from './ContractFlowStep'
import { SponsorPortalSection } from './SponsorPortalSection'
import { OrganizerSignatureCapture } from '@/components/admin/OrganizerSignatureCapture'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { formatNumber } from '@/lib/format'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

type Step = 'overview' | 'preview' | 'confirm'

interface SponsorContractViewProps {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded
  onSuccess?: () => void
  /** Send → Registration (#1263): opens the host's Send modal for this sponsor. */
  onSendRegistration?: () => void
  /**
   * Send → Contract (#1264): opens the host's Send modal with the contract
   * kind. The first send carries the previewed template and the assigned
   * organizer's counter-signature; a reminder or the signed copy carry
   * nothing — the server decides the action from the contract state.
   */
  onSendContract?: (options: ContractSendOptions) => void
}

export interface ContractSendOptions {
  contractTemplateId?: string
  organizerSignatureDataUrl?: string
}

export function SponsorContractView({
  conferenceId,
  sponsor,
  onSuccess,
  onSendRegistration,
  onSendContract,
}: SponsorContractViewProps) {
  const [step, setStep] = useState<Step>('overview')
  const [pdfData, setPdfData] = useState<string | null>(null)
  const [pdfFilename, setPdfFilename] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [organizerSignatureDataUrl, setOrganizerSignatureDataUrl] = useState<
    string | null
  >(null)

  const { data: session } = useSession()
  const isAssignedOrganizer =
    !!session?.speaker?._id &&
    !!sponsor.assignedTo?._id &&
    session.speaker._id === sponsor.assignedTo._id
  const organizerName =
    session?.speaker?.name || session?.user?.name || 'Organizer'

  const handleOrganizerSignatureReady = useCallback(
    (dataUrl: string | null) => {
      setOrganizerSignatureDataUrl(dataUrl)
    },
    [],
  )

  const { data: readiness } =
    api.sponsor.contractTemplates.contractReadiness.useQuery({
      id: sponsor._id,
    })

  const { data: bestTemplate } =
    api.sponsor.contractTemplates.findBest.useQuery({
      tierId: sponsor.tier?._id,
    })

  const generatePdf = api.sponsor.contractTemplates.generatePdf.useMutation({
    onSuccess: (data) => {
      setPdfData(data.pdf)
      setPdfFilename(data.filename)
      setStep('preview')
      setError(null)
    },
    onError: (err) => setError(friendlyError(err.message)),
  })

  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const checkStatus = api.sponsor.crm.checkSignatureStatus.useMutation({
    onSuccess: (data) => {
      onSuccess?.()
      if (data.changed) {
        setStatusMessage(`Signing status updated: ${data.signatureStatus}.`)
      } else {
        setStatusMessage('No status change — still awaiting signature.')
      }
      setError(null)
      setTimeout(() => setStatusMessage(null), 5000)
    },
    onError: (err) => setError(friendlyError(err.message)),
  })

  const handleGeneratePdf = () => {
    if (!bestTemplate) {
      setError(
        'No contract template found for this sponsor\u2019s tier. Create one in Settings first.',
      )
      return
    }
    setError(null)
    setStatusMessage(null)
    generatePdf.mutate({
      sponsorForConferenceId: sponsor._id,
      templateId: bestTemplate._id,
    })
  }

  // Hands off to the host's Send modal (#1264): recipients, signer and the
  // email itself are composed there; the server generates the agreement.
  const handleSend = () => {
    if (!pdfData || !bestTemplate || !onSendContract) return
    setError(null)
    setStatusMessage(null)
    onSendContract({
      contractTemplateId: bestTemplate._id,
      organizerSignatureDataUrl: organizerSignatureDataUrl ?? undefined,
    })
    setStep('overview')
    setPdfData(null)
  }

  const canSend = readiness?.canSend === true
  const primaryContact = getPrimaryContact(sponsor)
  const isBusy = generatePdf.isPending
  const isSigned = sponsor.contractStatus === 'contract-signed'
  const isSent = sponsor.contractStatus === 'contract-sent'
  const isPendingSignature =
    sponsor.signatureStatus === 'pending' && !!sponsor.signatureId
  const isPortalComplete = sponsor.registrationComplete === true
  const isSponsorWon = sponsor.status === 'closed-won'

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
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <CheckCircleIcon className="size-4" />
            Looks good, continue
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('overview')
              setPdfData(null)
            }}
            className="inline-flex cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:hover:bg-white/10"
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
                  {formatNumber(sponsor.contractValue)}{' '}
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

        {isAssignedOrganizer && (
          <OrganizerSignatureCapture
            organizerId={session!.speaker!._id}
            organizerName={organizerName}
            onSignatureReady={handleOrganizerSignatureReady}
          />
        )}

        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-center gap-2">
            <DocumentTextIcon className="h-5 w-5 shrink-0 text-blue-500" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Next, choose who receives the agreement and who signs it, review
              the email, and send. The signing link is created when you send.
            </p>
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={isBusy || !onSendContract}
            className={clsx(
              'inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm',
              isBusy || !onSendContract
                ? 'bg-gray-400 dark:bg-gray-600'
                : 'bg-green-600 hover:bg-green-500 dark:bg-green-500 dark:hover:bg-green-400',
            )}
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            Continue to send
          </button>
          <button
            type="button"
            onClick={() => setStep('preview')}
            className="inline-flex cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:hover:bg-white/10"
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
            : sponsor.registrationToken
              ? 'active'
              : 'pending'
        }
      >
        {isPortalComplete ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Company details, contacts, billing, and logo collected.
              {sponsor.registrationCompletedAt &&
                ` Completed ${formatDate(sponsor.registrationCompletedAt)}.`}
            </p>
            {onSendRegistration &&
              sponsor.registrationToken &&
              // Still offered after completion (#1263): a new contact may
              // need the link; the Send modal warns that registration is done.
              // Not for a deal that is no longer won — the server refuses it.
              isSponsorWon && (
                <button
                  type="button"
                  onClick={onSendRegistration}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10 dark:hover:bg-white/10"
                >
                  <PaperAirplaneIcon className="size-3.5" />
                  Resend registration link
                </button>
              )}
          </div>
        ) : !isSponsorWon ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Move the sponsor to Closed Won before sending registration.
          </p>
        ) : (
          <SponsorPortalSection
            sponsorForConferenceId={sponsor._id}
            existingToken={sponsor.registrationToken}
            portalComplete={false}
            registrationSent={
              sponsor.contractStatus === 'registration-sent' ||
              sponsor.contractStatus === 'contract-sent' ||
              sponsor.contractStatus === 'contract-signed'
            }
            onCheckStatus={
              sponsor.registrationToken ? () => onSuccess?.() : undefined
            }
            onSendInvite={onSendRegistration}
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
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Contract signed
              {sponsor.contractSignedAt &&
                ` on ${formatDate(sponsor.contractSignedAt)}`}
              .
            </p>
            {onSendContract && sponsor.contractDocument?.asset?.url && (
              <button
                type="button"
                onClick={() => onSendContract({})}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10 dark:hover:bg-white/10"
              >
                <PaperAirplaneIcon className="size-3.5" />
                Send signed copy
              </button>
            )}
          </div>
        ) : isSent ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Contract sent
            {sponsor.contractSentAt &&
              ` on ${formatDate(sponsor.contractSentAt)}`}
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
              ` on ${formatDate(sponsor.contractSignedAt)}`}
            .
          </p>
        ) : isPendingSignature ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Awaiting signature from{' '}
                {sponsor.signerName || sponsor.signerEmail || 'signer'}.
              </p>
              <button
                type="button"
                onClick={() => checkStatus.mutate({ id: sponsor._id })}
                disabled={checkStatus.isPending}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10 dark:hover:bg-white/10"
                title="Check signing status"
              >
                <ArrowPathIcon
                  className={`size-3.5 ${checkStatus.isPending ? 'animate-spin' : ''}`}
                />
                Check status
              </button>
            </div>

            {sponsor.signingUrl && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={sponsor.signingUrl}
                  readOnly
                  className="block flex-1 rounded-md bg-white px-2 py-1.5 text-xs text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10 dark:placeholder:text-gray-500"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(sponsor.signingUrl!)
                      setStatusMessage('URL copied to clipboard.')
                    } catch {
                      setStatusMessage('Failed to copy URL.')
                    }
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:hover:bg-white/10"
                  title="Copy to clipboard"
                >
                  Copy
                </button>
                {onSendContract && (
                  <button
                    type="button"
                    onClick={() => onSendContract({})}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    title="Send a signing reminder via email"
                  >
                    Send reminder
                  </button>
                )}
              </div>
            )}

            {statusMessage && (
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {statusMessage}
              </p>
            )}
          </div>
        ) : isSent ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Sent without a digital signing agreement (an older record).
          </p>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            The agreement is sent for digital signing when you send the
            contract.
          </p>
        )}
      </ContractFlowStep>

      {/* Contract summary — shown when contract is signed or sent */}
      {(isSigned || isSent) && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            Contract details
          </h4>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {sponsor.tier && (
              <>
                <dt className="text-gray-500 dark:text-gray-400">Tier</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {sponsor.tier.title}
                </dd>
              </>
            )}
            {sponsor.contractValue != null && (
              <>
                <dt className="text-gray-500 dark:text-gray-400">Value</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatNumber(sponsor.contractValue)}{' '}
                  {sponsor.contractCurrency}
                </dd>
              </>
            )}
            {sponsor.signerEmail && (
              <>
                <dt className="text-gray-500 dark:text-gray-400">Signer</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {sponsor.signerName
                    ? `${sponsor.signerName} (${sponsor.signerEmail})`
                    : sponsor.signerEmail}
                </dd>
              </>
            )}
            {sponsor.contractTemplate && (
              <>
                <dt className="text-gray-500 dark:text-gray-400">Template</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {sponsor.contractTemplate.title}
                </dd>
              </>
            )}
            {sponsor.organizerSignedBy && (
              <>
                <dt className="text-gray-500 dark:text-gray-400">
                  Counter-signed
                </dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {sponsor.organizerSignedBy}
                  {sponsor.organizerSignedAt &&
                    ` on ${formatDate(sponsor.organizerSignedAt)}`}
                </dd>
              </>
            )}
          </dl>
          {sponsor.contractDocument?.asset?.url && (
            <a
              href={sponsor.contractDocument.asset.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              View signed contract
            </a>
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

const ERROR_PATTERNS: Array<[RegExp, string]> = [
  [
    /not connected|connect via oauth/i,
    'The signing service is not connected. Ask an admin to connect it in Settings.',
  ],
  [
    /no contract template/i,
    'No contract template found. Create one in the contract templates section first.',
  ],
  [
    /contact person/i,
    'A contact person with name and email is required. Complete sponsor registration first.',
  ],
  [
    /conference title/i,
    'Conference title is missing. Update the conference settings.',
  ],
  [
    /empty document/i,
    'The generated PDF was empty. Check the template configuration.',
  ],
  [
    /upload.*failed/i,
    'Failed to upload the contract. Please check your connection and try again.',
  ],
  [
    /signing agreement/i,
    'Failed to create the signing agreement. The contract was generated but not sent for signing.',
  ],
]

function friendlyError(message: string): string {
  for (const [pattern, friendly] of ERROR_PATTERNS) {
    if (pattern.test(message)) return friendly
  }
  return message
}
