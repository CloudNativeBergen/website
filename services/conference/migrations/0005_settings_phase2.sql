-- Settings phase 2 (#2038): links, contact emails and Slack channels.
-- Additive and nullable: null means unset in Sanity. Scalar columns on
-- conferences, not a conference_contacts table: the fields are 1:1 with the
-- edition, and the existing patch, tenancy and parity paths cover them as is.
-- None is a secret: the channels are names, not webhook URLs.
ALTER TABLE conferences ADD COLUMN sponsor_registration_link TEXT;
ALTER TABLE conferences ADD COLUMN speaker_registration_link TEXT;
ALTER TABLE conferences ADD COLUMN volunteer_registration_link TEXT;
ALTER TABLE conferences ADD COLUMN contact_email TEXT;
ALTER TABLE conferences ADD COLUMN cfp_email TEXT;
ALTER TABLE conferences ADD COLUMN sponsor_email TEXT;
ALTER TABLE conferences ADD COLUMN sales_notification_channel TEXT;
ALTER TABLE conferences ADD COLUMN cfp_notification_channel TEXT;
ALTER TABLE conferences ADD COLUMN speaker_slack_channel TEXT;
ALTER TABLE conferences ADD COLUMN speaker_slack_invite_url TEXT;
ALTER TABLE conferences ADD COLUMN volunteer_slack_invite_url TEXT;
