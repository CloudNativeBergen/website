import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

/**
 * The delete previews' note about short links that may already be live
 * (short-links spec §2.1's known hole, §2.7): a sent outreach message, or a
 * post that failed or waits to be posted by hand. They fall back to the
 * conference home page. A warning, never a block — renders nothing at zero.
 */
export function LiveLinksWarning({ count }: { count: number }) {
  if (count <= 0) return null
  const one = count === 1
  return (
    <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
      <ExclamationTriangleIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-amber-500"
      />
      <div>
        <p className="font-medium">
          {count} short link{one ? '' : 's'} may already be shared
        </p>
        <p className="mt-1">
          {one
            ? 'It belongs to a sent outreach message, or to a post that failed or awaits posting by hand, so someone may already have it. After the delete, it opens the conference home page instead.'
            : 'They belong to sent outreach messages, or to posts that failed or await posting by hand, so people may already have them. After the delete, they open the conference home page instead.'}
        </p>
      </div>
    </div>
  )
}
