import { Staff, StaffAdmin } from '@/lib/staff/types'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { defineQuery } from 'next-sanity'

/**
 * Every staff member across all roles, ordered for the admin table (SE-4).
 * Projects the raw image asset id alongside the resolved URL so the editor can
 * both preview the image and re-submit it unchanged.
 */
export async function getAllStaffMembers(): Promise<StaffAdmin[]> {
  const query = defineQuery(`
    * [_type == "staff"] | order(role asc, name asc)
    {
      "_id": _id,
      name,
      role,
      email,
      company,
      link,
      "imageAssetId": image.asset._ref,
      "imageURL": image.asset->url
    }
  `)

  return await clientRead.fetch<StaffAdmin[]>(query)
}

export async function getStaffMembers(
  role: string,
): Promise<{ data: Staff[]; err?: Error }> {
  const query = defineQuery(`
    * [_type == "staff" && role == $role]
    {
      "id": _id,
      name,
      role,
      email,
      company,
      "imageURL": image.asset->url,
      link
    }
  `)

  try {
    const queryResult = await clientRead.fetch<Staff[]>(query, { role: role })
    return { data: queryResult }
  } catch (error) {
    return { data: [], err: error as Error }
  }
}
