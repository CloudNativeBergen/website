'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '@/lib/trpc/client'
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { SignaturePadCanvas } from './SignaturePadCanvas'

type Step = 'review' | 'sign' | 'complete'

function LoadingState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 size-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700 dark:border-blue-800 dark:border-t-blue-400" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Loading contract&hellip;
        </p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <ExclamationTriangleIcon className="mx-auto mb-4 size-12 text-red-400" />
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          Unable to Load Contract
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
      </div>
    </div>
  )
}

function AlreadySignedState({
  sponsorName,
  conferenceName,
}: {
  sponsorName?: string
  conferenceName?: string
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <CheckCircleIcon className="mx-auto mb-4 size-16 text-emerald-500" />
        <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-white">
          Contract Already Signed
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          The sponsorship agreement
          {sponsorName && ` for ${sponsorName}`}
          {conferenceName && ` at ${conferenceName}`} has already been signed.
        </p>
      </div>
    </div>
  )
}

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const steps: { key: Step; label: string; icon: typeof DocumentTextIcon }[] = [
    { key: 'review', label: 'Review', icon: DocumentTextIcon },
    { key: 'sign', label: 'Sign', icon: PencilIcon },
    { key: 'complete', label: 'Complete', icon: CheckCircleIcon },
  ]

  const stepIndex = steps.findIndex((s) => s.key === currentStep)

  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center justify-center space-x-8">
        {steps.map((step, index) => {
          const isActive = index === stepIndex
          const isCompleted = index < stepIndex
          const Icon = step.icon

          return (
            <li key={step.key} className="flex items-center space-x-2">
              <span
                className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                  isCompleted
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}
              >
                {isCompleted ? (
                  <CheckCircleIcon className="size-5" />
                ) : (
                  <Icon className="size-4" />
                )}
              </span>
              <span
                className={`text-sm font-medium ${
                  isActive
                    ? 'text-blue-700 dark:text-blue-400'
                    : isCompleted
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <div
                  className={`ml-4 h-px w-12 ${
                    isCompleted
                      ? 'bg-emerald-400'
                      : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface ContractDetailsProps {
  sponsorName?: string
  conferenceName?: string
  conferenceCity?: string
  conferenceStartDate?: string
  organizer?: string
  tierName?: string
  contractValue?: number
  contractCurrency?: string
  contractPdfUrl?: string
}

function ContractReviewStep({
  details,
  onProceed,
}: {
  details: ContractDetailsProps
  onProceed: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Sponsorship Agreement
        </h2>

        <dl className="space-y-3 text-sm">
          {details.conferenceName && (
            <div className="flex justify-between">
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Event
              </dt>
              <dd className="text-slate-900 dark:text-white">
                {details.conferenceName}
              </dd>
            </div>
          )}
          {details.organizer && (
            <div className="flex justify-between">
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Organizer
              </dt>
              <dd className="text-slate-900 dark:text-white">
                {details.organizer}
              </dd>
            </div>
          )}
          {details.sponsorName && (
            <div className="flex justify-between">
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Sponsor
              </dt>
              <dd className="text-slate-900 dark:text-white">
                {details.sponsorName}
              </dd>
            </div>
          )}
          {details.tierName && (
            <div className="flex justify-between">
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Tier
              </dt>
              <dd className="text-slate-900 dark:text-white">
                {details.tierName}
              </dd>
            </div>
          )}
          {details.contractValue && (
            <div className="flex justify-between">
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Contract Value
              </dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {details.contractValue.toLocaleString()}{' '}
                {details.contractCurrency || 'NOK'}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {details.contractPdfUrl && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-700">
            <div className="flex items-center space-x-2">
              <DocumentTextIcon className="size-5 text-slate-400" />
              <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                Contract Document
              </h3>
            </div>
            <a
              href={details.contractPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Open in new tab
            </a>
          </div>
          <div className="bg-slate-50 p-1 dark:bg-slate-900">
            <iframe
              src={`${details.contractPdfUrl}#toolbar=0`}
              className="h-125 w-full rounded border border-slate-200 dark:border-slate-700"
              title="Contract PDF"
            />
          </div>
        </div>
      )}

      <div className="flex items-start space-x-3 rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-800 dark:text-blue-300">
          By proceeding, you confirm that you have reviewed the agreement above
          and are authorized to sign on behalf of{' '}
          <strong>{details.sponsorName || 'your organization'}</strong>.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onProceed}
          className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus-visible:outline-none"
        >
          Proceed to Sign
        </button>
      </div>
    </div>
  )
}

function ContractSignStep({
  signerEmail,
  onSubmit,
  isSubmitting,
}: {
  signerEmail?: string
  onSubmit: (signatureDataUrl: string, signerName: string) => void
  isSubmitting: boolean
}) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [signerName, setSignerName] = useState('')
  const [agreed, setAgreed] = useState(false)

  const canSubmit =
    signatureDataUrl && signerName.trim().length > 0 && agreed && !isSubmitting

  const handleSubmit = () => {
    if (canSubmit && signatureDataUrl) {
      onSubmit(signatureDataUrl, signerName.trim())
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">
          Sign the Agreement
        </h2>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Please provide your name and signature below. Fields marked with{' '}
          <span className="text-red-500">*</span> are required.
        </p>

        <div className="space-y-5">
          <div>
            <label
              htmlFor="signer-name"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="signer-name"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              disabled={isSubmitting}
              placeholder="Enter your full legal name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          {signerEmail && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {signerEmail}
              </p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Signature <span className="text-red-500">*</span>
            </label>
            <SignaturePadCanvas
              onSignatureChange={setSignatureDataUrl}
              disabled={isSubmitting}
            />
          </div>

          <label className="flex items-start space-x-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={isSubmitting}
              className="mt-0.5 size-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              I confirm that I have read and agree to the terms of the
              sponsorship agreement and that my electronic signature above is
              legally binding.
            </span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center space-x-2">
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>Submitting&hellip;</span>
            </span>
          ) : (
            'Submit Signature'
          )}
        </button>
      </div>
    </div>
  )
}

interface CompletionData {
  sponsorName?: string
  conferenceName?: string
  conferenceCity?: string
  organizer?: string
  tierName?: string
  contractValue?: number
  contractCurrency?: string
  signerName?: string
  signerEmail?: string
  signedAt?: string
  contractPdfUrl?: string
}

function CompletionStep({ data }: { data: CompletionData }) {
  const formattedDate = data.signedAt
    ? new Date(data.signedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : undefined

  return (
    <div className="space-y-6">
      {/* Success banner */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
          <CheckCircleIcon className="size-10 text-emerald-500" />
        </div>
        <h2 className="mb-1 text-xl font-semibold text-slate-900 dark:text-white">
          Agreement Signed Successfully
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          The sponsorship agreement has been signed and recorded.
        </p>
      </div>

      {/* Signature details card */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-4 text-sm font-semibold text-slate-500 uppercase dark:text-slate-400">
          Signature Details
        </h3>
        <dl className="space-y-3 text-sm">
          {data.signerName && (
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Signed by</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {data.signerName}
              </dd>
            </div>
          )}
          {data.signerEmail && (
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {data.signerEmail}
              </dd>
            </div>
          )}
          {formattedDate && (
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Date</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {formattedDate}
              </dd>
            </div>
          )}
          {data.sponsorName && (
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">
                Organization
              </dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {data.sponsorName}
              </dd>
            </div>
          )}
          {data.conferenceName && (
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Event</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {data.conferenceName}
              </dd>
            </div>
          )}
          {data.tierName && (
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">
                Partnership Level
              </dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {data.tierName}
              </dd>
            </div>
          )}
          {data.contractValue != null && (
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">
                Contract Value
              </dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {data.contractValue.toLocaleString()}{' '}
                {data.contractCurrency || 'NOK'}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Download button */}
      {data.contractPdfUrl && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <DocumentTextIcon className="size-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Signed Agreement
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  PDF document with your signature
                </p>
              </div>
            </div>
            <a
              href={data.contractPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus-visible:outline-none"
            >
              <ArrowDownTrayIcon className="size-4" />
              <span>Download</span>
            </a>
          </div>
        </div>
      )}

      {/* Email confirmation notice */}
      <div className="flex items-start space-x-3 rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <EnvelopeIcon className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-800 dark:text-blue-300">
          A confirmation email with a copy of the signed agreement will be sent
          to <strong>{data.signerEmail || 'the designated signer'}</strong>{' '}
          shortly.
        </p>
      </div>

      {/* Secure badge */}
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
          <ShieldCheckIcon className="size-4" />
          <span>Your signature has been securely recorded</span>
        </div>
      </div>
    </div>
  )
}

export function ContractSigningPage({
  token,
  initialStep = 'review',
}: {
  token: string
  initialStep?: Step
}) {
  const [step, setStep] = useState<Step>(initialStep)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [completionData, setCompletionData] = useState<CompletionData | null>(
    null,
  )

  const {
    data: contract,
    isLoading,
    error: fetchError,
  } = api.signing.getContract.useQuery({ token })

  const submitMutation = api.signing.submitSignature.useMutation({
    onSuccess: (data) => {
      setCompletionData({
        sponsorName: data.sponsorName ?? undefined,
        conferenceName: data.conferenceName ?? undefined,
        conferenceCity: data.conferenceCity ?? undefined,
        organizer: data.organizer ?? undefined,
        tierName: data.tierName ?? undefined,
        contractValue: data.contractValue ?? undefined,
        contractCurrency: data.contractCurrency ?? undefined,
        signerName: data.signerName ?? undefined,
        signerEmail: data.signerEmail ?? undefined,
        signedAt: data.signedAt ?? undefined,
        contractPdfUrl:
          contract && 'contractPdfUrl' in contract
            ? (contract.contractPdfUrl ?? undefined)
            : undefined,
      })
      setStep('complete')
    },
    onError: (error) => {
      setSubmitError(error.message)
    },
  })

  const mutateRef = useRef(submitMutation.mutate)
  useEffect(() => {
    mutateRef.current = submitMutation.mutate
  }, [submitMutation.mutate])

  const handleSignatureSubmit = useCallback(
    (signatureDataUrl: string, signerName: string) => {
      setSubmitError(null)
      mutateRef.current({
        token,
        signatureDataUrl,
        signerName,
      })
    },
    [token],
  )

  if (isLoading) return <LoadingState />

  if (fetchError) {
    return <ErrorState message={fetchError.message} />
  }

  if (!contract) {
    return <ErrorState message="Contract not found." />
  }

  if (contract.status === 'signed') {
    return (
      <AlreadySignedState
        sponsorName={contract.sponsorName ?? undefined}
        conferenceName={contract.conferenceName ?? undefined}
      />
    )
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Sponsorship Agreement
        </h1>
        {contract.conferenceName && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {contract.conferenceName}
          </p>
        )}
      </div>

      <StepIndicator currentStep={step} />

      {submitError && (
        <div className="mb-6 flex items-start space-x-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Signature submission failed
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {submitError}
            </p>
          </div>
        </div>
      )}

      {step === 'review' && (
        <ContractReviewStep
          details={{
            sponsorName: contract.sponsorName ?? undefined,
            conferenceName: contract.conferenceName ?? undefined,
            conferenceCity: contract.conferenceCity ?? undefined,
            conferenceStartDate: contract.conferenceStartDate ?? undefined,
            organizer: contract.organizer ?? undefined,
            tierName: contract.tierName ?? undefined,
            contractValue: contract.contractValue ?? undefined,
            contractCurrency: contract.contractCurrency ?? undefined,
            contractPdfUrl: contract.contractPdfUrl ?? undefined,
          }}
          onProceed={() => setStep('sign')}
        />
      )}

      {step === 'sign' && (
        <ContractSignStep
          signerEmail={contract.signerEmail ?? undefined}
          onSubmit={handleSignatureSubmit}
          isSubmitting={submitMutation.isPending}
        />
      )}

      {step === 'complete' && (
        <CompletionStep
          data={
            completionData ?? {
              sponsorName: contract.sponsorName ?? undefined,
              conferenceName: contract.conferenceName ?? undefined,
              conferenceCity: contract.conferenceCity ?? undefined,
              organizer: contract.organizer ?? undefined,
              tierName: contract.tierName ?? undefined,
              contractValue: contract.contractValue ?? undefined,
              contractCurrency: contract.contractCurrency ?? undefined,
              signerEmail: contract.signerEmail ?? undefined,
              contractPdfUrl: contract.contractPdfUrl ?? undefined,
            }
          }
        />
      )}
    </div>
  )
}
