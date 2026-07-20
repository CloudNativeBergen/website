/**
 * SVG utilities barrel.
 *
 * `sanitizeSvg` (from ./render) is the CLIENT-SAFE, dependency-free sanitizer
 * used at RENDER time by {@link InlineSvg} and for in-form previews. It is a
 * best-effort regex pass — cheap, isomorphic, and safe to ship to the browser.
 *
 * The AUTHORITATIVE, server-side upload sanitizer lives in ./upload
 * (`sanitizeSvgUpload`). It parses a real XML DOM (`@xmldom/xmldom`) and is the
 * gate every persisted logo passes through. It is intentionally NOT re-exported
 * here so client bundles never pull the parser in — import it directly from
 * `@/lib/svg/upload` in server code only.
 */
export { sanitizeSvg } from './render'
