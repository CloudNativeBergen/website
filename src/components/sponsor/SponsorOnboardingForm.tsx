'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { CONTACT_ROLE_OPTIONS } from '@/lib/sponsor/types'

interface ContactPersonForm {
  name: string
  email: string
  phone: string
  role: string
  isPrimary: boolean
}

interface BillingForm {
  email: string
  reference: string
  comments: string
}

interface CompanyForm {
  orgNumber: string
  address: string
}

export function SponsorOnboardingForm({ token }: { token: string }) {
  const {
    data: sponsor,
    isLoading,
    error: fetchError,
  } = api.onboarding.validate.useQuery({ token })

  const completeMutation = api.onboarding.complete.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (error) => setError(error.message),
  })

  const [contacts, setContacts] = useState<ContactPersonForm[]>([
    { name: '', email: '', phone: '', role: '', isPrimary: true },
  ])
  const [billing, setBilling] = useState<BillingForm>({
    email: '',
    reference: '',
    comments: '',
  })
  const [company, setCompany] = useState<CompanyForm>({
    orgNumber: '',
    address: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [initialized, setInitialized] = useState(false)

  if (sponsor && !initialized) {
    if (sponsor.contactPersons?.length) {
      setContacts(
        sponsor.contactPersons.map((c) => ({
          name: c.name,
          email: c.email,
          phone: String(c.phone || ''),
          role: String(c.role || ''),
          isPrimary: Boolean(c.isPrimary),
        })),
      )
    }
    if (sponsor.billing) {
      setBilling({
        email: sponsor.billing.email,
        reference: sponsor.billing.reference || '',
        comments: sponsor.billing.comments || '',
      })
    }
    setCompany({
      orgNumber: sponsor.sponsorOrgNumber || '',
      address: sponsor.sponsorAddress || '',
    })
    setInitialized(true)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <div className="text-center">
          <div className="border-oslo-blue mx-auto h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="mt-4 text-gray-600">Loading onboarding form&hellip;</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h2 className="mt-4 text-xl font-semibold text-red-800">
          Invalid Onboarding Link
        </h2>
        <p className="mt-2 text-red-600">
          This onboarding link is invalid or has expired. Please contact the
          event organizers for a new link.
        </p>
      </div>
    )
  }

  if (submitted || sponsor?.onboardingComplete) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
        <h2 className="mt-4 text-xl font-semibold text-green-800">
          Onboarding Complete
        </h2>
        <p className="mt-2 text-green-600">
          Thank you for completing the sponsor onboarding for{' '}
          <strong>{sponsor?.conferenceName}</strong>. The event organizers will
          be in touch with next steps.
        </p>
      </div>
    )
  }

  const addContact = () => {
    setContacts([
      ...contacts,
      { name: '', email: '', phone: '', role: '', isPrimary: false },
    ])
  }

  const removeContact = (index: number) => {
    if (contacts.length <= 1) return
    const updated = contacts.filter((_, i) => i !== index)
    if (!updated.some((c) => c.isPrimary) && updated.length > 0) {
      updated[0].isPrimary = true
    }
    setContacts(updated)
  }

  const updateContact = (
    index: number,
    field: keyof ContactPersonForm,
    value: string | boolean,
  ) => {
    const updated = [...contacts]
    if (field === 'isPrimary' && value === true) {
      updated.forEach((c) => (c.isPrimary = false))
    }
    updated[index] = { ...updated[index], [field]: value }
    setContacts(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const hasAtLeastOneContact = contacts.some(
      (c) => c.name.trim() && c.email.trim(),
    )
    if (!hasAtLeastOneContact) {
      setError(
        'Please provide at least one contact person with name and email.',
      )
      return
    }

    if (!billing.email.trim()) {
      setError('Please provide a billing email address.')
      return
    }

    const validContacts = contacts
      .filter((c) => c.name.trim() && c.email.trim())
      .map((c) => ({
        _key: '',
        name: c.name.trim(),
        email: c.email.trim(),
        phone: c.phone.trim() || undefined,
        role: c.role || undefined,
        isPrimary: c.isPrimary,
      }))

    completeMutation.mutate({
      token,
      contactPersons: validContacts,
      billing: {
        email: billing.email.trim(),
        reference: billing.reference.trim() || undefined,
        comments: billing.comments.trim() || undefined,
      },
      orgNumber: company.orgNumber.trim() || undefined,
      address: company.address.trim() || undefined,
    })
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sponsor Onboarding</h1>
        <p className="mt-2 text-lg text-gray-600">
          Welcome, <strong>{sponsor?.sponsorName}</strong>! Please complete the
          form below to finalize your sponsorship for{' '}
          <strong>{sponsor?.conferenceName}</strong>
          {sponsor?.tierTitle && (
            <>
              {' '}
              as a <strong>{sponsor.tierTitle}</strong> sponsor
            </>
          )}
          .
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
              <p className="ml-3 text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Company Information
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Provide your company&apos;s registration details for the sponsorship
            contract.
          </p>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Organization Number
                </label>
                <input
                  type="text"
                  value={company.orgNumber}
                  onChange={(e) =>
                    setCompany({ ...company, orgNumber: e.target.value })
                  }
                  placeholder="e.g. 123 456 789"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Company Address
                </label>
                <input
                  type="text"
                  value={company.address}
                  onChange={(e) =>
                    setCompany({ ...company, address: e.target.value })
                  }
                  placeholder="Street, City, Country"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Contact Persons
            </h2>
            <button
              type="button"
              onClick={addContact}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              <PlusIcon className="h-4 w-4" />
              Add Contact
            </button>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Provide contact details for people involved in the sponsorship. Mark
            one person as the primary contact.
          </p>

          <div className="space-y-4">
            {contacts.map((contact, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      Contact {index + 1}
                    </span>
                    {contact.isPrimary && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!contact.isPrimary && (
                      <button
                        type="button"
                        onClick={() => updateContact(index, 'isPrimary', true)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Set as primary
                      </button>
                    )}
                    {contacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContact(index)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) =>
                        updateContact(index, 'name', e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) =>
                        updateContact(index, 'email', e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) =>
                        updateContact(index, 'phone', e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Role
                    </label>
                    <select
                      value={contact.role}
                      onChange={(e) =>
                        updateContact(index, 'role', e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="">Select role&hellip;</option>
                      {CONTACT_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Billing Information
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Provide billing details for invoicing purposes.
          </p>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Billing Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={billing.email}
                  onChange={(e) =>
                    setBilling({ ...billing, email: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Invoice Reference
                </label>
                <input
                  type="text"
                  value={billing.reference}
                  onChange={(e) =>
                    setBilling({ ...billing, reference: e.target.value })
                  }
                  placeholder="PO number, cost center, etc."
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Comments
                </label>
                <input
                  type="text"
                  value={billing.comments}
                  onChange={(e) =>
                    setBilling({ ...billing, comments: e.target.value })
                  }
                  placeholder="Special billing instructions"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end border-t border-gray-200 pt-6">
          <button
            type="submit"
            disabled={completeMutation.isPending}
            className="inline-flex items-center rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
          >
            {completeMutation.isPending
              ? 'Submitting\u2026'
              : 'Complete Onboarding'}
          </button>
        </div>
      </form>
    </div>
  )
}
