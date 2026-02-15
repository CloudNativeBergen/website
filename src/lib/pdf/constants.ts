/**
 * Anchor markers embedded in contract PDFs.
 * These invisible text strings are used by the PDF generator
 * (contract-pdf.tsx) and the signature embedder (signature-embed.ts)
 * to locate the signature placement areas.
 */

// Sponsor (right side) markers
export const SPONSOR_SIGNATURE_MARKER = '{{Sig_es_:signer1:signature}}'
export const SPONSOR_DATE_MARKER = '{{Dte_es_:signer1:date}}'

// Organizer (left side) markers
export const ORGANIZER_SIGNATURE_MARKER = '{{Sig_es_:organizer:signature}}'
export const ORGANIZER_DATE_MARKER = '{{Dte_es_:organizer:date}}'
