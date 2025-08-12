/**
 * tRPC Type Utilities
 * Provides useful type exports for tRPC router inputs and outputs
 */

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/_app'

export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>

// Convenience types for sponsor operations
export type SponsorListOutput = RouterOutputs['sponsor']['list']
export type SponsorCreateInput = RouterInputs['sponsor']['create']
export type SponsorUpdateInput = RouterInputs['sponsor']['update']
export type SponsorGetByIdOutput = RouterOutputs['sponsor']['getById']

export type SponsorTierListOutput = RouterOutputs['sponsor']['tiers']['list']
export type SponsorTierCreateInput = RouterInputs['sponsor']['tiers']['create']
export type SponsorTierUpdateInput = RouterInputs['sponsor']['tiers']['update']
