import { Staff } from '@/lib/staff/types'
import {
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import { defineQuery } from 'next-sanity';

export async function getStaffMembers(role: string): Promise<{ staff: Staff[]; err?: Error }> {
  const query = defineQuery(`* [_type == "staff" && role == "${role}}"]`)

  try {
    const queryResult = await clientRead.fetch<Staff[]>(query)
    const a = { staff: queryResult, error: null }
    return a

  } catch (error) {
    return { staff: [], err: error as Error }
  }

}

