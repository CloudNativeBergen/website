export {
  buildLegalConfig,
  NORWAY_SUPERVISORY_AUTHORITY,
  GENERIC_SUPERVISORY_AUTHORITY,
  type LegalConfig,
  type SupervisoryAuthority,
  type OrganizationLegalFields,
} from './config'
export { resolveLegalConfig } from './resolve'
export {
  discloses,
  internationalTransferProcessors,
  type DisclosedSubprocessor,
  type SubprocessorDisclosure,
} from './subprocessors'
export { resolveSubprocessorDisclosure } from './subprocessors.resolve'
