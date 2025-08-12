'use client'

import { useState } from 'react'
import {
  ConferenceSponsorDetailed,
  SponsorStatus,
  ContactPerson,
  InvoiceInfo,
} from '@/lib/sponsor/types'
import { Conference } from '@/lib/conference/types'
import InvoiceEditor from './InvoiceEditor'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  UserCircleIcon,
  CalendarIcon,
  ChatBubbleLeftEllipsisIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  BuildingOffice2Icon,
  PhoneIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'

interface SponsorRelationshipManagerProps {
  sponsors: ConferenceSponsorDetailed[]
  conference: Conference
}

export default function SponsorRelationshipManager({
  sponsors,
  conference,
}: SponsorRelationshipManagerProps) {
  const [selectedSponsor, setSelectedSponsor] =
    useState<ConferenceSponsorDetailed | null>(
      sponsors.length > 0 ? sponsors[0] : null,
    )
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SponsorStatus | 'all'>('all')
  const [activeTab, setActiveTab] = useState<
    'overview' | 'invoice' | 'contract' | 'communications' | 'timeline'
  >('overview')

  // Filter sponsors based on search and status
  const filteredSponsors = sponsors.filter((sponsor) => {
    const matchesSearch = sponsor.sponsor.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ||
      sponsor.sponsor.relationship?.current_status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Get status color for UI
  const getStatusColor = (status?: SponsorStatus): string => {
    if (!status) return 'text-gray-500'

    switch (status) {
      case 'confirmed':
      case 'paid':
      case 'completed':
        return 'text-green-600'
      case 'potential':
      case 'contacted':
        return 'text-blue-600'
      case 'declined':
      case 'cancelled':
        return 'text-red-600'
      case 'invoice_overdue':
        return 'text-red-600'
      case 'negotiating':
      case 'proposal_sent':
        return 'text-yellow-600'
      default:
        return 'text-gray-600'
    }
  }

  // Get status badge style
  const getStatusBadge = (status?: SponsorStatus) => {
    if (!status) return 'bg-gray-100 text-gray-800'

    switch (status) {
      case 'confirmed':
      case 'paid':
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'potential':
      case 'contacted':
        return 'bg-blue-100 text-blue-800'
      case 'declined':
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      case 'invoice_overdue':
        return 'bg-red-100 text-red-800'
      case 'negotiating':
      case 'proposal_sent':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BuildingOffice2Icon },
    { id: 'invoice', name: 'Invoice & Billing', icon: CurrencyDollarIcon },
    { id: 'contract', name: 'Contract', icon: DocumentTextIcon },
    {
      id: 'communications',
      name: 'Communications',
      icon: ChatBubbleLeftEllipsisIcon,
    },
    { id: 'timeline', name: 'Timeline', icon: CalendarIcon },
  ] as const

  if (sponsors.length === 0) {
    return (
      <div className="py-12 text-center">
        <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          No sponsors available
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Add sponsors to the conference to manage relationships.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-white shadow">
      <div className="flex min-h-0 flex-1">
        {/* Sponsor Sidebar */}
        <div className="flex min-h-0 w-80 flex-col border-r border-gray-200">
          {/* Search and Filter */}
          <div className="flex-shrink-0 border-b border-gray-200 p-4">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search sponsors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-300 py-2 pr-4 pl-10 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mt-3">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as SponsorStatus | 'all')
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="potential">Potential</option>
                <option value="contacted">Contacted</option>
                <option value="negotiating">Negotiating</option>
                <option value="confirmed">Confirmed</option>
                <option value="invoice_sent">Invoice Sent</option>
                <option value="paid">Paid</option>
                <option value="completed">Completed</option>
                <option value="declined">Declined</option>
              </select>
            </div>
          </div>

          {/* Sponsor List */}
          <div className="flex-1 overflow-y-auto">
            {filteredSponsors.map((sponsor) => (
              <div
                key={sponsor.sponsor._id}
                onClick={() => setSelectedSponsor(sponsor)}
                className={`cursor-pointer border-b border-gray-100 p-4 hover:bg-gray-50 ${
                  selectedSponsor?.sponsor._id === sponsor.sponsor._id
                    ? 'border-r-2 border-r-blue-500 bg-blue-50'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="truncate font-medium text-gray-900">
                    {sponsor.sponsor.name}
                  </h4>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(
                      sponsor.sponsor.relationship?.current_status,
                    )}`}
                  >
                    {sponsor.sponsor.relationship?.current_status ||
                      'No Status'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {sponsor.tier?.title || 'No Tier'}
                </p>
                <div className="mt-2 flex items-center space-x-2">
                  {sponsor.sponsor.contact_persons &&
                  sponsor.sponsor.contact_persons.length > 0 ? (
                    <CheckCircleIcon className="h-4 w-4 text-green-500" />
                  ) : (
                    <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
                  )}
                  <span className="text-xs text-gray-500">
                    {sponsor.sponsor.contact_persons?.length || 0} contacts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex min-h-0 flex-1 flex-col">
          {selectedSponsor ? (
            <>
              {/* Header */}
              <div className="flex-shrink-0 border-b border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedSponsor.sponsor.name}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {selectedSponsor.tier?.title} •{' '}
                      {selectedSponsor.tier?.tier_type}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${getStatusBadge(
                        selectedSponsor.sponsor.relationship?.current_status,
                      )}`}
                    >
                      {selectedSponsor.sponsor.relationship?.current_status ||
                        'No Status'}
                    </span>
                    <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      Update Status
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex-shrink-0 border-b border-gray-200">
                <nav className="flex space-x-8 px-6">
                  {tabs.map((tab) => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center border-b-2 px-1 py-4 text-sm font-medium ${
                          activeTab === tab.id
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                      >
                        <Icon className="mr-2 h-5 w-5" />
                        {tab.name}
                      </button>
                    )
                  })}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                  {activeTab === 'overview' && (
                    <SponsorOverviewTab sponsor={selectedSponsor} />
                  )}
                  {activeTab === 'invoice' && (
                    <SponsorInvoiceTab sponsor={selectedSponsor} />
                  )}
                  {activeTab === 'contract' && (
                    <SponsorContractTab sponsor={selectedSponsor} />
                  )}
                  {activeTab === 'communications' && (
                    <SponsorCommunicationsTab sponsor={selectedSponsor} />
                  )}
                  {activeTab === 'timeline' && (
                    <SponsorTimelineTab sponsor={selectedSponsor} />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  Select a sponsor
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Choose a sponsor from the list to view and manage their
                  relationship.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Overview Tab Component
function SponsorOverviewTab({
  sponsor,
}: {
  sponsor: ConferenceSponsorDetailed
}) {
  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div>
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          Basic Information
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-500">
              Website
            </label>
            <p className="mt-1 text-sm text-gray-900">
              <a
                href={sponsor.sponsor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                {sponsor.sponsor.website}
              </a>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">
              Organization Number
            </label>
            <p className="mt-1 text-sm text-gray-900">
              {sponsor.sponsor.org_number || 'Not provided'}
            </p>
          </div>
        </div>
      </div>

      {/* Contact Persons */}
      <div>
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          Contact Persons
        </h3>
        {sponsor.sponsor.contact_persons &&
        sponsor.sponsor.contact_persons.length > 0 ? (
          <div className="space-y-4">
            {sponsor.sponsor.contact_persons.map((contact: ContactPerson) => (
              <div
                key={contact._key}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <UserCircleIcon className="h-10 w-10 text-gray-400" />
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {contact.name}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {contact.role || 'No role specified'}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <EnvelopeIcon className="h-5 w-5" />
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <PhoneIcon className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {contact.email && (
                    <div>
                      <span className="text-sm text-gray-500">Email:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {contact.email}
                      </span>
                    </div>
                  )}
                  {contact.phone && (
                    <div>
                      <span className="text-sm text-gray-500">Phone:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {contact.phone}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 py-8 text-center">
            <UserCircleIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h4 className="mt-2 text-sm font-medium text-gray-900">
              No contacts
            </h4>
            <p className="mt-1 text-sm text-gray-500">
              Add contact persons for this sponsor.
            </p>
          </div>
        )}
      </div>

      {/* Billing Information */}
      <div>
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          Billing Information
        </h3>
        {sponsor.sponsor.billing ? (
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-500">
                  Billing Email
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  {sponsor.sponsor.billing.email}
                </p>
              </div>
              {sponsor.sponsor.billing.reference && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Reference
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {sponsor.sponsor.billing.reference}
                  </p>
                </div>
              )}
            </div>
            {sponsor.sponsor.billing.comments && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-500">
                  Comments
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  {sponsor.sponsor.billing.comments}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 py-8 text-center">
            <CurrencyDollarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h4 className="mt-2 text-sm font-medium text-gray-900">
              No billing information
            </h4>
            <p className="mt-1 text-sm text-gray-500">
              Add billing details for this sponsor.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Invoice Tab Component
function SponsorInvoiceTab({
  sponsor,
}: {
  sponsor: ConferenceSponsorDetailed
}) {
  const handleInvoiceSave = async (invoiceData: InvoiceInfo) => {
    // TODO: Implement invoice save functionality with tRPC
    console.log('Saving invoice data:', invoiceData)
    // This would typically call a tRPC mutation to update the invoice
    // await updateInvoice.mutateAsync({ sponsorId: sponsor.sponsor._id, invoice: invoiceData })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          Invoice & Billing Management
        </h3>
        <p className="mb-6 text-sm text-gray-500">
          Manage invoice details, payment status, and billing information for{' '}
          {sponsor.sponsor.name}.
        </p>
      </div>

      {/* Invoice Editor */}
      <div className="rounded-lg bg-gray-50 p-6">
        <InvoiceEditor
          invoice={sponsor.sponsor.invoice}
          sponsorName={sponsor.sponsor.name}
          onSave={handleInvoiceSave}
          isLoading={false}
        />
      </div>

      {/* Billing Information */}
      {sponsor.sponsor.billing && (
        <div>
          <h4 className="text-md mb-3 font-medium text-gray-900">
            Billing Information
          </h4>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-500">
                  Billing Email
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  {sponsor.sponsor.billing.email}
                </p>
              </div>
              {sponsor.sponsor.billing.reference && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Reference
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {sponsor.sponsor.billing.reference}
                  </p>
                </div>
              )}
            </div>
            {sponsor.sponsor.billing.comments && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-500">
                  Comments
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  {sponsor.sponsor.billing.comments}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invoice History Placeholder */}
      <div>
        <h4 className="text-md mb-3 font-medium text-gray-900">
          Invoice History
        </h4>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <CurrencyDollarIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h4 className="mt-2 text-sm font-medium text-gray-900">
            Invoice History
          </h4>
          <p className="mt-1 text-sm text-gray-500">
            Future feature: Track multiple invoices and payment history.
          </p>
        </div>
      </div>
    </div>
  )
}

// Contract Tab Component
function SponsorContractTab({
  sponsor,
}: {
  sponsor: ConferenceSponsorDetailed
}) {
  return (
    <div className="space-y-6">
      <div className="py-12 text-center">
        <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Contract Management
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Contract management features will be implemented here.
        </p>
      </div>
    </div>
  )
}

// Communications Tab Component
function SponsorCommunicationsTab({
  sponsor,
}: {
  sponsor: ConferenceSponsorDetailed
}) {
  return (
    <div className="space-y-6">
      <div className="py-12 text-center">
        <ChatBubbleLeftEllipsisIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Communication History
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Communication tracking features will be implemented here.
        </p>
      </div>
    </div>
  )
}

// Timeline Tab Component
function SponsorTimelineTab({
  sponsor,
}: {
  sponsor: ConferenceSponsorDetailed
}) {
  return (
    <div className="space-y-6">
      <div className="py-12 text-center">
        <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Relationship Timeline
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Status timeline and history will be implemented here.
        </p>
      </div>
    </div>
  )
}
