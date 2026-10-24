import { CameraIcon } from '@heroicons/react/24/outline'
import { DELETION_DAYS } from '@/lib/photo-wall/deletion'

/**
 * The Photo Wall on /privacy (Photo Wall spec §12), for EVERY tenant: any
 * conference can set one up. The copy is the spec's: a post is deleted, and
 * marketing consent withdrawn, from My posts on the phone that posted it
 * (M6), or through the organizers. `/wall/post` links here as
 * `/privacy#photo-wall`.
 */
export function PhotoWallPrivacy() {
  return (
    <div
      id="photo-wall"
      className="scroll-mt-24 rounded-lg border border-sky-200 bg-sky-50 p-6 dark:border-sky-800 dark:bg-sky-900/20"
    >
      <h3 className="mb-4 flex items-center text-lg font-semibold text-sky-800 dark:text-sky-200">
        <CameraIcon className="mr-3 size-5" />
        Photo Wall
      </h3>
      <ul className="space-y-2 text-sm text-sky-800 dark:text-sky-200">
        <li>
          <strong>What:</strong> if you post a photo to a conference&apos;s
          Photo Wall, we store the photo (filtered and resized on your phone,
          with location and other camera data removed), your caption, your name
          if you give one, how the photo is cropped on the wall, whether you
          allow marketing use, and a cookie that recognises your phone. No
          email, IP address or account is collected.
        </li>
        <li>
          <strong>Who sees it:</strong> your post appears on the wall at the
          venue and on the conference website only after an organizer approves
          it. The photo file itself is stored with an unlisted web address from
          the moment you post it, so anyone who has that address can open it,
          even before approval or after it is taken off the wall, until it is
          deleted; the platform&apos;s administrators can also see it.
        </li>
        <li>
          <strong>Purpose and legal basis:</strong> we show your photo because
          you chose to post it (consent), and you can withdraw that by deleting
          it. If you tick the marketing box, the organizers may also use your
          photo in their own marketing (separate consent); untick it at any
          time.
        </li>
        <li>
          <strong>Retention:</strong> we delete every Photo Wall post{' '}
          {DELETION_DAYS} days after the conference; a deleted photo can stay in
          our provider&apos;s cache for a short while. Copies the organizers
          downloaded for marketing before you withdrew that consent or the post
          was deleted are theirs and aren&apos;t covered by that deletion.
        </li>
        <li>
          <strong>Your rights:</strong> To delete a post, open the wall&rsquo;s
          posting page on the same phone and use My posts, or contact the
          organizers. The same page has the Marketing switch. If you are in
          someone else&rsquo;s photo and want it removed, contact the
          organizers.
        </li>
        <li>
          <strong>Processors:</strong> photos are stored with our content
          platform, Sanity, listed in section 5; no other service receives them.
        </li>
      </ul>
    </div>
  )
}

/** The Photo Wall cookie in the cookies section's inventory, for every tenant. */
export function PhotoWallCookieNote() {
  return (
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
      <strong>Photo Wall:</strong> If you open a conference&apos;s Photo Wall
      posting page, this site sets one strictly necessary cookie,{' '}
      <code>konf_wall</code>, sent only to the wall&apos;s pages. It holds a
      random identifier for your phone and the time it was set; nothing about
      you. It recognises your phone, so your posts and their limits stay yours
      and My posts can show, delete and change them, and it expires at the end
      of the day the wall&apos;s posts are deleted, {DELETION_DAYS} days after
      the conference. Clearing this site&apos;s cookies removes it.
    </p>
  )
}
