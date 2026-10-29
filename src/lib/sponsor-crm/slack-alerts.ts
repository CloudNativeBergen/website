import { getSfcForNotification } from '@/lib/sponsor-crm/registration'
import { notifySponsorAlert } from '@/lib/slack/notify'

/**
 * Posts a sponsor alert (#1687 N1) to the sponsor's own conference sales
 * channel, addressed to its owner. Never throws: the action that raised the
 * alert has already happened and must not fail on Slack. Returns false when
 * the alert could not be posted, so a sweep can retry it.
 */
export async function alertSponsorOwner(
  sponsorForConferenceId: string,
  headline: string,
  detail: string,
): Promise<boolean> {
  try {
    const sfc = await getSfcForNotification(sponsorForConferenceId)
    if (!sfc?.conference) return true
    return await notifySponsorAlert(
      {
        sfcId: sfc._id,
        ownerName: sfc.ownerName,
        sponsorName: sfc.sponsorName,
        headline,
        detail,
      },
      sfc.conference,
    )
  } catch (error) {
    console.error('[sponsor-alert] Slack alert failed:', error)
    return false
  }
}
