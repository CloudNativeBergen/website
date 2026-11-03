// Drizzle mirror of migrations/ (0001-0003).
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const conferences = sqliteTable('conferences', {
  conferenceId: text('conference_id').primaryKey(),
  orgId: text('org_id').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull(),
  title: text('title'),
  tagline: text('tagline'),
  city: text('city'),
  country: text('country'),
  venueName: text('venue_name'),
  venueAddress: text('venue_address'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  visibility: text('visibility', { enum: ['live', 'unlisted'] }).notNull(),
  backgroundPattern: text('background_pattern'),
  primaryColor: text('primary_color'),
  accentColor: text('accent_color'),
  registrationLink: text('registration_link'),
  socialLinks: text('social_links', { mode: 'json' })
    .$type<string[]>()
    .notNull(),
  updatedAt: text('updated_at'),
})
