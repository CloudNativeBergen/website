'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  TableContainer,
  TableHeader,
  Th,
  TableBody,
  Tr,
  Td,
  TableEmptyState,
} from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import {
  InvitationLetterForm,
  EMPTY_INVITATION_FORM,
  type InvitationLetterFormValues,
} from './InvitationLetterForm'
import { api } from '@/lib/trpc/client'
import { Conference } from '@/lib/conference/types'
import { PARTICIPANT_ROLE_LABELS } from '@/lib/invitation-letter/types'
import { formatDateSafe } from '@/lib/time'

/** Turns the base64 payload into a download without ever touching the disk. */
function downloadPdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  const url = URL.createObjectURL(
    new Blob([bytes], { type: 'application/pdf' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Delayed revoke: revoking synchronously can race the download start.
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

interface InvitationLettersPageClientProps {
  conference: Conference
}

export function InvitationLettersPageClient({
  conference,
}: InvitationLettersPageClientProps) {
  const [values, setValues] = useState<InvitationLetterFormValues>(
    EMPTY_INVITATION_FORM,
  )
  const [lastReference, setLastReference] = useState<string | null>(null)
  // Never put in form state: it must survive the reset that clears the
  // applicant fields, since the same organizer signs the next letter too.
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const { data: session } = useSession()
  const { showNotification } = useNotification()
  const utils = api.useUtils()

  const { data: letters = [], isLoading } = api.invitationLetter.list.useQuery()

  const issueMutation = api.invitationLetter.issue.useMutation({
    onSuccess: (result) => {
      // Driven by what the server returned, not by `values` — the form is
      // cleared below and could otherwise drift while the request is in
      // flight. The server withholds the PDF only when the email actually
      // went out, so its presence IS the instruction to download.
      if (result.pdfBase64) {
        downloadPdf(result.pdfBase64, result.filename)
      }
      setLastReference(result.reference)
      // Clear immediately: the passport fields should not sit in a browser tab
      // any longer than the request that used them.
      setValues(EMPTY_INVITATION_FORM)
      utils.invitationLetter.list.invalidate()

      if (result.emailError) {
        showNotification({
          type: 'warning',
          title: 'Letter issued, email failed',
          message: `${result.reference} was generated but could not be emailed (${result.emailError}). The PDF has been downloaded so you can forward it — nothing is stored, so keep it.`,
        })
        return
      }

      showNotification({
        type: 'success',
        title: 'Invitation letter issued',
        message: result.emailedTo
          ? `${result.reference} sent to ${result.emailedTo}.`
          : `${result.reference} downloaded.`,
      })
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Could not issue the letter',
        message: error.message,
      })
    },
  })

  const handleSubmit = () => {
    issueMutation.mutate({
      fullName: values.fullName,
      dateOfBirth: values.dateOfBirth,
      nationality: values.nationality,
      passportNumber: values.passportNumber,
      passportExpiry: values.passportExpiry || undefined,
      gender: values.gender || undefined,
      residentialAddress: values.residentialAddress || undefined,
      phone: values.phone || undefined,
      email: values.email || undefined,
      organization: values.organization || undefined,
      jobTitle: values.jobTitle || undefined,
      role: values.role,
      registrationReference: values.registrationReference || undefined,
      arrivalDate: values.arrivalDate || undefined,
      departureDate: values.departureDate || undefined,
      addressedTo: values.addressedTo || undefined,
      costCoverage: values.costCoverage,
      additionalNotes: values.additionalNotes || undefined,
      signatoryTitle: values.signatoryTitle || undefined,
      signatureDataUrl: signatureDataUrl ?? undefined,
      delivery: values.delivery,
    })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<DocumentTextIcon />}
        title="Invitation Letters"
        description="Issue visa invitation letters for participants of"
        contextHighlight={conference.title}
        stats={[
          { value: letters.length, label: 'Letters issued', color: 'slate' },
          {
            value: letters.filter((letter) => letter.emailedTo).length,
            label: 'Sent by email',
            color: 'blue',
          },
        ]}
        backLink={{ href: '/admin', label: 'Back to Dashboard' }}
      />

      {lastReference && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-200">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Last letter issued with reference <strong>{lastReference}</strong>.
            The applicant&apos;s details have been cleared from this form.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <InvitationLetterForm
          values={values}
          onChange={setValues}
          onSubmit={handleSubmit}
          isSubmitting={issueMutation.isPending}
          organizer={
            session?.speaker?._id
              ? { id: session.speaker._id, name: session.speaker.name }
              : undefined
          }
          onSignatureChange={setSignatureDataUrl}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
          Issue log
        </h2>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        ) : letters.length === 0 ? (
          <TableEmptyState
            icon={DocumentTextIcon}
            title="No letters issued yet"
            description="Letters you issue will be listed here with their reference, so you can confirm what was sent and to whom."
            className="rounded-lg bg-gray-50 p-8 dark:bg-gray-800"
          />
        ) : (
          <TableContainer>
            <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
              <TableHeader>
                <tr>
                  <Th>Reference</Th>
                  <Th>Recipient</Th>
                  <Th hiddenBelow="sm">Role</Th>
                  <Th>Issued</Th>
                  <Th hiddenBelow="md">Issued by</Th>
                  <Th>Delivery</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {letters.map((letter) => (
                  <Tr key={letter._id}>
                    <Td>
                      <span className="font-mono text-xs text-gray-900 dark:text-white">
                        {letter.reference}
                      </span>
                    </Td>
                    <Td>
                      <div className="text-sm text-gray-900 dark:text-white">
                        {letter.recipientName}
                      </div>
                      {letter.recipientEmail && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {letter.recipientEmail}
                        </div>
                      )}
                    </Td>
                    <Td hiddenBelow="sm">
                      <span className="text-sm text-gray-500 capitalize dark:text-gray-400">
                        {PARTICIPANT_ROLE_LABELS[letter.participantRole] ??
                          letter.participantRole}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDateSafe(letter.issuedAt)}
                      </span>
                    </Td>
                    <Td hiddenBelow="md">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {letter.issuedBy?.name ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      {letter.emailedTo ? (
                        <StatusBadge label="Emailed" color="green" />
                      ) : (
                        <StatusBadge label="Downloaded" color="gray" />
                      )}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </table>
          </TableContainer>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The log records that a letter was issued — not what it contained. To
          re-issue, fill the form in again from the applicant&apos;s original
          message.
        </p>
      </div>
    </div>
  )
}
