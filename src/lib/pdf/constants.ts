/**
 * Adobe Sign anchor markers embedded in contract PDFs.
 * These invisible text strings are used by both the PDF generator
 * (contract-pdf.tsx) and the signature embedder (signature-embed.ts)
 * to locate the signature placement area.
 */
export const SIGNATURE_MARKER = '{{Sig_es_:signer1:signature}}'
export const DATE_MARKER = '{{Dte_es_:signer1:date}}'
