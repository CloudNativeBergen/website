/**
 * Tagging spec §7: no generated post carries a tag until the opt-out is
 * honoured at generation, save, approval AND publish. Until then an organizer
 * cannot switch `tagSubject` on — not in Studio (the field is read-only) and
 * not through the recipe mutations. #1152 flips this once publish honours a
 * late opt-out.
 */
export const TAG_SUBJECT_SWITCHABLE = false
