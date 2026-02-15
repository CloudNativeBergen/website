export {
  SPONSOR_SIGNATURE_MARKER,
  SPONSOR_DATE_MARKER,
  ORGANIZER_SIGNATURE_MARKER,
  ORGANIZER_DATE_MARKER,
} from './constants'
export { findMarkerInPdf, parseTextPosition } from './marker-detection'
export type { MarkerPosition } from './marker-detection'
export {
  embedSignatureInPdf,
  embedSignatureInPdfBuffer,
} from './signature-embed'
export type { EmbedSignatureOptions } from './signature-embed'
export { addAttestationPage } from './attestation-page'
export type { SigningAttestation } from './attestation-page'
