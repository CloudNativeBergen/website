/**
 * Main proposal library exports - Client-safe only
 * For server-side functionality, import from '@/lib/proposal/server'
 * This prevents server-side code from being bundled on the client
 */

// Re-export everything from client-safe exports
export * from './client'

// Re-export utils directly to ensure they're available
export {
  convertJsonToProposal,
  convertStringToPortableTextBlocks,
  validateProposal,
} from './utils/validation'
