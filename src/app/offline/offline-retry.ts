import { SCREEN_PATH } from '@/lib/photo-wall/screen'

/** How often a venue screen stuck on the offline page asks whether it is back. */
export const OFFLINE_RETRY_MS = 30_000

/**
 * The offline page's own retry, for the Photo Wall's Screen Mode only
 * (Photo Wall spec §9.2). The service worker serves this page at the URL
 * whose navigation failed; at `/wall/screen` nobody will press "Try again",
 * so every {@link OFFLINE_RETRY_MS} it asks the screen's URL and reloads
 * once that answers. Any other page keeps the button alone.
 *
 * Inline, not an effect: it runs as the browser parses the cached page, so
 * it needs none of the page's JavaScript chunks, which a screen that never
 * opened `/offline` may not have cached.
 */
export const OFFLINE_RETRY_SCRIPT = `(function () {
  if (!new RegExp(${JSON.stringify(SCREEN_PATH.source)}, ${JSON.stringify(SCREEN_PATH.flags)}).test(location.pathname)) return;
  setInterval(function () {
    fetch(location.href, { method: 'HEAD', cache: 'no-store' }).then(
      function (response) { if (response.ok) location.reload(); },
      function () {}
    );
  }, ${OFFLINE_RETRY_MS});
})();`
