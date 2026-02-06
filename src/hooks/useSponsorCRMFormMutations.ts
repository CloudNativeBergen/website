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
  logo_bright: string | null
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
  onClose: () => void
}

export function useSponsorCRMFormMutations({
  conferenceId,
  sponsor,
  isOpen,
  onSuccess,
  onClose,
}: UseSponsorCRMFormMutationsOptions) {
  const { showNotification } = useNotification()
  const utils = api.useUtils()

  const handleSuccess = () => {
    onSuccess()
    onClose()
  }

  const createMutation = api.sponsor.crm.create.useMutation({
    onSuccess: async () => {
      await utils.sponsor.crm.list.invalidate()
      showNotification({
        title: 'Success',
        message: 'Sponsor added to pipeline',
        type: 'success',
      })
      handleSuccess()
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
      handleSuccess()
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

  useEffect(() => {
    if (isOpen) {
      createMutation.reset()
      updateMutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleSubmit = async (formData: SponsorCRMFormData) => {
    if (sponsor) {
      if (
        formData.website !== sponsor.sponsor.website ||
        formData.logo !== sponsor.sponsor.logo ||
        formData.logo_bright !== sponsor.sponsor.logo_bright ||
        formData.name !== sponsor.sponsor.name
      ) {
        await updateGlobalSponsorMutation.mutateAsync({
          id: sponsor.sponsor._id,
          data: {
            name: formData.name,
            website: formData.website,
            logo: formData.logo || null,
            logo_bright: formData.logo_bright || null,
          },
        })
      }

      await updateMutation.mutateAsync({
        id: sponsor._id,
        tier: formData.tierId || undefined,
        addons: formData.addonIds,
        contract_status: formData.contractStatus,
        status: formData.status,
        invoice_status: formData.invoiceStatus,
        contract_value: formData.contractValue
          ? parseFloat(formData.contractValue)
          : undefined,
        contract_currency: formData.contractCurrency,
        notes: formData.notes || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        assigned_to: formData.assignedTo || null,
      })
    } else {
      await createMutation.mutateAsync({
        sponsor: formData.sponsorId,
        conference: conferenceId,
        tier: formData.tierId || undefined,
        addons: formData.addonIds.length > 0 ? formData.addonIds : undefined,
        contract_status: formData.contractStatus,
        status: formData.status,
        invoice_status: formData.invoiceStatus,
        contract_value: formData.contractValue
          ? parseFloat(formData.contractValue)
          : undefined,
        contract_currency: formData.contractCurrency,
        notes: formData.notes || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        assigned_to: formData.assignedTo || undefined,
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
