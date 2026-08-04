/**
 * The two class strings the composer rail's form controls share.
 *
 * They live in their own module rather than being re-declared per file because
 * the rail is now three components (card, config, fields) that used to be one:
 * a copy in each would drift into three slightly different text inputs on the
 * same panel.
 */

export const inputClass =
  'block w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'

/**
 * 44px on touch, 36px from `sm` up.
 *
 * The 44px target is a FINGER minimum, and on a pointer it is simply oversized:
 * six of them beside a 26rem rail left ~110px for the section label, so every
 * multi-word title ("Featured Speakers", "Program Highlights") wrapped at every
 * width. Shrinking them above the touch breakpoint returns ~50px to the label
 * without taking a pixel off any tap target that is actually tapped.
 */
export const rowBtnClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9 dark:text-gray-400 dark:hover:bg-gray-800'
