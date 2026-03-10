'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '@/lib/trpc/client'
import {
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { SponsorContactRoleSelect } from '@/components/admin/sponsor/SponsorContactRoleSelect'
import { SponsorRegistrationLogoUpload } from '@/components/sponsor/SponsorRegistrationLogoUpload'
import { formatNumber } from '@/lib/format'

interface ContactPersonForm {
  name: string
  email: string
  phone: string
  role: string
  isPrimary: boolean
}

interface BillingForm {
  invoiceFormat: 'ehf' | 'pdf'
  email: string
  reference: string
  comments: string
}

interface CompanyForm {
  orgNumber: string
  address: string
}

export function SponsorPortal({ token }: { token: string }) {
  const {
    data: sponsor,
    isLoading,
    error: fetchError,
  } = api.registration.validate.useQuery({ token })

  const [contacts, setContacts] = useState<ContactPersonForm[]>([
    { name: '', email: '', phone: '', role: '', isPrimary: true },
  ])
  const [billing, setBilling] = useState<BillingForm>({
    invoiceFormat: 'pdf',
    email: '',
    reference: '',
    comments: '',
  })
  const [company, setCompany] = useState<CompanyForm>({
    orgNumber: '',
    address: '',
  })
  const [signerEmail, setSignerEmail] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [logoBright, setLogoBright] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)

  const scrollToError = () => {
    setTimeout(() => {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const completeMutation = api.registration.complete.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (err) => {
      setError(err.message)
      scrollToError()
    },
  })

  useEffect(() => {
    if (!sponsor) return

    /* eslint-disable react-hooks/set-state-in-effect */
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
        invoiceFormat: sponsor.billing.invoiceFormat || 'pdf',
        email: sponsor.billing.email,
        reference: sponsor.billing.reference || '',
        comments: sponsor.billing.comments || '',
      })
    }
    setCompany({
      orgNumber: sponsor.sponsorOrgNumber || '',
      address: sponsor.sponsorAddress || '',
    })
    if (sponsor.sponsorLogo) setLogo(sponsor.sponsorLogo)
    if (sponsor.sponsorLogoBright) setLogoBright(sponsor.sponsorLogoBright)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [sponsor])

  const contactsWithEmail = useMemo(
    () => contacts.filter((c) => c.email.trim()),
    [contacts],
  )

  // Auto-set signer to primary contact when contacts change
  useEffect(() => {
    const primary = contacts.find((c) => c.isPrimary && c.email.trim())
    const currentSignerExists = contacts.some((c) => c.email === signerEmail)
    if (primary && (!signerEmail || !currentSignerExists)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSignerEmail(primary.email)
    }
  }, [contacts, signerEmail])

  if (isLoading) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <div className="text-center">
          <div className="border-oslo-blue mx-auto h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="mt-4 text-gray-600 dark:text-gray-300">
            Loading sponsor portal&hellip;
          </p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-950">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h2 className="mt-4 text-xl font-semibold text-red-800 dark:text-red-300">
          Invalid Link
        </h2>
        <p className="mt-2 text-red-600 dark:text-red-400">
          This link is invalid or has expired. Please contact the event
          organizers for a new link.
        </p>
      </div>
    )
  }

  // Portal status dashboard — shown when setup is complete
  if (submitted || sponsor?.registrationComplete) {
    return (
      <PortalStatusDashboard
        sponsorName={sponsor?.sponsorName}
        conferenceName={sponsor?.conferenceName}
        tierTitle={sponsor?.tierTitle}
        signerName={sponsor?.signerName}
        signerEmail={sponsor?.signerEmail}
        signatureStatus={sponsor?.signatureStatus}
        contractStatus={sponsor?.contractStatus}
        signingUrl={sponsor?.signingUrl}
        contractValue={sponsor?.contractValue}
        contractCurrency={sponsor?.contractCurrency}
      />
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
      scrollToError()
      return
    }

    if (!logo) {
      setError('Please upload your company logo before submitting.')
      scrollToError()
      return
    }

    if (!company.address.trim()) {
      setError('Please provide your company address.')
      scrollToError()
      return
    }

    if (!company.orgNumber.trim()) {
      setError('Please provide your organization number.')
      scrollToError()
      return
    }

    if (!billing.email.trim()) {
      setError('Please provide a billing email address.')
      scrollToError()
      return
    }

    const validContacts = contacts
      .filter((c) => c.name.trim() && c.email.trim())
      .map((c, index) => ({
        _key: `contact-${Date.now()}-${index}`,
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
        invoiceFormat: billing.invoiceFormat,
        email: billing.email.trim(),
        reference: billing.reference.trim() || undefined,
        comments: billing.comments.trim() || undefined,
      },
      logo: logo!,
      logoBright: logoBright || undefined,
      orgNumber: company.orgNumber.trim(),
      address: company.address.trim(),
      signerName: contacts.find((c) => c.email === signerEmail.trim())?.name,
      signerEmail: signerEmail.trim() || undefined,
    })
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Sponsor Portal
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-300">
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
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>

        {error && (
          <div
            ref={errorRef}
            className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950"
          >
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-400" />
              <p className="ml-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            </div>
          </div>
        )}

        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Company Information
          </h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Provide your company&apos;s registration details for the sponsorship
            contract.
          </p>

          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Organization Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={company.orgNumber}
                  onChange={(e) =>
                    setCompany({ ...company, orgNumber: e.target.value })
                  }
                  placeholder="e.g. 123 456 789"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Company Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={company.address}
                  onChange={(e) =>
                    setCompany({ ...company, address: e.target.value })
                  }
                  placeholder="Street, City, Country"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Company Logo
          </h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Upload your company logo in SVG format. This will be used on the
            conference website and printed materials.
          </p>
          <SponsorRegistrationLogoUpload
            logo={logo}
            logoBright={logoBright}
            sponsorName={sponsor?.sponsorName ?? ''}
            onChange={(updates) => {
              if ('logo' in updates) setLogo(updates.logo ?? null)
              if ('logoBright' in updates)
                setLogoBright(updates.logoBright ?? null)
            }}
          />
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Contact Persons
            </h2>
            <button
              type="button"
              onClick={addContact}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              <PlusIcon className="h-4 w-4" />
              Add Contact
            </button>
          </div>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Provide contact details for people involved in the sponsorship. Mark
            one person as the primary contact.
          </p>

          <div className="space-y-4">
            {contacts.map((contact, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Contact {index + 1}
                    </span>
                    {contact.isPrimary && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) =>
                        updateContact(index, 'name', e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) =>
                        updateContact(index, 'email', e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) =>
                        updateContact(index, 'phone', e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Role
                    </label>
                    <SponsorContactRoleSelect
                      value={contact.role}
                      onChange={(val) => updateContact(index, 'role', val)}
                      placeholder="Select role..."
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contract Signer selection */}
        {contactsWithEmail.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
              Contract Signer
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Select who should receive and sign the sponsorship agreement. The
              contract will be sent for digital signing to this person.
            </p>
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              {contactsWithEmail.length === 1 ? (
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  {contactsWithEmail[0].name.trim()
                    ? `${contactsWithEmail[0].name.trim()} (${contactsWithEmail[0].email.trim()})`
                    : contactsWithEmail[0].email.trim()}{' '}
                  will receive the contract for signing. Add more contacts above
                  if someone else should sign.
                </p>
              ) : (
                <select
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  {contactsWithEmail.map((c, i) => (
                    <option key={i} value={c.email.trim()}>
                      {c.name.trim()
                        ? `${c.name.trim()} (${c.email.trim()})`
                        : c.email.trim()}
                      {c.isPrimary ? ' \u2014 Primary' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Billing Information
          </h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Provide billing details for invoicing purposes.
          </p>

          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Invoice Format <span className="text-red-500">*</span>
                </label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  How would you like to receive invoices?
                </p>
                <div className="mt-2 flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="radio"
                      name="invoiceFormat"
                      value="ehf"
                      checked={billing.invoiceFormat === 'ehf'}
                      onChange={() =>
                        setBilling({ ...billing, invoiceFormat: 'ehf' })
                      }
                      className="h-4 w-4 cursor-pointer border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                    />
                    EHF (Digital Invoice)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="radio"
                      name="invoiceFormat"
                      value="pdf"
                      checked={billing.invoiceFormat === 'pdf'}
                      onChange={() =>
                        setBilling({ ...billing, invoiceFormat: 'pdf' })
                      }
                      className="h-4 w-4 cursor-pointer border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                    />
                    PDF via Email
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Billing Email <span className="text-red-500">*</span>
                </label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {billing.invoiceFormat === 'ehf'
                    ? 'Required as fallback if EHF delivery fails'
                    : 'Invoice will be sent to this address'}
                </p>
                <input
                  type="email"
                  value={billing.email}
                  onChange={(e) =>
                    setBilling({ ...billing, email: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Invoice Reference
                </label>
                <input
                  type="text"
                  value={billing.reference}
                  onChange={(e) =>
                    setBilling({ ...billing, reference: e.target.value })
                  }
                  placeholder="PO number, cost center, etc."
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Comments
                </label>
                <input
                  type="text"
                  value={billing.comments}
                  onChange={(e) =>
                    setBilling({ ...billing, comments: e.target.value })
                  }
                  placeholder="Special billing instructions"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
              <div className="flex">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-400" />
                <p className="ml-3 text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={completeMutation.isPending}
              className="inline-flex items-center rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
            >
              {completeMutation.isPending
                ? 'Submitting\u2026'
                : 'Complete Registration'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function PortalStatusDashboard({
  sponsorName,
  conferenceName,
  tierTitle,
  signerName,
  signerEmail,
  signatureStatus,
  contractStatus,
  signingUrl,
  contractValue,
  contractCurrency,
}: {
  sponsorName?: string
  conferenceName?: string
  tierTitle?: string | null
  signerName?: string | null
  signerEmail?: string | null
  signatureStatus?: string | null
  contractStatus?: string | null
  signingUrl?: string | null
  contractValue?: number | null
  contractCurrency?: string | null
}) {
  const isSigned = signatureStatus === 'signed'
  const isPending = signatureStatus === 'pending'
  const hasContract = contractStatus === 'contract-sent' || isSigned

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Sponsor Portal
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-300">
          <strong>{sponsorName}</strong> &mdash;{' '}
          <strong>{conferenceName}</strong>
        </p>
      </div>

      {/* Sponsorship summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-500 uppercase dark:text-gray-400">
          Sponsorship Details
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          {tierTitle && (
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Package</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {tierTitle}
              </dd>
            </div>
          )}
          {contractValue != null && (
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Value</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {formatNumber(contractValue)} {contractCurrency || 'NOK'}
              </dd>
            </div>
          )}
          {signerEmail && (
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">
                Contract signer
              </dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {signerName ? `${signerName} (${signerEmail})` : signerEmail}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Contract signed */}
      {isSigned && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-950">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="mt-4 text-xl font-semibold text-green-800 dark:text-green-300">
            Contract Signed
          </h2>
          <p className="mt-2 text-green-600 dark:text-green-400">
            Thank you! Your sponsorship agreement for{' '}
            <strong>{conferenceName}</strong> has been signed. We look forward
            to having you as a sponsor.
          </p>
        </div>
      )}

      {/* Contract pending — show signing link */}
      {isPending && !isSigned && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-950">
          <div className="flex items-start gap-4">
            <DocumentTextIcon className="mt-0.5 h-8 w-8 shrink-0 text-blue-500" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-300">
                Contract Ready for Signing
              </h2>
              <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
                Your sponsorship agreement has been sent to{' '}
                <strong>{signerEmail}</strong> for digital signing.
              </p>
              {signingUrl && (
                <a
                  href={signingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  <PencilSquareIcon className="h-5 w-5" />
                  Sign Contract
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Setup complete, no contract yet */}
      {!hasContract && !isSigned && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-start gap-4">
            <ClockIcon className="mt-0.5 h-8 w-8 shrink-0 text-gray-400 dark:text-gray-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Registration Complete
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Thank you for completing your registration. Your sponsorship
                agreement will be prepared and sent to you shortly for digital
                signing.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
