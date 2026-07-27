import { Staff, StaffAdmin } from '@/lib/staff/types'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getOrganizationRefForCurrentConference } from '@/lib/organization/sanity'

/**
 * Every staff member across all roles, ordered for the admin table (SE-4).
 * Projects the raw image asset id alongside the resolved URL so the editor can
 * both preview the image and re-submit it unchanged.
 *
 * TENANT-SCOPED (#616/#18): `staff` carries an `organization` ref, so the read
 * is constrained to the current-domain tenant — an organizer only ever sees
 * their own org's staff.
 */
export async function getAllStaffMembers(): Promise<StaffAdmin[]> {
  const orgId = await getOrganizationRefForCurrentConference()
  return await scopedFetch<StaffAdmin[]>(
    clientRead,
    { orgId },
    `*[_type == "staff"] | order(role asc, name asc)
    {
      "_id": _id,
      name,
      role,
      email,
      company,
      "imageAssetId": image.asset._ref,
      "imageURL": image.asset->url
    }`,
  )
}

/**
 * Public staff listing for a role (rendered on `/staff/[role]`). TENANT-SCOPED
 * (#616/#18): `staff` carries an `organization` ref, so only the current
 * tenant's staff surface — one org's people never leak onto another's site.
 */
export async function getStaffMembers(
  role: string,
): Promise<{ data: Staff[]; err?: Error }> {
  try {
    const orgId = await getOrganizationRefForCurrentConference()
    const queryResult = await scopedFetch<Staff[]>(
      clientRead,
      { orgId },
      `*[_type == "staff" && role == $role]
    {
      "id": _id,
      name,
      role,
      email,
      company,
      "imageURL": image.asset->url,
      link
    }`,
      { role },
    )
    return { data: queryResult }
  } catch (error) {
    return { data: [], err: error as Error }
  }
}
