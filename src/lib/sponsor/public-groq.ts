/**
 * Public sponsor read projections as pure GROQ strings, shared by the site
 * and the sponsors subgraph (services/sponsors, #1772) so both read the same
 * shape. The caller's root filter carries the tenant predicate and the
 * `status == "closed-won"` publication rule literally.
 *
 * `price` is read because the site orders tiers by it and the /sponsor
 * prospectus shows it; the subgraph uses it only to rank tiers and never
 * returns it. Site-only fields the subgraph never needs (maxQuantity,
 * ticketEntitlement) are appended by the site's own queries.
 */

/** A published sponsorship (getPublicSponsorsForConference). */
export const PUBLIC_SPONSOR_FIELDS = `"_sfcId": _id,
      sponsor->{
        _id,
        name,
        website,
        logo,
        logoBright,
      }`

/** A sponsorship's tier, inside `tier->{ ... }`. */
export const PUBLIC_SPONSORSHIP_TIER_FIELDS = `_id,
        title,
        tagline,
        tierType,
        price[]{
          _key,
          amount,
          currency
        }`

/** The order the site lists sponsorships in. */
export const PUBLIC_SPONSOR_ORDER = `order(tier->tierType asc, tier->price[0].amount desc, tier->title asc)`

/** A sponsor tier of the conference (EXPANDED_SPONSOR_TIERS). */
export const PUBLIC_SPONSOR_TIER_FIELDS = `_id,
      _createdAt,
      _updatedAt,
      title,
      tagline,
      tierType,
      price[]{
        _key,
        amount,
        currency
      },
      perks[]{
        _key,
        label,
        description
      },
      soldOut,
      mostPopular`

/** The order the site's tier query returns tiers in. */
export const PUBLIC_SPONSOR_TIER_ORDER = `order(tierType asc, title asc, price[0].amount desc)`
