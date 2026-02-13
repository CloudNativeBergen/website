/**
 * Example tRPC Sponsor Management Component
 * This demonstrates how to use tRPC for sponsor admin operations
 */

'use client'

import { api } from '@/lib/trpc/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useState } from 'react'
import type { SponsorTierExisting, SponsorInput } from '@/lib/sponsor/types'

export function SponsorManagement() {
  const [searchQuery, setSearchQuery] = useState('')
  const [createSponsorOpen, setCreateSponsorOpen] = useState(false)

  // Fetch sponsors with search
  const {
    data: sponsors,
    isLoading: loadingSponsors,
    error: sponsorsError,
    refetch: refetchSponsors,
  } = api.sponsor.list.useQuery({
    query: searchQuery || undefined,
  })

  // Fetch sponsor tiers
  const { data: sponsorTiers } = api.sponsor.tiers.list.useQuery()

  // Create sponsor mutation
  const createSponsorMutation = api.sponsor.create.useMutation({
    onSuccess: () => {
      refetchSponsors()
      setCreateSponsorOpen(false)
    },
    onError: (error) => {
      console.error('Failed to create sponsor:', error.message)
    },
  })

  // Delete sponsor mutation
  const deleteSponsorMutation = api.sponsor.delete.useMutation({
    onSuccess: () => {
      refetchSponsors()
    },
    onError: (error) => {
      console.error('Failed to delete sponsor:', error.message)
    },
  })

  const handleCreateSponsor = (data: SponsorInput) => {
    createSponsorMutation.mutate(data)
  }

  const handleDeleteSponsor = (id: string) => {
    if (confirm('Are you sure you want to delete this sponsor?')) {
      deleteSponsorMutation.mutate({ id })
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sponsor Management</h1>
        <p className="text-gray-600">
          Manage sponsors using tRPC with full type safety
        </p>
      </div>

      {/* Search and Controls */}
      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search sponsors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-md border px-3 py-2"
        />
        <button
          onClick={() => setCreateSponsorOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Add Sponsor
        </button>
      </div>

      {/* Loading State */}
      {loadingSponsors && (
        <div className="py-8 text-center">
          <LoadingSpinner color="blue" />
          <p className="mt-2 text-gray-600">Loading sponsors...</p>
        </div>
      )}

      {/* Error State */}
      {sponsorsError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
          <h3 className="font-semibold text-red-800">Error loading sponsors</h3>
          <p className="text-red-600">{sponsorsError.message}</p>
        </div>
      )}

      {/* Sponsors List */}
      {sponsors && sponsors.length > 0 && (
        <div className="rounded-lg bg-white shadow">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">
              Sponsors ({sponsors.length})
            </h2>
          </div>
          <div className="divide-y">
            {sponsors.map((sponsor) => (
              <div
                key={sponsor._id}
                className="flex items-center justify-between p-6"
              >
                <div>
                  <h3 className="font-semibold">{sponsor.name}</h3>
                  <p className="text-gray-600">{sponsor.website}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDeleteSponsor(sponsor._id)}
                    disabled={deleteSponsorMutation.isPending}
                    className="rounded border border-red-600 px-3 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleteSponsorMutation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {sponsors && sponsors.length === 0 && (
        <div className="py-12 text-center">
          <h3 className="text-lg font-semibold text-gray-900">
            No sponsors found
          </h3>
          <p className="text-gray-600">
            {searchQuery
              ? 'Try adjusting your search'
              : 'Get started by adding your first sponsor'}
          </p>
        </div>
      )}

      {/* Sponsor Tiers Info */}
      {sponsorTiers && (
        <div className="mt-8 rounded-lg bg-gray-50 p-6">
          <h2 className="mb-4 text-lg font-semibold">
            Available Sponsor Tiers
          </h2>
          <div className="grid gap-3">
            {sponsorTiers
              .sort((a, b) => {
                // Sort by highest price first
                const getMaxPrice = (tier: SponsorTierExisting) => {
                  if (!tier.price || tier.price.length === 0) return 0
                  return Math.max(...tier.price.map((p) => p.amount))
                }
                return getMaxPrice(b) - getMaxPrice(a)
              })
              .map((tier) => (
                <div key={tier._id} className="rounded border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{tier.title}</h4>
                      <p className="text-sm text-gray-600">{tier.tagline}</p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs ${
                          tier.tierType === 'special'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {tier.tierType}
                      </span>
                      {tier.soldOut && (
                        <div className="mt-1 text-xs text-red-600">
                          Sold Out
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Create Sponsor Modal (simplified) */}
      {createSponsorOpen && (
        <div className="bg-opacity-50 fixed inset-0 flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">Add New Sponsor</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                handleCreateSponsor({
                  name: formData.get('name') as string,
                  website: formData.get('website') as string,
                  logo: formData.get('logo') as string,
                })
              }}
            >
              <div className="space-y-4">
                <input
                  name="name"
                  placeholder="Sponsor name"
                  required
                  className="w-full rounded-md border px-3 py-2"
                />
                <input
                  name="website"
                  type="url"
                  placeholder="Website URL"
                  required
                  className="w-full rounded-md border px-3 py-2"
                />
                <input
                  name="logo"
                  placeholder="Logo URL"
                  required
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setCreateSponsorOpen(false)}
                  className="flex-1 rounded-md border px-4 py-2 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSponsorMutation.isPending}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createSponsorMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
