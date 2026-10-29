# Conference Platform

Multi-tenant platform for running community IT conferences: call for papers, programme, speakers, sponsors, tickets, and the marketing that fills the room. This glossary covers the marketing, ticketing and session feedback contexts; other contexts join as their terms are sharpened.

## Language

### Marketing

**Marketing Plan**:
The team-owned set of Campaigns for one conference edition, created blank, from a Plan Template, or copied from a previous edition.
_Avoid_: marketing calendar, content plan

**Campaign**:
A group of Tasks in a Marketing Plan that pursue one Outcome over a date window anchored to conference milestones.
_Avoid_: initiative, push, drive

**Task**:
A single unit of marketing work in a Campaign, of one Task Kind, with a due or scheduled time. A publishing Task is tied to one Channel and needs an organizer's approval before it is published; a Task of any other Kind is marked done by hand.
_Avoid_: post (a post is what a publishing Task produces), to-do, action item

**Task Kind**:
The type of work a Task is, which fixes its tool and its completion rule: publishing, studio render, speaker outreach, sponsor outreach, event-page update, or checklist.
_Avoid_: task type, template, action

**Prerequisite**:
Another Task in the same Campaign that should complete first. A waiting Task is shown as such but can still be approved.
_Avoid_: dependency, blocker

**Channel**:
A place where a Task is executed, such as LinkedIn or Bluesky. A Channel is either integrated (published from the platform) or manual (executed by hand and marked done).
_Avoid_: platform, network, medium

**Plan Template**:
A curated, Milestone-relative set of Campaigns, Tasks, Triggers, copy skeletons, and default Targets that seeds a new Marketing Plan. The built-in one ships with the platform in code; an organization owns its own by saving a Marketing Plan as a Template, never by editing one directly.
_Avoid_: playbook, blueprint, preset

**Format**:
The shape and pixel size a studio card is rendered in: square (1080×1080), landscape 1.91:1 (1200×628) or portrait 4:5 (1080×1350). Chosen once per studio tab, recorded on a gallery entry saved from the studio, and carried by a render Task, where it defaults from the Channel. A card without one is square.
_Avoid_: size, aspect ratio, crop, variant

**Task Recipe**:
A description of one Task to create: its Kind, Channel, Milestone offset, Prerequisites and copy skeleton. A recurring Recipe expands into many dated Tasks once its Milestone and subject list are known. Recipes are stored on the Campaign they belong to; a Plan Template is where they come from, not where they are looked up.
_Avoid_: task template, blueprint, rule

**Template Version**:
An immutable saved state of an organization's Plan Template. Every version can seed a plan; restoring one writes a new version with its contents.
_Avoid_: revision, snapshot (a Snapshot is a measurement reading)

**Recipe Library**:
The platform's fixed set of Trigger-driven and recurring Task Recipes that an organizer can attach to any Campaign and then edit: copy, Channels, cadence and window, never the event or subject wiring.
_Avoid_: automations, rule builder

**Trigger**:
A rule on a Campaign that creates draft Tasks from a Task Recipe when a domain event happens, such as a sponsor signing or a speaker confirming.
_Avoid_: automation, hook, rule

**Outcome**:
The one primary measurable result a Campaign is judged against, of a fixed set of types, computed from analytics, platform data, or channel engagement and never entered by hand.
_Avoid_: goal, KPI, conversion, metric

**Target**:
An optional number a Campaign's Outcome is compared against, proposed by the Plan Template.
_Avoid_: goal, quota

**Snapshot**:
A stored daily reading of a Campaign's Outcome and secondary numbers, which the Campaign Ledger and Marketing Report display.
_Avoid_: stats, cache

**Campaign Ledger**:
The per-Campaign admin page that shows the Outcome funnel against its Target and the previous edition, followed by the Campaign's Task table.
_Avoid_: campaign dashboard, campaign stats

**Milestone**:
A named date field on the conference edition, such as CFP close or early-bird end, that Template offsets are expressed against. An unset Milestone yields a flagged provisional date.
_Avoid_: deadline, phase, key date

**Marketing Report**:
A per-edition view of Campaign Outcomes and engagement for the organizer team. Sponsors appear in it as subjects of sponsor Campaigns; sharing it with sponsors is a later slice.
_Avoid_: dashboard, analytics page

### Ticketing

**Ticketing Provider**:
The ticketing vendor a conference sells through: Checkin, Tito or Pretix.
_Avoid_: ticket system, ticket vendor integration

**Ticketing Connection**:
An Organization's own account at a Ticketing Provider: for Pretix, the instance address, the Pretix organizer account and the credentials. Set up by a platform operator, never by the organization's admins.
_Avoid_: integration, credentials (the credentials are only part of it)

**Ticketing Binding**:
A conference edition's link to exactly one event at its Ticketing Provider. Two editions can never claim the same event.
_Avoid_: ticketing config, event mapping

**Pretix organizer account**:
Pretix's top-level account, which owns events, teams and API tokens. Always written out in full, because a bare "organizer" here means a person with admin access to a conference.
_Avoid_: organizer (alone), Pretix organization

