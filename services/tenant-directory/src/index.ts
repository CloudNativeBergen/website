// The generated worker plus the SiteMail entrypoint (#2130).
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createData, type InvitationMail } from './data'
import worker, { type WorkerEnv } from './worker'

export default worker

/**
 * identity's SITE_MAIL binding (`"entrypoint": "SiteMail"`): asks the site to
 * email an invitation, signed with PROVISIONING_SIGNING_KEY. No HTTP route.
 */
export class SiteMail extends WorkerEntrypoint<WorkerEnv> {
  invitation(mail: InvitationMail) {
    return createData(this.env).sendInvitationEmail(mail)
  }
}
