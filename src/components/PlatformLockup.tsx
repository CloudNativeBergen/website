import { PLATFORM_NAME } from '@/lib/branding/platform'

/**
 * The PLATFORM's own lockup, not any tenant's — reproduced from konf.app's,
 * which is the authority (RunKonf/landingpage `index.html`, `.brand-lockup`).
 *
 * The lockup is a badge MARK plus the word as LIVE TEXT, not a single piece of
 * vector art: the mark is stroked ember on both grounds while the word takes
 * the ground's foreground, and the trailing dot is ember in both. Geometry,
 * stroke widths and the `#e8823c` ember are copied verbatim from konf.app; the
 * font stack mirrors its `--display`. Redrawing the word as paths (what this
 * used to do) produced a lockup that was subtly not the brand's — no dot, wrong
 * letterforms.
 *
 * Shared by every platform-level screen (`PlatformLanding`,
 * `PlatformUnavailable`) so the two cannot drift apart.
 */
export function PlatformLockup() {
  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="h-14 w-14 flex-none"
        fill="none"
        stroke="#e8823c"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="28" y="20" width="44" height="60" rx="9" strokeWidth="7" />
        <line x1="44" y1="31" x2="56" y2="31" strokeWidth="6" />
        <line x1="42" y1="44" x2="42" y2="70" strokeWidth="7" />
        <path d="M58 44 L45 57 L58 70" strokeWidth="7" />
      </svg>
      <span
        className="text-5xl leading-none font-semibold tracking-[0.01em] text-brand-slate-gray dark:text-[#e9f0f4]"
        style={{
          fontFamily:
            "Futura, 'Avenir Next', 'Century Gothic', system-ui, sans-serif",
        }}
      >
        {PLATFORM_NAME.toLowerCase()}
        <span className="text-[#e8823c]">.</span>
      </span>
    </div>
  )
}
