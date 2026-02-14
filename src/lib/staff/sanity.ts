import { Staff } from '@/lib/staff/types'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { defineQuery } from 'next-sanity'

export async function getStaffMembers(
  role: string,
): Promise<{ data: Staff[]; err?: Error }> {
  const query = defineQuery(`
    * [_type == "staff" && role == "${role}"]
    {
      name,
      role,
      email,
      company,
      "imageURL": image.asset->url,
      link
    }
  `)

  try {
    const queryResult = await clientRead.fetch<Staff[]>(query)
    const resultOrError = { data: queryResult, error: null }
    return resultOrError
  } catch (error) {
    return { data: [], err: error as Error }
  }
}
