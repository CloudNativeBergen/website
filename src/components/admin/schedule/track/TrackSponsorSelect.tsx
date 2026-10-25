import type { TrackSponsorOption } from '@/lib/schedule/types'

/**
 * The sponsor picker for a track: no sponsor, the Track Sponsorship holders,
 * then the other public sponsors. A sponsor no longer offered (a lost deal)
 * stays selectable, so editing the track never drops them unasked.
 */
export function TrackSponsorSelect({
  id,
  value,
  options,
  onChange,
  className,
}: {
  id?: string
  /** The chosen sponsor's id; '' for none. */
  value: string
  options: TrackSponsorOption[]
  onChange: (sponsorId: string) => void
  className?: string
}) {
  const trackSponsors = options.filter((option) => option.trackAddon)
  const otherSponsors = options.filter((option) => !option.trackAddon)
  const unlisted =
    value !== '' && !options.some((option) => option._id === value)
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">No track sponsor (thank every sponsor)</option>
      {unlisted && (
        <option value={value}>A sponsor no longer shown publicly</option>
      )}
      {trackSponsors.length > 0 && (
        <optgroup label="Track Sponsorship">
          {trackSponsors.map((option) => (
            <option key={option._id} value={option._id}>
              {option.name}
            </option>
          ))}
        </optgroup>
      )}
      {otherSponsors.length > 0 && (
        <optgroup label="Other sponsors">
          {otherSponsors.map((option) => (
            <option key={option._id} value={option._id}>
              {option.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
