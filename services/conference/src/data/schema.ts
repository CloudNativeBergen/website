// Drizzle mirror of migrations/0001_init.sql.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const conferences = sqliteTable('conferences', {
  conferenceId: text('conference_id').primaryKey(),
  orgId: text('org_id').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull(),
  title: text('title').notNull(),
  tagline: text('tagline'),
  description: text('description'),
  city: text('city'),
  country: text('country'),
  venueName: text('venue_name'),
  venueAddress: text('venue_address'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  visibility: text('visibility', { enum: ['live', 'unlisted'] }).notNull(),
  logoBright: text('logo_bright'),
  logoDark: text('logo_dark'),
  logomarkBright: text('logomark_bright'),
  logomarkDark: text('logomark_dark'),
  backgroundPattern: text('background_pattern'),
  primaryColor: text('primary_color'),
  accentColor: text('accent_color'),
  registrationLink: text('registration_link'),
  socialLinks: text('social_links', { mode: 'json' })
    .$type<string[]>()
    .notNull(),
  homepageSections: text('homepage_sections').notNull(),
})
