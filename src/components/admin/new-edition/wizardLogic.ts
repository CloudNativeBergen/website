/**
 * Pure, React-free step logic for the SE-5 "Create next edition" wizard. Kept
 * separate from the component so the gating/validation can be unit-tested and
 * exercised by Storybook `play` functions without rendering internals.
 */

import {
  validateStringList,
  buildStringListPayload,
} from '@/components/admin/editConferenceLists'
import type { CloneFlags } from '@/lib/conference/edition'

/** The four wizard steps, in order. */
export const WIZARD_STEPS = ['basics', 'domains', 'clone', 'review'] as const
export type WizardStepId = (typeof WIZARD_STEPS)[number]

export const WIZARD_STEP_TITLES: Record<WizardStepId, string> = {
  basics: 'Basics',
  domains: 'Domains',
  clone: 'What to clone',
  review: 'Review & create',
}

export function stepIndex(id: WizardStepId): number {
  return WIZARD_STEPS.indexOf(id)
}

export interface BasicsState {
  title: string
  organizer: string
  startDate: string
  endDate: string
  cfpStartDate: string
  cfpEndDate: string
  cfpNotifyDate: string
  programDate: string
}

export interface WizardState {
  basics: BasicsState
  domains: string[]
  clone: CloneFlags
  /** The type-to-confirm value the maintainer echoes on the review step. */
  confirmTitle: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validate the Basics step. Title, start and end dates are required; end must
 * not precede start, and (when both present) the CFP window must be ordered.
 * Errors are keyed by field name.
 */
export function validateBasics(b: BasicsState): Record<string, string> {
  const errs: Record<string, string> = {}
  if (b.title.trim() === '') errs.title = 'Title is required'
  if (b.startDate === '') errs.startDate = 'Start date is required'
  else if (!DATE_RE.test(b.startDate)) errs.startDate = 'Invalid date'
  if (b.endDate === '') errs.endDate = 'End date is required'
  else if (!DATE_RE.test(b.endDate)) errs.endDate = 'Invalid date'
  if (!errs.startDate && !errs.endDate && b.endDate < b.startDate) {
    errs.endDate = 'End date must be on or after the start date'
  }
  if (
    b.cfpStartDate &&
    b.cfpEndDate &&
    DATE_RE.test(b.cfpStartDate) &&
    DATE_RE.test(b.cfpEndDate) &&
    b.cfpEndDate < b.cfpStartDate
  ) {
    errs.cfpEndDate = 'CFP end date must be on or after the CFP start date'
  }
  return errs
}

export function basicsComplete(b: BasicsState): boolean {
  return Object.keys(validateBasics(b)).length === 0
}

/**
 * Local (shape) validation for the Domains list, reusing the SE-1b hostname
 * list validator. Blank rows are ignored; at least one hostname is required.
 * GLOBAL uniqueness (claimed by another conference) is a server concern and is
 * layered on top via `takenDomains`.
 */
export function domainsLocalErrors(domains: string[]): Record<string, string> {
  return validateStringList(
    {
      name: 'domains',
      itemType: 'hostname',
      itemLabel: 'domain',
      allowEmptyList: false,
    },
    domains,
  )
}

/** The cleaned, deduped domain payload sent to the server. */
export function cleanDomains(domains: string[]): string[] {
  return buildStringListPayload(domains).map((d) => d.trim().toLowerCase())
}

/**
 * The Domains step is complete when the list passes shape validation AND none
 * of the entered hostnames are already claimed by another conference.
 */
export function domainsComplete(
  domains: string[],
  takenDomains: readonly string[],
): boolean {
  if (Object.keys(domainsLocalErrors(domains)).length > 0) return false
  const taken = new Set(takenDomains.map((d) => d.trim().toLowerCase()))
  return cleanDomains(domains).every((d) => !taken.has(d))
}

/** Trimmed exact match between the echoed title and the intended new title. */
export function typeToConfirmMatches(input: string, title: string): boolean {
  return input.trim() === title.trim() && title.trim() !== ''
}

/**
 * Whether the wizard may advance FROM `step`. The review step has no "next"
 * (the Create button is gated separately by {@link canCreate}).
 */
export function canProceed(
  step: WizardStepId,
  state: WizardState,
  takenDomains: readonly string[],
): boolean {
  switch (step) {
    case 'basics':
      return basicsComplete(state.basics)
    case 'domains':
      return domainsComplete(state.domains, takenDomains)
    case 'clone':
      return true // any subset (including none) is allowed
    case 'review':
      return false
  }
}

/** The final gate on the red Create button. */
export function canCreate(
  state: WizardState,
  takenDomains: readonly string[],
): boolean {
  return (
    basicsComplete(state.basics) &&
    domainsComplete(state.domains, takenDomains) &&
    typeToConfirmMatches(state.confirmTitle, state.basics.title)
  )
}
