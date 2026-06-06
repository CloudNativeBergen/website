/**
 * Non-blocking Studio warning for the contract-sent invariant: a contract that
 * has been sent (or signed) should carry the data a valid contract requires — a
 * tier and a positive value. Mirrors the tRPC `contract` axis guards for edits
 * made directly in the Studio, which bypass the API.
 *
 * Shipped as a WARNING first; promoted to a blocking error after the
 * back-catalog audit (#379). Pure and synchronous — presence is all the
 * invariant needs, so no client fetch (unlike the dangling-tier check).
 */
const CONTRACT_SENT_STATES = new Set(['contract-sent', 'contract-signed'])

export function contractSentWarning(
  contractStatus: string | undefined,
  tierRef: string | undefined,
  contractValue: number | undefined,
): true | string {
  if (!contractStatus || !CONTRACT_SENT_STATES.has(contractStatus)) return true

  const missing: string[] = []
  if (!tierRef) missing.push('a tier')
  if (contractValue == null || contractValue <= 0) missing.push('a value')
  if (missing.length === 0) return true

  const noun = contractStatus === 'contract-signed' ? 'signed' : 'sent'
  return `A ${noun} contract should have ${missing.join(' and ')} set.`
}
