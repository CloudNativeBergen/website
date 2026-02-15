import { useEffect } from 'react'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import type {
  SponsorForConferenceExpanded,
  SponsorStatus,
  InvoiceStatus,
  ContractStatus,
  SponsorTag,
} from '@/lib/sponsor-crm/types'

export interface SponsorCRMFormData {
  sponsorId: string
  name: string
  website: string
  logo: string | null
  logoBright: string | null
  orgNumber: string
  address: string
  tierId: string
  addonIds: string[]
  contractStatus: ContractStatus
  status: SponsorStatus
  invoiceStatus: InvoiceStatus
  contractValue: string
  contractCurrency: 'NOK' | 'USD' | 'EUR' | 'GBP'
  notes: string
  tags: SponsorTag[]
  assignedTo: string
}

interface UseSponsorCRMFormMutationsOptions {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded | null
  isOpen: boolean
  onSuccess: () => void
}

export function useSponsorCRMFormMutations({
  conferenceId,
  sponsor,
  isOpen,
  onSuccess,
}: UseSponsorCRMFormMutationsOptions) {
  const { showNotification } = useNotification()
  const utils = api.useUtils()

  const createMutation = api.sponsor.crm.create.useMutation({
    onSuccess: async () => {
      await utils.sponsor.crm.list.invalidate()
      showNotification({
        title: 'Success',
        message: 'Sponsor added to pipeline',
        type: 'success',
      })
      onSuccess()
    },
    onError: (error) => {
      showNotification({
        title: 'Error',
        message: error.message || 'Failed to add sponsor',
        type: 'error',
      })
    },
  })

  const updateMutation = api.sponsor.crm.update.useMutation({
    onSuccess: async () => {
      await utils.sponsor.crm.list.invalidate()
      showNotification({
        title: 'Success',
        message: 'Sponsor updated successfully',
        type: 'success',
      })
      onSuccess()
    },
    onError: (error) => {
      showNotification({
        title: 'Error',
        message: error.message || 'Failed to update sponsor',
        type: 'error',
      })
    },
  })

  const updateGlobalSponsorMutation = api.sponsor.update.useMutation({
    onSuccess: () => {
      utils.sponsor.list.invalidate()
    },
  })

  const resetCreate = createMutation.reset
  const resetUpdate = updateMutation.reset
  const resetGlobal = updateGlobalSponsorMutation.reset

  useEffect(() => {
    if (isOpen) {
      resetCreate()
      resetUpdate()
      resetGlobal()
    }
  }, [isOpen, resetCreate, resetUpdate, resetGlobal])

  const handleSubmit = async (formData: SponsorCRMFormData) => {
    if (sponsor) {
      if (
        formData.website !== sponsor.sponsor.website ||
        formData.logo !== sponsor.sponsor.logo ||
        formData.logoBright !== sponsor.sponsor.logoBright ||
        formData.name !== sponsor.sponsor.name ||
        formData.orgNumber !== (sponsor.sponsor.orgNumber || '') ||
        formData.address !== (sponsor.sponsor.address || '')
      ) {
        await updateGlobalSponsorMutation.mutateAsync({
          id: sponsor.sponsor._id,
          data: {
            name: formData.name,
            website: formData.website,
            logo: formData.logo || null,
            logoBright: formData.logoBright || null,
            orgNumber: formData.orgNumber || undefined,
            address: formData.address || undefined,
          },
        })
      }

      await updateMutation.mutateAsync({
        id: sponsor._id,
        tier: formData.tierId || undefined,
        addons: formData.addonIds,
        contractStatus: formData.contractStatus,
        status: formData.status,
        invoiceStatus: formData.invoiceStatus,
        contractValue: formData.contractValue
          ? parseFloat(formData.contractValue)
          : undefined,
        contractCurrency: formData.contractCurrency,
        notes: formData.notes || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        assignedTo: formData.assignedTo || null,
      })
    } else {
      await createMutation.mutateAsync({
        sponsor: formData.sponsorId,
        conference: conferenceId,
        tier: formData.tierId || undefined,
        addons: formData.addonIds.length > 0 ? formData.addonIds : undefined,
        contractStatus: formData.contractStatus,
        status: formData.status,
        invoiceStatus: formData.invoiceStatus,
        contractValue: formData.contractValue
          ? parseFloat(formData.contractValue)
          : undefined,
        contractCurrency: formData.contractCurrency,
        notes: formData.notes || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        assignedTo: formData.assignedTo || undefined,
      })
    }
  }

  return {
    handleSubmit,
    isPending:
      createMutation.isPending ||
      updateMutation.isPending ||
      updateGlobalSponsorMutation.isPending,
  }
}
