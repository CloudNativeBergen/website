import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import {
  PlusIcon,
  TrashIcon,
  EnvelopeIcon,
  PhoneIcon,
  UserIcon,
  CreditCardIcon,
  StarIcon as StarIconOutline,
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { CONTACT_ROLE_OPTIONS } from '@/lib/sponsor/types'

const meta = {
  title: 'Admin/Sponsors/Contacts/SponsorContactEditor',
  parameters: {
    layout: 'padded',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface Contact {
  _key: string
  name: string
  email: string
  phone: string
  role: string
  isPrimary: boolean
}

function ContactEditorDemo() {
  const [contacts, setContacts] = useState<Contact[]>([
    {
      _key: '1',
      name: 'Maria Jensen',
      email: 'maria@techgiant.com',
      phone: '+47 900 00 001',
      role: 'Marketing',
      isPrimary: true,
    },
    {
      _key: '2',
      name: 'Erik Olsen',
      email: 'erik@techgiant.com',
      phone: '+47 900 00 002',
      role: 'Finance',
      isPrimary: false,
    },
  ])
  const [billing, setBilling] = useState({
    email: 'invoices@techgiant.com',
    reference: 'PO-2025-001',
    comments: 'Net 30 payment terms',
  })

  const handleAddContact = () => {
    setContacts([
      ...contacts,
      {
        _key: String(Date.now()),
        name: '',
        email: '',
        phone: '',
        role: '',
        isPrimary: contacts.length === 0,
      },
    ])
  }

  const handleRemoveContact = (key: string) => {
    setContacts(contacts.filter((c) => c._key !== key))
  }

  const handleSetPrimary = (key: string) => {
    setContacts(
      contacts.map((c) => ({
        ...c,
        isPrimary: c._key === key,
      })),
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Contact Persons
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage contact persons for TechGiant Corp
          </p>
        </div>
        <button
          onClick={handleAddContact}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <PlusIcon className="h-4 w-4" />
          Add Contact
        </button>
      </div>

      {/* Contacts List */}
      <div className="space-y-4">
        {contacts.map((contact) => (
          <div
            key={contact._key}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => handleSetPrimary(contact._key)}
                className={`flex items-center gap-1 text-sm ${
                  contact.isPrimary
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-400 hover:text-amber-600 dark:hover:text-amber-400'
                }`}
              >
                {contact.isPrimary ? (
                  <StarIconSolid className="h-5 w-5" />
                ) : (
                  <StarIconOutline className="h-5 w-5" />
                )}
                {contact.isPrimary ? 'Primary Contact' : 'Set as Primary'}
              </button>
              <button
                onClick={() => handleRemoveContact(contact._key)}
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <UserIcon className="h-4 w-4" />
                  Name
                </label>
                <input
                  type="text"
                  value={contact.name}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <EnvelopeIcon className="h-4 w-4" />
                  Email
                </label>
                <input
                  type="email"
                  value={contact.email}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="email@company.com"
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <PhoneIcon className="h-4 w-4" />
                  Phone
                </label>
                <input
                  type="tel"
                  value={contact.phone}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="+47 XXX XX XXX"
                />
              </div>
              <div>
                <label className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Role
                </label>
                <select
                  value={contact.role}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Select role...</option>
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

      {/* Billing Information */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <CreditCardIcon className="h-5 w-5" />
          Billing Information
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Billing Email
            </label>
            <input
              type="email"
              value={billing.email}
              onChange={(e) =>
                setBilling({ ...billing, email: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="invoices@company.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Purchase Order Reference
            </label>
            <input
              type="text"
              value={billing.reference}
              onChange={(e) =>
                setBilling({ ...billing, reference: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="PO-XXXX"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Comments
            </label>
            <textarea
              value={billing.comments}
              onChange={(e) =>
                setBilling({ ...billing, comments: e.target.value })
              }
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Payment terms, special instructions..."
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
          Cancel
        </button>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Save Changes
        </button>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => <ContactEditorDemo />,
}

export const Empty: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Contact Persons
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage contact persons for New Sponsor Inc
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <PlusIcon className="h-4 w-4" />
          Add Contact
        </button>
      </div>

      <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
        <UserIcon className="mx-auto h-10 w-10 text-gray-400" />
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          No contacts added yet
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Click &quot;Add Contact&quot; to get started
        </p>
      </div>
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorContactEditor
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Form for managing sponsor contact persons and billing information.
          Supports multiple contacts with primary designation and role
          assignment.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              sponsorForConference
            </code>{' '}
            - SponsorForConference record to edit
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onSuccess
            </code>{' '}
            - Callback when contacts are saved
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onCancel
            </code>{' '}
            - Callback when editing is cancelled
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• Multiple contact persons per sponsor</li>
          <li>• Primary contact designation (star icon)</li>
          <li>• Role assignment (Marketing, Finance, etc.)</li>
          <li>• Billing email and PO reference</li>
          <li>• First added contact auto-marked as primary</li>
          <li>• Uses tRPC mutation for persistence</li>
        </ul>
      </div>
    </div>
  ),
}