**Sold Ticket**:
A non-complimentary ticket of a type that admits an attendee, whether paid or awaiting payment. Sold items that don't admit anyone, such as merchandise or add-ons, count toward revenue only.
_Avoid_: paid ticket, sale

### Session Feedback

**Session Feedback**:
What attendees think of one speaker-led session (a talk of any format, including workshops and keynotes), collected per talk and shared by all its speakers. It combines Feedback Responses and Card Counts.
_Avoid_: review (an organizer's score of a proposal), rating, evaluation

**Feedback Response**:
One anonymous attendee's answer about a session, given by scanning the session's Feedback Code: a Feedback Colour and an optional comment.
_Avoid_: review, vote, submission

**Feedback Colour**:
The three-step scale every piece of Session Feedback uses: green, yellow or red.
_Avoid_: score, stars, rating

**Card Counts**:
The green, yellow and red totals from physical feedback cards collected in the room, entered by an organizer after the session.
_Avoid_: audience feedback, paper votes

**Feedback Code**:
The short code for one session, unique within its conference, that opens the Feedback Response form on the conference's own domain. Its speakers get it as a QR code in the speaker dashboard; only organizers can rotate it, which retires the old code.
_Avoid_: feedback link, session QR, short link (a marketing redirect)

**Fold**:
Turning a session's Feedback Responses into Folded Totals and deleting them: 24 months after its conference ends, or as soon as no speaker of the session is left who has not been erased. A folded session keeps its counts but no comments, and its Feedback Code stops working.
_Avoid_: archive, purge (a fold keeps the counts)

**Folded Totals**:
The green, yellow and red counts a Fold kept on the session (`feedbackFolded`). They count as scanned answers, so a session's totals are the same before and after its Fold.
_Avoid_: archived counts, historical feedback

**Feedback Window**:
The time a session accepts Feedback Responses: from the start of its earliest scheduled slot until 24 hours after its latest slot ends. A session with no slot has no window.
_Avoid_: feedback period, voting window

### Photo Wall

**Photo Wall**:
A conference's shared wall of attendee photos. Anyone with its QR link can contribute a Wall Post, and the approved ones are shown on the public Wall page.
_Avoid_: gallery (an organizer's official photos), social wall, photo booth

**Wall Post**:
One attendee contribution to a Photo Wall: a photo with an optional filter, text and name. It is pending until an organizer approves it, which puts it on the wall, or rejects or removes it, which leaves it not shown; before approval only its contributor and the organizers see it. When the wall's Trusted posters switch is on, a post from a signed-in organizer or confirmed speaker is approved at Submit. Organizers never edit it, except its talk tag, which is metadata, not content ([Photo Wall: photos of my talk](docs/PHOTO_WALL_TALK_PHOTOS_SPEC.md)).
_Avoid_: post (what a marketing publishing Task produces), upload, submission, photo

**Screen Mode**:
The fullscreen presentation of the public Wall page on a venue display.
_Avoid_: slideshow, kiosk, live wall

**Wall Look**:
How a Photo Wall is laid out: Pinboard (tilted polaroid cards), Mosaic (photos at their own shape, with a spotlight tile) or Spotlight (one large post at a time). An organizer sets one per Photo Wall; a single screen can show a different one.
_Avoid_: layout, theme, template (a Plan Template is a marketing term), style

**Posting Window**:
The time a Photo Wall accepts Wall Posts: the conference days, unless an organizer pauses it or opens it early. Outside it the wall can still be viewed.
_Avoid_: upload window, open period, Feedback Window (a Session Feedback term)

### Content Judgement

**Judgement**:
An automatic classifier's typed answer about one piece of user-written content: a Wall Post's caption, a Wall Post's photo, a comment on a Feedback Response, or a Conversation's opening. It is advice to organizers unless enforcement is on for that surface; speakers and attendees never see it.
_Avoid_: verdict, score, moderation result, AI check

**Message Category**:
The topic of a speaker↔organizer Conversation, picked from one fixed list for the whole platform. It is set once when the Conversation opens, and an organizer's change always wins.
_Avoid_: tag, label, folder, topic

**Likely unsafe**:
A Judgement with any moderation answer at or above 0.5 (abusive, sexual, spam or personal details).
_Avoid_: flagged (a speaker flags a comment), blocked, rejected

**Not judged**:
Content that should have a Judgement but has none, because the check was off, failed, timed out, hit the spend cap, or the photo did not arrive. It stays on the usual human path.
_Avoid_: unchecked, safe, pending

**Enforcement**:
A Judgement acting without an organizer: hiding a comment from its speaker until an organizer decides, or holding a Wall Post in not shown. An organization switches it on per surface, and it covers only questions that have proven themselves.
_Avoid_: auto-moderation, auto-reject, blocking

**Shadow mode**:
Running content judgement as advice only while organizers' decisions on flagged content are counted, before enforcement is allowed.
_Avoid_: trial, dry run, silent mode

**Agreement**:
An organizer's decision on flagged content that matches the flag (hide, remove or reject), or a Message Category left unchanged until its Conversation is resolved. Counted anonymously across the platform.
_Avoid_: accuracy, precision, approval rate
