import { headers } from 'next/headers'

/**
 * The request's tenant host. The one source for both the domain conference
 * lookup and the Konf API write host (#1890), so the two never disagree.
 */
export async function requestDomain(): Promise<string> {
  return (await headers()).get('host') || ''
}
