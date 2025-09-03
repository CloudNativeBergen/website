import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'
import { AppEnvironment } from '@/lib/environment/config'
import { Flags } from '@/lib/speaker/types'
import type {
  TravelExpenseInput,
  BankingDetails,
  TravelSupportWithExpenses,
} from '@/lib/travel-support/types'

interface UseTravelSupportOptions {
  onSuccess?: () => void
  onError?: (message: string) => void
}

interface UseTravelSupportReturn {
  // Data
  travelSupport: TravelSupportWithExpenses | null | undefined
  isLoading: boolean
  error: string | null
  isEligible: boolean
  canEdit: boolean

  // State management
  showBankingForm: boolean
  showExpenseForm: boolean
  editingExpense: (TravelExpenseInput & { _id?: string }) | null

  // State setters
  setShowBankingForm: (show: boolean) => void
  setShowExpenseForm: (show: boolean) => void
  setEditingExpense: (
    expense: (TravelExpenseInput & { _id?: string }) | null,
  ) => void

  // Operations
  createTravelSupport: () => Promise<void>
  updateBankingDetails: (details: BankingDetails) => Promise<void>
  addExpense: (expense: TravelExpenseInput) => Promise<void>
  updateExpense: (
    expenseId: string,
    expense: TravelExpenseInput,
  ) => Promise<void>
  deleteExpense: (expenseId: string) => Promise<void>
  deleteReceipt: (expenseId: string, receiptIndex: number) => Promise<void>
  submitTravelSupport: () => Promise<void>

  // Loading states
  isCreating: boolean
  isUpdatingBanking: boolean
  isAddingExpense: boolean
  isUpdatingExpense: boolean
  isDeletingExpense: boolean
  isDeletingReceipt: boolean
  isSubmitting: boolean

  // Error states
  createError: string | null
  bankingError: string | null
  expenseError: string | null
  submitError: string | null
}

/**
 * Comprehensive hook for managing travel support operations
 * Encapsulates all business logic and state management
 */
export function useTravelSupport(
  options: UseTravelSupportOptions = {},
): UseTravelSupportReturn {
  const { onSuccess, onError } = options
  const { data: session } = useSession()

  // Local state for UI
  const [showBankingForm, setShowBankingForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<
    (TravelExpenseInput & { _id?: string }) | null
  >(null)

  // Data
  const {
    data: travelSupport,
    isLoading,
    error: queryError,
    refetch,
  } = api.travelSupport.getMine.useQuery()

  // Eligibility check
  const isEligible = Boolean(
    session?.speaker?.flags?.includes(Flags.requiresTravelFunding) ||
      (AppEnvironment.isTestMode && session?.speaker),
  )

  // Permission check
  const canEdit = travelSupport?.status === 'draft'

  // Mutations with consistent error handling
  const createMutation = api.travelSupport.create.useMutation({
    onSuccess: () => {
      refetch()
      onSuccess?.()
    },
    onError: (error) => {
      onError?.(error.message)
    },
  })

  const updateBankingMutation =
    api.travelSupport.updateBankingDetails.useMutation({
      onSuccess: () => {
        refetch()
        setShowBankingForm(false)
        onSuccess?.()
      },
      onError: (error) => {
        onError?.(error.message)
      },
    })

  const addExpenseMutation = api.travelSupport.addExpense.useMutation({
    onSuccess: () => {
      refetch()
      setShowExpenseForm(false)
      onSuccess?.()
    },
    onError: (error) => {
      onError?.(error.message)
    },
  })

  const updateExpenseMutation = api.travelSupport.updateExpense.useMutation({
    onSuccess: () => {
      refetch()
      setEditingExpense(null)
      setShowExpenseForm(false)
      onSuccess?.()
    },
    onError: (error) => {
      onError?.(error.message)
    },
  })

  const deleteExpenseMutation = api.travelSupport.deleteExpense.useMutation({
    onSuccess: () => {
      refetch()
      onSuccess?.()
    },
    onError: (error) => {
      onError?.(error.message)
    },
  })

  const deleteReceiptMutation = api.travelSupport.deleteReceipt.useMutation({
    onSuccess: () => {
      refetch()
      onSuccess?.()
    },
    onError: (error) => {
      onError?.(error.message)
    },
  })

  const submitMutation = api.travelSupport.submit.useMutation({
    onSuccess: () => {
      refetch()
      onSuccess?.()
    },
    onError: (error) => {
      onError?.(error.message)
    },
  })

  // Operation handlers with validation
  const createTravelSupport = async (): Promise<void> => {
    if (!session?.speaker?._id) {
      throw new Error('No speaker session available')
    }

    await createMutation.mutateAsync({
      speaker: { _ref: session.speaker._id, _type: 'reference' },
      bankingDetails: {
        beneficiaryName: '',
        bankName: '',
        swiftCode: '',
        country: '',
        preferredCurrency: 'NOK',
      },
    })
  }

  const updateBankingDetails = async (
    bankingDetails: BankingDetails,
  ): Promise<void> => {
    if (!travelSupport?._id) {
      throw new Error('No travel support found')
    }

    await updateBankingMutation.mutateAsync({
      travelSupportId: travelSupport._id,
      bankingDetails,
    })
  }

  const addExpense = async (expense: TravelExpenseInput): Promise<void> => {
    if (!travelSupport?._id) {
      throw new Error('No travel support found')
    }

    await addExpenseMutation.mutateAsync({
      travelSupportId: travelSupport._id,
      expense,
    })
  }

  const updateExpense = async (
    expenseId: string,
    expense: TravelExpenseInput,
  ): Promise<void> => {
    await updateExpenseMutation.mutateAsync({
      expenseId,
      expense,
    })
  }

  const deleteExpense = async (expenseId: string): Promise<void> => {
    await deleteExpenseMutation.mutateAsync({ expenseId })
  }

  const deleteReceipt = async (
    expenseId: string,
    receiptIndex: number,
  ): Promise<void> => {
    await deleteReceiptMutation.mutateAsync({ expenseId, receiptIndex })
  }

  const submitTravelSupport = async (): Promise<void> => {
    if (!travelSupport?._id) {
      throw new Error('No travel support found')
    }

    // Validation before submission
    if (!travelSupport.bankingDetails.beneficiaryName) {
      throw new Error('Banking details are required before submission')
    }

    if (!travelSupport.expenses || travelSupport.expenses.length === 0) {
      throw new Error('At least one expense is required before submission')
    }

    await submitMutation.mutateAsync({
      travelSupportId: travelSupport._id,
    })
  }

  return {
    // Data
    travelSupport,
    isLoading,
    error: queryError?.message || null,
    isEligible,
    canEdit,

    // State management
    showBankingForm,
    showExpenseForm,
    editingExpense,
    setShowBankingForm,
    setShowExpenseForm,
    setEditingExpense,

    // Operations
    createTravelSupport,
    updateBankingDetails,
    addExpense,
    updateExpense,
    deleteExpense,
    deleteReceipt,
    submitTravelSupport,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdatingBanking: updateBankingMutation.isPending,
    isAddingExpense: addExpenseMutation.isPending,
    isUpdatingExpense: updateExpenseMutation.isPending,
    isDeletingExpense: deleteExpenseMutation.isPending,
    isDeletingReceipt: deleteReceiptMutation.isPending,
    isSubmitting: submitMutation.isPending,

    // Error states
    createError: createMutation.error?.message || null,
    bankingError: updateBankingMutation.error?.message || null,
    expenseError:
      addExpenseMutation.error?.message ||
      updateExpenseMutation.error?.message ||
      null,
    submitError: submitMutation.error?.message || null,
  }
}
