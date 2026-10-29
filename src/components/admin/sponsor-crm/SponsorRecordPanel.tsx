'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'
import type { Conference } from '@/lib/conference/types'
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'
import type { ContractSendOptions } from '@/components/admin/sponsor-crm/SponsorContractView'
import { SponsorSendModal } from '@/components/admin'
import {
  sponsorFromAddress,
  type SendableKind,
} from '@/components/admin/sponsor/SponsorSendModal'

export type RecordView = NonNullable<
  React.ComponentProps<typeof SponsorCRMForm>['initialView']
>
export const RECORD_VIEWS: RecordView[] = [
  'pipeline',
  'contacts',
  'logo',
  'history',
  'contract',
  'communications',
  'messages',
]

/** Every query a sponsor's page or board card reads. */
export function useRefreshSponsor() {
  const utils = api.useUtils()
  return useCallback(
    (id: string) => {
      utils.sponsor.crm.getById.invalidate({ id })
      utils.sponsor.crm.getOverview.invalidate({ id })
      utils.sponsor.crm.getContacts.invalidate({ id })
      utils.sponsor.crm.getContractDetails.invalidate({ id })
      utils.sponsor.crm.activities.list.invalidate({
        sponsorForConferenceId: id,
      })
      utils.sponsor.crm.list.invalidate()
      utils.sponsor.crm.healthViolations.invalidate()
    },
    [utils],
  )
}

/**
 * The side panel's URL state. The board uses `?sponsor=<id>&view=<tab>`;
 * the sponsor page has a fixed id and uses `?edit=<tab>` (its `?view=`
 * scrolls to a section). Opening pushes a history entry, so Back closes it.
 */
export function useSponsorRecordPanel({
  viewParam,
  idParam,
  fixedId,
}: {
  viewParam: string
  idParam?: string
  fixedId?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pushedRef = useRef(false)
  const rawView = searchParams.get(viewParam)
  const view = RECORD_VIEWS.includes(rawView as RecordView)
    ? (rawView as RecordView)
    : 'pipeline'
  const id = fixedId
    ? rawView
      ? fixedId
      : null
    : idParam
      ? searchParams.get(idParam)
      : null

  const replace = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      const qs = params.toString()
      router.replace(qs ? `?${qs}` : '?', { scroll: false })
    },
    [router, searchParams],
  )

  const open = useCallback(
    (sponsorId: string, tab: RecordView = 'pipeline') => {
      const params = new URLSearchParams(searchParams.toString())
      if (idParam) params.set(idParam, sponsorId)
      params.set(viewParam, tab)
      pushedRef.current = true
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams, idParam, viewParam],
  )

  const close = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false
      router.back()
    } else {
      replace({ [viewParam]: null, ...(idParam ? { [idParam]: null } : {}) })
    }
  }, [router, replace, viewParam, idParam])

  const setView = useCallback(
    (tab: RecordView) => replace({ [viewParam]: tab }),
    [replace, viewParam],
  )

  return { id, view, open, close, setView }
}

interface SponsorRecordPanelProps {
  sponsorId: string
  view: RecordView
  onViewChange: (view: RecordView) => void
  onClose: () => void
  /** After a save, a send or a close. */
  onChanged: () => void
  conference: Conference
  domain: string
  canSendDiscountCodes?: boolean
  workshopsEnabled?: boolean
  headerActions?: ReactNode
  /** Open this send on mount, e.g. the sponsor page's "Send Email". */
  initialSendKind?: SendableKind
}

/** The sponsor record side panel, shared by the board and the sponsor page. */
export function SponsorRecordPanel({
  sponsorId,
  view,
  onViewChange,
  onClose,
  onChanged,
  conference,
  domain,
  canSendDiscountCodes = false,
  workshopsEnabled = false,
  headerActions,
  initialSendKind,
}: SponsorRecordPanelProps) {
  const { data: session } = useSession()
  const { data: sponsor } = api.sponsor.crm.getById.useQuery({ id: sponsorId })
  const [sendKind, setSendKind] = useState<SendableKind | null>(
    initialSendKind ?? null,
  )
  const [contractSend, setContractSend] = useState<ContractSendOptions>({})

  if (!sponsor) return null

  return (
    <>
      <SponsorCRMForm
        key={sponsorId}
        presentation="panel"
        conferenceId={conference._id}
        workshopsEnabled={workshopsEnabled}
        sponsorStartSet={!!conference.workshopRegistrationSponsorStart}
        sponsor={sponsor}
        isOpen
        initialView={view}
        onViewChange={onViewChange}
        onClose={() => {
          onChanged()
          onClose()
        }}
        onSuccess={onChanged}
        onSendEmail={() => setSendKind('information')}
        onSendDiscountCodes={
          canSendDiscountCodes ? () => setSendKind('discount') : undefined
        }
        onSendRegistration={() => setSendKind('registration')}
        onSendContract={(options) => {
          setContractSend(options)
          setSendKind('contract')
        }}
        onSendEarlyAccess={() => setSendKind('workshop-early-access')}
        headerActions={headerActions}
      />
      {sendKind && (
        <SponsorSendModal
          // One mount per kind: each kind has its own draft.
          key={sendKind}
          isOpen
          onClose={() => {
            setSendKind(null)
            onChanged()
          }}
          onSent={onChanged}
          sponsorForConference={sponsor}
          kind={sendKind}
          contractSend={sendKind === 'contract' ? contractSend : undefined}
          domain={domain}
          fromEmail={sponsorFromAddress(conference, domain)}
          senderName={session?.speaker?.name || session?.user?.name || ''}
          conference={{
            title: conference.title || '',
            city: conference.city || '',
            country: conference.country || '',
            startDate: conference.startDate || '',
            organizer: conference.organizer,
            domains: conference.domains || [domain],
            socialLinks: conference.socialLinks,
            prospectusUrl: conference.sponsorshipCustomization?.prospectusUrl,
            sponsorRegistrationLink: conference.sponsorRegistrationLink,
            theme: conference.theme,
          }}
        />
      )}
    </>
  )
}
