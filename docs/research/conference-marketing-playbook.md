# Research: best-practice marketing plan for an IT conference as a candidate Plan Template

Research for [#989](https://github.com/CloudNativeBergen/website/issues/989) (parent map: [#987](https://github.com/CloudNativeBergen/website/issues/987), Marketing Plan admin feature). Vocabulary is `CONTEXT.md`'s: **Marketing Plan**, **Campaign**, **Task**, **Channel**, **Plan Template**, **Outcome**, **Milestone**.

**Question.** What does a best-practice digital marketing plan for a community IT conference look like, expressed as Milestone-relative Campaigns and Tasks on LinkedIn and Bluesky? Deliverable: a candidate Plan Template (Campaign → Tasks → offset from Milestone → Channel → Outcome) for the grilling ticket to react to.

> **Source note.** Primary sources are the CNCF Kubernetes Community Days organizer handbook (`cncf/kubernetes-community-days`, incl. its linked "Action Items" sheet and "KCD Marketing Plan" doc), the DevOpsDays organizing guide, the ApacheCon playbook, dated KubeCon and KCD 2026 event pages, LinkedIn Help / Marketing Solutions / Engineering pages, and Bluesky's blog, docs, lexicons and client source. Industry benchmark reports (Socialinsider, Rival IQ, Buffer, Metricool, Bizzabo) are cited with year and sample and marked as secondary. A 1,082-post corpus pulled from 22 conference accounts on Bluesky via the public API is used as observational evidence. Every claim carries one of: **[S]** sourced (first-party, quoted or paraphrased), **[D]** derived by date arithmetic from a dated primary page, **[2nd]** secondary/benchmark report, **[Syn]** our own synthesis.
>
> Placement follows `docs/research/linkedin-api.md` and `docs/research/bluesky-atproto.md`.

## Short answer

A community conference's marketing year is a fixed chain of dated Milestones with well-documented offsets: CFP opens ~16 weeks out and closes no later than 8 weeks out (a binding CNCF rule), speakers are notified ~8 weeks out, the programme launches no later than 6 weeks out (also binding), early bird ends around programme launch, and a documented 2 wk / 1 wk / 2 d / 1 d end-game runs into event week, followed by a 48 h / 1 wk / 2 wk / 6 wk post-event sequence **[S]**. The two Channels behave as near-inverses: LinkedIn rewards a low cadence (2–3/wk, Tue–Thu mornings), native documents and images, few hashtags and tagged Pages; Bluesky rewards a higher cadence (3–5/wk, live-posting during the event, evenings/weekends), bare canonical URLs or link cards, 0–2 exact-cased hashtags that route into custom feeds, and @mentions that notify. Outcomes should be judged per Campaign on one primary number (CFP submissions, tickets vs target, sponsor-page sessions, schedule-page sessions) and LinkedIn engagement rate per impression; Bluesky can only be judged on raw interactions because the API exposes no impressions.

The conference schema already holds seven of the Milestones the Template needs. **It lacks a first-class ticket-sales-open date, early-bird end, registration close, speaker/keynote announcement date, sponsor deadline and recordings-live date** (§0). The candidate Template is in §5.

---

## 0. Milestones the platform already knows

From `sanity/schemaTypes/conference.ts` and `src/lib/conference/{state,phase}.ts`:

| Milestone (Template name) | Schema field | Notes |
| --- | --- | --- |
| `CFP_OPEN` | `cfpStartDate` (required, `date`) | `isCfpOpen()` treats the day as inclusive 00:00–23:59:59 UTC |
| `CFP_CLOSE` | `cfpEndDate` (required) | idem |
| `CFP_NOTIFY` | `cfpNotifyDate` (required) | speaker acceptance/rejection date |
| `PROGRAM_PUBLISHED` | `programDate` (required) | `isProgramPublished()` flips the site into the `execution` phase; this is the schedule-release Milestone |
| `CONFERENCE_START` | `startDate` (required) | |
| `CONFERENCE_END` | `endDate` (required) | `isConferenceOver()` = day after `endDate` |
| `WORKSHOP_REG_OPEN` / `WORKSHOP_REG_CLOSE` | `workshopRegistrationStart` / `End` (`datetime`, optional) | |
| `TICKETS_OPEN` (weak) | `ticketTargets.salesStartDate` | only exists when `ticketTargets.enabled`; described as "When ticket sales officially began" (past tense, informational) |
| `EARLY_BIRD_END` (weak) | `ticketTargets.milestones[].{date,label,targetPercentage}` | free-form dated labels; the schema's own example is `"Early Bird End"`, but nothing types it, so a Template cannot address it reliably |
| — | `registrationEnabled` (boolean), `registrationLink` | a state, not a date |
| — | `isSeekingSponsors()` | heuristic: `startDate − 4 weeks`; no sponsor deadline field |
| — | `homepageCountdown.targetOverride` | countdown target, defaults to `startDate` |

**Milestones the Template needs that the schema lacks (or holds only weakly):**

1. `TICKETS_OPEN` as a first-class date (today buried inside the optional `ticketTargets` object).
2. `EARLY_BIRD_END` (and optionally a `LATE_BIRD_START` / standard→late tier boundary). Today only a free-text label inside `ticketTargets.milestones`.
3. `REGISTRATION_CLOSE` (CNCF's sheet closes registration 1 week out **[S]**).
4. `SPEAKERS_ANNOUNCED` and/or `KEYNOTES_ANNOUNCED`. The CNCF sheet finalises keynotes 6 weeks out and the KCD Marketing Plan starts speaker promotion "1.5 to 2 months out" **[S]**; today the only proxy is `cfpNotifyDate`.
5. `SPONSOR_DEADLINE` (KCD master timeline: sponsor request cutoff 1–2 months out **[S]**) and `PROSPECTUS_PUBLISHED`.
6. `RECORDINGS_LIVE` (CNCF commits to 2 weeks post-event **[S]**).
7. Post-event Milestones can be derived from `CONFERENCE_END` (+2 d, +1 wk, +2 wk, +6 wk) and need no field **[Syn]**.

Where these live (conference document vs the Marketing Plan itself vs `ticketTargets.milestones` typed with an enum) is listed under "Not yet specified" in #987 and is a grilling question, not decided here.

---

## 1. Milestones and the Campaigns run around each (ticket question 1)

### 1.1 The offsets, from primary sources

**Binding rules for a KCD** **[S]**: "Agree to use Sessionize for your CFP, to close it at least 8 weeks before the event, and launch the agenda at least 6 weeks prior to your event." and "Agree to submit your final lineup to kcd@cncf.io for review, prior to publishing it." ([KCD README Terms](https://github.com/cncf/kubernetes-community-days))

**DevOpsDays "Important Dates"** **[S]** ([organizing guide](https://devopsdays.org/organizing/)): T-8 mo prospectus out ("Sponsors, especially larger companies, lock in budgets the financial year prior"); T-7.5 mo CFP out; T-7 mo marketing live; T-6.5 mo registration opens; T-4.5 mo submission voting; T-3.5 mo programme launch **and** early bird closes ("Often paired with launching the program … Reward those that made an investment to purchase a ticket to an event without a program"). Rationale for the CFP floor: "People will usually need at least 4-6 weeks to arrange for travel or time off, and you'll want your call to be open for at least a month, and you'll want at least 2 weeks to consider proposals … close it at least 6-8 weeks before your event."

**CNCF KCD Action Items sheet (dated 2022-08-11)** **[S]** ([CSV export](https://docs.google.com/spreadsheets/d/1pSnKB7KkMthTdo7Hb-Xm-MN7YUoiV88-Pa63xeVUAcA/export?format=csv)): CFP open 18–16 wk out; CFP close 12–10 wk; registration setup 14–12 wk, early-bird registration opens 12 wk; confirmation of speakers 10–8 wk; agenda rough draft 10 wk, detailed agenda 6–8 wk, revised agenda 5 wk, abstracts for publication 4 wk; finalise keynotes 6 wk ("consider curating these instead of having them as part of the CFP"); press plan 16–12 wk. Outbound communications: "Call for speakers — when your CfP opens", "Call for speakers closing — when your CfP closes", "Reminder: Early Bird Reg ending — 8 weeks", "Last chance for hotel room rate — 2 weeks out", "Don't miss out — 1 week out", "Registration closes — 1 week out", "Last chance to attend — 2 days out", "See you soon — 2 days out", "Post conference survey — 1 week post".

**CNCF "KCD Marketing Plan" (2023-07-11)** **[S]** ([doc export](https://docs.google.com/document/d/1vWMCdXlWKgpIMhAGdVBZM5w-W5cJFSVsh7Jaqwhf9dY/export?format=txt)): *3 months out* — save the date, promote CFP, or promote early-bird pricing "on social media & emails"; *1.5–2 months out* — "Send speaker acceptance letter with social copy they can copy and paste to help promote. Ask sponsors to socialize their participation … as soon as they sign"; *1 month out* — "Promote program schedule and speakers", 800-word CNCF blog, social amplification; *2 weeks out* — influencer amplification, possible giveaway; *1 week out* — "CNCF LinkedIn post … videos are best"; *during* — "LIVE photos + videos with unique handle or hashtag"; *post-event* — use-case blog, "Promote YouTube videos", transparency report.

**CNCF amplification constraint** **[S]**: "CNCF's main channels are limited to one organic post per KCD, so we reccomend this being 1 month before your event, or after your agenda has launched." Requests go via CNCF Slack `#socialmedia`; only vendor-neutral posts are amplified. ([marketing-promotion.md](https://github.com/cncf/kubernetes-community-days/blob/main/planning/marketing-promotion.md))

**ApacheCon reminder cadences** **[S]** ([playbook](https://events.apache.org/about/commcode/playbook.html)): "Schedule tweets for CFP deadlines, two months, one month, 2 weeks, 1 week, and last day before close." and "Schedule tweets for all rate change dates, 1 and 2 weeks, and 1 day out from each date."

**Sessionize platform averages** **[S]**: organizers "launch a call for speakers on average 156 days (~5 months) ahead of the event, and they keep it open for 59 days (~2 months)." ([Sessionize playbook](https://sessionize.com/playbook/6-tips-call-for-speakers))

### 1.2 What community-scale events actually do (KCD 2026, from Sessionize "Dates to Remember") **[D]**

| Milestone | Helsinki | New York | Melbourne | SF Bay | Budapest | Suisse Romande | Median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CFP opens (wk before) | 22.3 | 16.1 | 13.7 | 16.0 | 16.3 | 14.4 | **≈16** |
| CFP closes | 13.4 | 11.1 | 9.3 | 11.3 | 6.0 | 10.0 | **≈10–11** |
| CFP window (days) | 62 | 35 | 31 | 33 | 72 | 31 | **≈33** |
| Notifications | 9.3 | 8.1 | 7.3 | 8.7 | — | — | **≈8** |
| Schedule announced | 9.3 | 6.1 | 6.3 | 7.9 | — | — | **≈6–8** |

Sources: [KCD SF Bay Area](https://sessionize.com/kcd-sf-bay-area-2026/), [Melbourne](https://sessionize.com/kcd-melbourne-2026/), [New York](https://sessionize.com/kcd-new-york-2026/), [Helsinki](https://sessionize.com/kcd-helsinki-2026/), [Budapest](https://sessionize.com/kcd-budapest-2026/), [Suisse Romande](https://sessionize.com/kcd-suisse-romande-2026/). For scale, KubeCon runs CFP close ≈23 wk out, notifications exactly 14 wk out, schedule 2 days after notifications, early bird ending ≈26 wk out (long before the schedule) **[D]** ([EU 2026 CFP](https://sessionize.com/kubecon-cloudnativecon-europe-2026/), [NA 2026 CFP](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/cfp/), [NA 2026 registration](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/register/)). Early-bird-before-schedule (KubeCon) vs early-bird-with-schedule (DevOpsDays) are both primary-sourced; the Template follows DevOpsDays because that is the community-scale convention **[Syn]**.

### 1.3 Milestone → Campaign summary

| Milestone | Typical offset (community) | Campaign(s) run around it | Evidence |
| --- | --- | --- | --- |
| Save-the-date | as soon as venue + payment handling exist; ≥6 mo out | placeholder site, event handle, save-the-date post | DevOpsDays "You cannot announce a date until you know you have a way to handle money" **[S]**; KCD 8–9 mo "announce the event there as a placeholder" **[S]** |
| Sponsor prospectus | T-8 mo; cutoff T-1–2 mo | prospectus post, per-signing sponsor cards, "sponsors socialize as soon as they sign" | DevOpsDays **[S]**, KCD master timeline **[S]** |
| CFP open | T-16 wk (KCD median) / T-7.5 mo (DevOpsDays) | launch post, speaker-card graphics for deadlines, direct outreach | **[D]** **[S]** |
| CFP reminders | close −8/−4/−2/−1 wk, last day | countdown posts, extension decision | ApacheCon **[S]**; CNCF published its own "closing" blog 68 d before close **[D]** |
| CFP close | T-10–11 wk, never later than T-8 | last-day push; thank-you + committee transparency | KCD Terms **[S]**; content-management.md "Publish the names of the programming committee" **[S]** |
| Speaker notification | T-8 wk; 2–3 wk after close | acceptance letter *with copy-paste social copy*, first speaker batch, sponsor amplification ask | KCD Marketing Plan **[S]**; "Give speakers at least six weeks of notice" **[S]** |
| Keynote / speaker announcements | keynotes curated 6–7 mo ahead, announced ≈T-12–16 wk with press plan; CFP speakers from T-8 wk | keynote cards, speaker cards, press release | KCD master timeline, Action Items **[S]**. **No handbook prescribes "waves"**; DevOpsDays warns "announcing only a few speakers can lead to unwarranted assumptions about your demographics" **[S]** |
| Tickets open / early bird | T-12 wk (KCD) / T-6.5 mo (DevOpsDays); early bird 10–25 % off | launch email+social, invite waves | KCD registration.md **[S]** |
| Early-bird end | T-8 wk (KCD sheet) / with programme launch (DevOpsDays) | rate-change cadence 2 wk / 1 wk / 1 d | **[S]** |
| Programme release | T-6–8 wk; floor T-6 | 800-word blog, the one CNCF amplification, newsletter, per-talk teasers | **[S]** |
| Final push | T-4 wk → T-2 d | late-bird, hotel deadline T-2 wk, "don't miss out" T-1 wk, registration closes T-1 wk, "last chance" T-2 d | CNCF sheet **[S]**; DevOpsDays: "it is normal to get a spike in ticket sales in the last two weeks" **[S]** |
| Event days | | live photos/video on the hashtag; announce next edition from stage | KCD Marketing Plan, ApacheCon **[S]** |
| Post-event | +48 h photos/thanks; +1 wk survey & recap; +2 wk recordings (KubeCon FAQ says 48–72 h, schedule page says 2 wk — both first-party); +4–6 wk transparency report | recap, video drip, sponsor thank-you roll-call, next-year save-the-date | **[S]** **[Syn]** |

DevOpsDays also lists the *demand spikes* a plan should schedule around **[S]**: tickets announced, early bird ends, speakers announced, agenda announced, ticket codes go out to sponsors/speakers/volunteers, fiscal quarter roll-over, any reminder email, the last two weeks.

---

## 2. Cadence and content types per Channel (ticket question 2)

| | LinkedIn organization Page | Bluesky account |
| --- | --- | --- |
| Floor | 1×/week: "Companies that post weekly see a 2x lift in engagement" **[S]** ([Pages best practices](https://business.linkedin.com/marketing-solutions/linkedin-pages/best-practices)) | none published; ≈3×/week **[Syn]** |
| Working cadence | 2–5×/week **[2nd]** (Buffer 2026, 5.5 M posts); CNCF asks KCDs for "one organic post per day" after the pinned launch post **[S]** | 1–3×/day tolerated **[2nd]**; live-post freely during the event **[Syn]** |
| Ceiling | none published; LinkedIn's own "4/day" describes staffed brands **[S]**; notify-employees ≤1×/week **[S]** | 1,666 creates/hour technical **[S]**; editorial ≈5/day **[Syn]** |
| Best window | mornings, "slight bump again after business hours" **[S]**; Tue–Thu 08–10 local **[2nd]** (Hootsuite 2025). LinkedIn itself: "Your own research is the only way to truly know when your content should be shared" **[S]** | none first-party; Buffer 2026 (3 M posts): Sat/Sun afternoon best, weekdays 18–21, Thursday worst **[2nd]** |
| Formats ranked | Socialinsider 2025 (1.3 M posts, 16,645 Pages) ER: document/carousel 7.00 % > multi-image 6.45 % > video 6.00 % > image 5.30 % > text 4.50 % > poll 4.20 % > **link post 3.25 %**; average 5.20 % **[2nd]**. LinkedIn's own: "Images typically result in a 2x higher comment rate", "Video gets 5x more engagement", 3–4-image collages recommended **[S]** | image posts (≤4) with alt text, threads, link cards; video ≤60 s; **no native polls** **[S]** **[Syn]** |
| Specs | image PNG/JPEG ≤3 MB, link preview 1.91:1 = 1200×627 **[S]**; documents PDF ≤100 MB/300 pages **[S]**; video 3 s–10 min ≤5 GB **[S]**; post text 3,000 chars **[S]** ([Help a528176](https://www.linkedin.com/help/linkedin/answer/a528176)); "see more" fold ≈3 rendered lines (~210 desktop / ~140 mobile chars) **[2nd]** | text 300 graphemes / 3,000 bytes; ≤4 images ≤2 MB each (lexicon; prose docs still say 1 MB), `alt` required field; link-card thumb ≤1 MB; 25-line feed clamp; video ≤60 s, 1/post **[S]** |
| Link handling | **No first-party statement that links are demoted.** LinkedIn's ranking pages name identity/content/activity signals, not links **[S]**; its marketing blog claims "Page updates with links can see up to a 45% higher follower engagement" **[S]**; the only named demotion is engagement bait **[S]**. The checkable counter-number is Socialinsider's link posts at 3.25 % vs 5.20 % **[2nd]**. Van der Blom's "−18.8 % reach" and "comment links now suppressed too" could not be fetched first-hand **[2nd, unverified]** | link cards first-class; client-side card build from OG tags; displayed URL is shortened by the official client (host + 13 path chars), so a full UTM URL costs ≈25–30 graphemes **[S]**; no documented reach cost **[S]** |
| Hashtags | "Identify 3-5 hashtags" **[S]** but hashtag following/suggestions removed late 2024 and search moved to semantic retrieval **[S]** **[2nd]** → 3 max, last line **[Syn]** | search/filter primitives and custom-feed routing, no ranking boost **[S]**; ≤8 allowed, 0–2 used by credible accounts (corpus mean 1.75) **[Syn]** |
| Killer feature | @mention every speaker and sponsor Page; LinkedIn Event with the Page as organizer **[S]** | starter pack of speakers (≤150 people, QR code) **[S]**; domain handle as verification **[S]** |

Practical consequence for the Template **[Syn]**: never cross-post identically. LinkedIn gets 2–3 Tasks/week in normal weeks (daily only in the final 3–4 weeks), morning slots, document/image formats, link in body only for conversion Tasks. Bluesky gets 3–5 Tasks/week, evening/weekend slots, bare canonical URL or card, mentions, alt text, and unlimited live Tasks on event days.

Cadence ceilings the Template should respect **[Syn]**: LinkedIn ≤1 Page post/day outside event week and ≤3 countdown posts total; Bluesky ≤3/day outside event week. Both derive from the sources above, not from platform hard limits.

---

## 3. Outcomes per Campaign and benchmarks (ticket question 3)

Definitions matter. LinkedIn's Page analytics define engagement rate as "the ratio of interactions per impressions on your post. Interactions include clicks, reactions, comments, and shares", CTR as clicks ÷ impressions, and "clicks" as clicks on content, company name **or logo** **[S]** ([LMS Help a564051](https://www.linkedin.com/help/lms/answer/a564051)). Socialinsider uses the same per-impression formula; Rival IQ uses per-follower — the two medians (5.20 % vs 0.41 %) are not comparable **[2nd]**. Bluesky exposes no impressions, so **Bluesky Outcomes are raw interactions (likes + reposts + replies + quotes), never a rate** **[S]** **[2nd]**.

| Campaign type | Primary Outcome | Secondary Outcomes | Benchmark (community scale) | Source |
| --- | --- | --- | --- | --- |
| CFP | CFP submissions (already in Sanity as proposals) | CFP-page sessions by `utm_campaign`, first-time speakers | KCDs "regularly receive in excess of 160 presentation submissions" **[S]**; ~15–25 slots ⇒ 10–15 % acceptance **[D]**. KubeCon ≈9–11 % is the wrong target | [CNCF blog](https://www.cncf.io/blog/2023/04/26/introducing-sessionize-a-new-cfp-platform-for-cncf-events/), [NA 2024 numbers](https://www.cncf.io/blog/2024/08/19/inside-the-numbers-the-kubecon-cloudnativecon-selection-process-for-north-america-2024/) |
| Tickets open / early bird | tickets sold vs target curve (`src/lib/tickets/`) | ticket-page sessions, purchase attribution (Tito only) | early bird ≈"15% of the expected ticket sales (e.g., of 400, 60 early birds)" **[S]** | [DevOpsDays](https://devopsdays.org/organizing/) |
| Speaker / programme | schedule-page sessions; ticket spike | LinkedIn ER on speaker cards | "speaker/agenda announcement gain another decent spike (~10% of expected sales)" **[S]** | DevOpsDays |
| Final push | tickets at T-4 wk and at close | registration-page conversion | "40-50% of expected ticket sales minus sponsors, speakers, organizers, and volunteers by a month or so out … if you announced your agenda late … 25-30%" **[S]**; visit→registration 21.5 % **[2nd]** (Bizzabo 2026) | DevOpsDays; [Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics) |
| Sponsor acquisition | signed sponsors / revenue vs budget (sponsor CRM) | sponsor-page sessions, prospectus clicks | timing, not a rate: prospectus T-8 mo, cutoff T-1–2 mo; "80% or more of your expected expenses covered by sponsors" **[S]**. No prospectus-download→signed benchmark exists anywhere | DevOpsDays; KCD master timeline |
| LinkedIn awareness (any Campaign) | ER per impression | impressions, follower growth | 3–5 % typical, 6–7 % stretch on documents **[2nd]**; follower growth >1.5 %/month for Pages <5 K **[2nd]** (Rival IQ 2024); organic reach contracting (−23 % impressions YoY, Metricool 2026) **[2nd]**; personal profiles ≈63 % higher ER than Pages **[2nd]** → speaker/organizer reshares matter | [Socialinsider](https://www.socialinsider.io/social-media-benchmarks/linkedin), [Rival IQ](https://www.rivaliq.com/blog/linkedin-benchmark-report/), [Metricool](https://metricool.com/press-release-linkedin-study-2026/) |
| LinkedIn link Tasks | link clicks ÷ impressions **measured by us** | sessions by `utm_content` | no credible first-party benchmark; "3–5 %" is folklore with mixed denominators **[2nd]** | — |
| Bluesky (any Campaign) | interactions per post | follower growth, referral sessions | median ≈4 interactions/post (Buffer, 1.7 M posts 2025), mean 16 (Metricool 2026, 39.8 M posts) **[2nd]** | [Buffer](https://buffer.com/resources/x-threads-bluesky-data/), [Metricool](https://metricool.com/press-release-2026-social-media-study/) |
| Post-event | recording clicks, recap sessions | follower retention, sponsor report | none sourced | — |

What the platform can already compute without manual entry **[Syn]**: CFP submissions (proposal documents), tickets vs target (ticket series), sponsor pipeline (sponsor CRM), sessions by `utm_campaign`/`utm_content` once PostHog replaces Pirsch (scheme from `docs/research/link-attribution.md`), Bluesky interactions (unauthenticated reads per `docs/research/bluesky-atproto.md`), and LinkedIn engagement only once the Community Management API is approved (`docs/research/linkedin-api.md`), so slice 1 measures LinkedIn Tasks by attributed sessions alone.

Gaps we could not close: no Sessionize aggregate CFP stats, no DevOpsDays per-event submission counts, no Bluesky engagement *rate* benchmark (structurally impossible), no conference-vertical ticket-sales curve from a ticketing vendor (Eventbrite's widely quoted "57 % sold in the last week" is music/nightlife data), no channel-attribution study for registrations that is not a marketer-opinion survey.

---

## 4. Copy conventions (ticket question 4)

### Corrections to common assumptions

- CNCF's documented KCD hashtags are **`#KubernetesCommunity` and `#CloudNativeCommunity`** plus "your own event hashtag with 'KCD' and your city name or inititials and the year" (sic) **[S]**. Not `#KCD`, not `#CNCF`.
- There is **no required `@CloudNativeFdn` mention**. Amplification is requested in CNCF Slack `#socialmedia`; CNCF's Bluesky handle is `@cncf.io` **[S]**.
- **No CNCF organizer document mentions Bluesky at all**, and `templates.md` has LinkedIn/X/Instagram Canva templates only **[S]**. The foundation-wide social policy is Twitter-only and stale **[S]**.
- "KubeCon" alone is not permitted; write "KubeCon + CloudNativeCon" **[S]** ([branding guidelines](https://www.cncf.io/kubecon-cloudnativecon-branding-guidelines/)).

### LinkedIn Page

- **Hashtags**: LinkedIn says 3–5 **[S]**; given the late-2024 removal of hashtag following and the shift to semantic search **[S]** **[2nd]**, use ≤3 on the last line and put real keywords (city, technology, company) in prose **[Syn]**.
- **Mentions**: mentioned members "will receive email and app notifications" (documented for member posts; Page-post behaviour undocumented) **[S]**; no numeric cap documented; the "tagging non-engagers is penalised" claim is Van der Blom, not LinkedIn **[2nd]**. Tag the speaker and their employer Page when they are the subject; move "thanks to all 14 sponsors" roll-calls to the first comment or a carousel **[Syn]**.
- **Links**: for conversion Tasks (CFP deadline, tickets, registration open) put the link **in the body** — LinkedIn's own guidance supports it and unconverted reach is worthless; link-in-first-comment only for awareness Tasks; never a bare URL with no framing; never "like and share" (inside LinkedIn's spam definition **[S]**) **[Syn]**.
- **Length**: 3,000 chars **[S]**; design for a 3-line fold: line 1 is the complete news, blank line, detail, hashtags last; 600–1,200 chars for speaker/sponsor/recap, 300–500 for deadline Tasks; never open with "We are excited to announce" **[Syn]**.
- **Alt text**: "LinkedIn may automatically add alt-text to images that don't have it", alerting on desktop only **[S]**; auto-alt on a speaker card drops the name/title/date, so always hand-write: `Speaker card: {Name}, {Role} at {Company}. Talk: "{Title}". {Event}, {Date}.` **[Syn]**.
- **LinkedIn Event**: a Page can create an Event with an external registration link **[S]**; create it at `TICKETS_OPEN` **[Syn]**.

### Bluesky

- **Hashtags** are `facet#tag` and route into search and keyword-built custom feeds **[S]**; they are exact-match strings, so pick one canonical casing per tag and keep it forever **[Syn]**. Corpus: mean 1.75/post, 39 % of posts have none; credible community accounts run 0–2 **[observational]**.
- **Mentions** resolve to a DID and "Produce a notification for the mentioned user" **[S]**; the official client silently strips unresolved mentions, so resolve handles before scheduling **[S]**. Only 13 % of corpus posts mention anyone — the most under-used lever. Mention speaker and employer; for people not on Bluesky use `Name (Company)` **[Syn]**.
- **Links**: no server-side unfurl, the card is built from OG tags at post time and frozen **[S]**; image embed and external card are mutually exclusive **[S]**; the client shortens displayed URLs so a full UTM URL costs ≈25–30 graphemes **[S]**. Do not use shorteners (corpus shows `lnkd.in` and `bit.ly` links on Bluesky, an unmistakable cross-post tell) **[Syn]**. Speaker/sponsor/countdown Tasks: image + bare URL on its own line; CFP/schedule Tasks: link card **[Syn]**.
- **Length**: 300 graphemes / 3,000 bytes / 25-line clamp **[S]**; corpus mean 34.7 words; target 30–45 words, thread instead of compress **[Syn]**.
- **Alt text**: required field but may be empty; "Require alt text before posting" is a per-device setting; `MAX_ALT_TEXT = 2000` **[S]**. Corpus: 7 % of images have alt text; `@cncf.io` 0 of 55; NDC Conferences 36 of ~40 **[observational]**. Enforce non-empty alt in the Task composer **[Syn]**.
- **Emoji**: ~68 % of corpus posts use them; the reusable grammar is line-leading field markers (`🗓️` date, `📍` venue, `🎟️` tickets, `⏰` deadline, `🥇/🥈` tiers, `💙` sign-off); keep to line starts, never runs, because screen readers read every one aloud **[Syn]**.

### Cross-channel rules **[Syn]**

1. Write the substance once, adapt per Channel; never post identical text.
2. One CTA per Task, imperative, destination named ("Submit your talk", "Register", "Watch the talks").
3. CNCF voice applies to KCD-branded editions: "Inclusive, Useful, Encouraging, Open, Informative, Personable", gender-neutral, vendor-neutral aside from sponsor mentions **[S]**.
4. Spend the single CNCF main-channel amplification at `PROGRAM_PUBLISHED` or T-4 wk **[S]**.

### Skeletons per content type (compact; see the Q4 corpus for 40 real examples)

| Content type | LinkedIn (600–1,200 chars, link in body if conversion) | Bluesky (30–45 words, bare URL or card) |
| --- | --- | --- |
| Speaker card | `{Name} is bringing {concrete thing} to {Event}.` ¶ why it matters ¶ `🎙️ "{Title}"` `🗓️ {Date} · 📍 {Venue}` ¶ `Full programme → {url}` ¶ 3 tags; tag speaker + employer Page | `🎙️ {Name} ({Company}) is speaking at {Event}.` ¶ `"{Title}" — {hook}` ¶ `🗓️ {Date} · 📍 {City}` `{url}` ¶ `#{EventTag}`; mention `@speaker @company` |
| Sponsor thank-you | one sponsor per post: tier, what they do in the audience's words, where to find them; tag Page | `🥇 Gold sponsor: @{sponsor}` ¶ one plain sentence ¶ `Thanks for making {Event} happen 💙` |
| Talk teaser | sharp technical question ¶ `{Name} ({Company}) answers it at {Event} — including {specifics}` ¶ title, day, time ¶ `Schedule → {url}` | provocative question ¶ `@{speaker} has the answer — and the graphs.` ¶ title, day, `{url}` |
| Countdown | ≤3 total: `{N} weeks until {Event}.` + one programme fact + `{X} tickets left → {url}` | daily from T-30 d: `{N} days until {Event}.` + one rotating detail + `🎟️ {url}` |
| CFP open / last call | `The {Event} CFP is open until {Date}.` ¶ the talks you want, first-timers welcome, mentoring ¶ `Submit → {url}` | `🚨 {Event} CFP closes {when}.` ¶ `That {incident / migration} you're still thinking about? That's the talk.` ¶ `{url}` |
| Last-call tickets | `Early bird for {Event} ends {Date}.` ¶ what the ticket includes, flatly ¶ `{url}`; only post scarcity you can evidence | `🐦 Last day for early bird tickets.` ¶ `{Event} · {Date} · {City}` ¶ `🎟️ {url}` |
| Recap | numbers + one human detail + thanks to speakers/sponsors/volunteers + `Videos land {when} → {url}`; transparency-report variant with `📈 ♿ 🎓` lines | `That's a wrap on {Event} {Year} 🇳🇴` ¶ numbers, one detail ¶ `Thank you 💙`; then one talk/day video drip |

---

## 5. Candidate Plan Template

Conventions: offsets are relative to the named Milestone (`−` before, `+` after; `d` days, `wk` weeks). Channel `LI` = LinkedIn Page (manual Task in slice 1), `BS` = Bluesky (integrated). Milestones marked `*` do not exist in the schema today (§0). Outcome = the primary number the Campaign is judged on; every Task also carries `utm_source=<channel>&utm_medium=social&utm_campaign=<campaign>&utm_content=<task>`. "Sourced" cites the offset's origin; where none is given the row is **[Syn]** from §1–§4.

| # | Campaign | Task | Offset from Milestone | Channel | Outcome | Sourced |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Save the date** | Announce date + venue, placeholder site | `CONFERENCE_START −26 wk` (or on plan creation if later) | LI + BS | site sessions, follower growth | KCD "3 months out" save-the-date; DevOpsDays T-7 mo marketing **[S]**; 26 wk **[Syn]** |
| 1 | | Set domain handle, pin launch post, create LinkedIn Event | same | BS / LI | — (setup) | Bluesky domain handle **[S]**; LinkedIn Event **[S]** |
| 2 | **Sponsor acquisition** | Prospectus published post ("why sponsor", what it funds) | `SPONSOR_DEADLINE* −24 wk` (≈ `CONFERENCE_START −32 wk`) | LI (link in body) + BS (card) | sponsor-page sessions; signed sponsors vs budget | DevOpsDays T-8 mo **[S]** |
| 2 | | Sponsor card per signing (one sponsor per post) | event-driven: on sponsor confirmed (not an offset) | LI (tag Page) + BS (mention) | sponsor-page sessions, ER | "Ask sponsors to socialize … as soon as they sign" **[S]** |
| 2 | | Sponsorship last call | `SPONSOR_DEADLINE* −2 wk` | LI | sponsor-page sessions | KCD cutoff 1–2 mo out **[S]**; −2 wk **[Syn]** |
| 3 | **CFP** | CFP open announcement | `CFP_OPEN +0` | LI (link in body) + BS (card) | CFP submissions; CFP-page sessions | CNCF sheet "when your CfP opens" **[S]** |
| 3 | | "You have a talk in you" barrier-lowering post | `CFP_OPEN +1 wk` | LI + BS | CFP-page sessions | DevOpsDays "need some extra calls" **[S]**; +1 wk **[Syn]** |
| 3 | | CFP reminder | `CFP_CLOSE −4 wk`, `−2 wk`, `−1 wk` | BS each; LI at −2 wk and −1 wk | CFP submissions | ApacheCon cadence **[S]** (its −2 mo / −1 mo steps collapse into the KCD 33-day window **[D]**) |
| 3 | | CFP last day | `CFP_CLOSE +0` (morning) | LI + BS | CFP submissions | ApacheCon "last day before close" **[S]** |
| 3 | | Thank-you + "N submissions, committee is …" | `CFP_CLOSE +1 d` | BS (LI optional) | ER | committee transparency **[S]**; timing **[Syn]** |
| 4 | **Tickets open / early bird** | Tickets-open announcement with early-bird price | `TICKETS_OPEN* +0` | LI (link in body) + BS (card) | tickets sold vs target; ticket-page sessions | KCD 12 wk out **[S]** |
| 4 | | Early-bird reminder | `EARLY_BIRD_END* −2 wk`, `−1 wk` | BS each; LI at −1 wk | tickets sold (≈15 % of expected by early-bird end) | ApacheCon rate-change cadence; DevOpsDays 15 % **[S]** |
| 4 | | Early-bird last day | `EARLY_BIRD_END* +0` | LI + BS | tickets sold | **[S]** |
| 5 | **Keynotes** | Keynote card per keynote (+ press release if any) | `KEYNOTES_ANNOUNCED*` (default `CFP_NOTIFY −4 wk`) | LI (tag speaker + employer) + BS (mention) | ticket spike, schedule-page sessions, ER | keynotes curated ahead of CFP, press plan 16–12 wk **[S]**; default offset **[Syn]** |
| 6 | **Speakers** | Acceptance-letter social kit (copy + card per speaker) | `CFP_NOTIFY +0` | (email, not a Channel Task; produces per-speaker assets) | speaker reshares (counted as engagement) | "canned copy in the speaker acceptance letter" **[S]** |
| 6 | | First speaker batch ("lineup taking shape", multi-image/carousel) | `CFP_NOTIFY +1 wk` | LI (document/multi-image) + BS (≤4 images) | schedule-page sessions, ER, ticket spike (~10 %) | KCD "1.5–2 months out" **[S]**; DevOpsDays caution against tiny partial announcements **[S]** |
| 6 | | Speaker card, recurring | from `CFP_NOTIFY +1 wk` to `CONFERENCE_START −1 wk`: LI 2/wk, BS 3–5/wk (or 1/day in the final 4 wk) | LI + BS | ER, schedule-page sessions | cadence §2 **[Syn]** |
| 7 | **Programme launch** | Schedule is live (LI document carousel; BS card + thread) | `PROGRAM_PUBLISHED +0` | LI + BS | schedule-page sessions; ticket spike | KCD Terms ≥6 wk; DevOpsDays "program absolutely drives visibility" **[S]** |
| 7 | | Request CNCF amplification (vendor-neutral post) | `PROGRAM_PUBLISHED +1 d` | LI + BS (the post CNCF reposts) | follower growth, impressions | "one organic post per KCD … after your agenda has launched" **[S]** |
| 7 | | Talk teaser, recurring | `PROGRAM_PUBLISHED +1 wk` → `CONFERENCE_START −1 wk`, LI 1/wk, BS 2/wk | LI + BS | schedule-page sessions | **[Syn]** |
| 7 | | Starter pack of speakers + organizers | `PROGRAM_PUBLISHED +2 d` | BS | follower growth | starter packs ≤150 people **[S]**; timing **[Syn]** |
| 8 | **Final push** | Late-bird / "tickets are moving" (only evidenced scarcity) | `CONFERENCE_START −4 wk` | LI (link in body) + BS | tickets sold (target 40–50 % of expected at −4 wk) | DevOpsDays benchmarks; KCD "increase marketing if needed" **[S]** |
| 8 | | Countdown | BS daily from `CONFERENCE_START −30 d`; LI at `−3 wk`, `−1 wk`, `−1 d` only | BS / LI | ticket-page sessions, ER | corpus (DevOpsDays London daily from day 30) **[observational]**; LI cap **[Syn]** |
| 8 | | Hotel / travel deadline | `CONFERENCE_START −2 wk` | LI + BS | info-page sessions | CNCF sheet **[S]** |
| 8 | | "Don't miss out" + registration closes | `REGISTRATION_CLOSE*` (default `CONFERENCE_START −1 wk`) | LI + BS | tickets sold | CNCF sheet **[S]** |
| 8 | | "Last chance to attend" / "See you soon" | `CONFERENCE_START −2 d` | LI + BS | tickets sold | CNCF sheet **[S]** |
| 9 | **Event week** | Doors-open / practical info | `CONFERENCE_START −1 d` | LI + BS | — | **[Syn]** |
| 9 | | Live posts (on-stage-now, photos, quotes) | `CONFERENCE_START +0` → `CONFERENCE_END`; BS unlimited, LI ≤2/day | BS (LI light) | interactions, follower growth, hashtag adoption | "LIVE photos + videos with unique handle or hashtag" **[S]** |
| 9 | | Announce next edition | `CONFERENCE_END +0` (from stage, then post) | LI + BS | next-edition site sessions | ApacheCon "Announce the next event after the keynote" **[S]** |
| 10 | **Post-event** | Thank-you + photo album; sponsor roll-call (tags in first comment / carousel) | `CONFERENCE_END +2 d` | LI + BS | ER, sponsor-page sessions | KCD "Send thank you emails … Post photos" **[S]**; +48 h **[Syn]** |
| 10 | | Survey + recap blog | `CONFERENCE_END +1 wk` | LI (document or link) + BS (card) | recap sessions, survey responses | CNCF sheet "Post conference survey — 1 week post" **[S]** |
| 10 | | Recordings live | `RECORDINGS_LIVE*` (default `CONFERENCE_END +2 wk`) | LI + BS | video clicks | LF "within two weeks" **[S]** |
| 10 | | Video drip (one talk per post) | `RECORDINGS_LIVE* +1 d` → `+3 wk`, BS 1/day, LI 2/wk | BS + LI | video clicks, ER | corpus (CNS Munich) **[observational]** |
| 10 | | Transparency report + next-year save-the-date | `CONFERENCE_END +6 wk` | LI + BS | report sessions, follower retention | KCD Terms transparency report **[S]**; +6 wk **[Syn]** |

Rendered on the KCD medians (§1.2) for a conference on day 0, the Template produces roughly: sponsor prospectus −32 wk, save-the-date −26 wk, CFP open −16 wk, tickets open −12 wk, CFP close −10 wk, notifications −8 wk, programme + early-bird end −6 wk, final push −4 wk → 0, post-event +2 d / +1 wk / +2 wk / +6 wk **[Syn]**.

### Design observations for the grilling ticket **[Syn]**

1. **Two Task kinds fall out of the sources**: dated (offset from a Milestone) and *event-driven* (sponsor signed, speaker confirmed, keynote booked). The Template can only express the first; the second needs either a trigger in the domain model or a manual "add sponsor card" action. Recurring Tasks ("speaker card 2/wk until …") are a third shape.
2. **Milestones must be per-edition dates, not derived from `startDate`** for the ones organizers actually move (early-bird end, registration close, recordings). §0 lists what is missing.
3. **Channel-specific Task variants are not optional**: length, link placement, hashtags and slot all differ. A Task should own one Channel (as `CONTEXT.md` already says), and the Template should seed the LI and BS Tasks of one beat as siblings, not one Task cross-posted.
4. **Ceilings are a Template property**: LI ≤1/day outside event week, ≤3 countdowns; BS ≤3/day outside event week. Copying a previous edition's plan should re-check them.
5. **Outcomes split cleanly** into what the platform already holds (submissions, tickets, sponsors, attributed sessions) and channel engagement (Bluesky now, LinkedIn later). Each Campaign in the table names exactly one primary Outcome, which is what a Marketing Report row needs.
6. **CFP acceptance letters and speaker kits are marketing assets** in every handbook, but they are email, not a Channel; the plan should at least produce the per-speaker card and copy that the letter links to.

---

## 6. Sources

**CNCF / Linux Foundation / community handbooks (first-party)**
- https://github.com/cncf/kubernetes-community-days (README Terms)
- https://github.com/cncf/kubernetes-community-days/blob/main/planning/master-timeline.md
- https://github.com/cncf/kubernetes-community-days/blob/main/planning/marketing-promotion.md
- https://github.com/cncf/kubernetes-community-days/blob/main/planning/content-management.md
- https://github.com/cncf/kubernetes-community-days/blob/main/planning/registration.md
- https://github.com/cncf/kubernetes-community-days/blob/main/planning/about-organizing.md
- https://github.com/cncf/kubernetes-community-days/blob/main/planning/your-logo.md · templates.md
- https://docs.google.com/spreadsheets/d/1pSnKB7KkMthTdo7Hb-Xm-MN7YUoiV88-Pa63xeVUAcA/export?format=csv (KCD Action Items, 2022-08-11)
- https://docs.google.com/document/d/1vWMCdXlWKgpIMhAGdVBZM5w-W5cJFSVsh7Jaqwhf9dY/export?format=txt (KCD Marketing Plan, 2023-07-11)
- https://github.com/cncf/communitygroups/blob/main/branding.md · README.md
- https://github.com/cncf/foundation/blob/main/policies-guidance/social-guidelines.md
- https://www.cncf.io/kubecon-cloudnativecon-branding-guidelines/
- https://devopsdays.org/organizing/
- https://events.apache.org/about/commcode/playbook.html
- https://sessionize.com/playbook/6-tips-call-for-speakers

**Dated event pages (first-party)**
- https://sessionize.com/kubecon-cloudnativecon-europe-2026/ · https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/cfp/ · https://events.linuxfoundation.org/kubecon-cloudnativecon-europe/program/cfp/ · https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/register/ · …/program/schedule/ · …/attend/faq/
- https://sessionize.com/kcd-sf-bay-area-2026/ · kcd-melbourne-2026 · kcd-new-york-2026 · kcd-helsinki-2026 · kcd-budapest-2026 · kcd-suisse-romande-2026
- https://www.cncf.io/blog/2025/08/05/the-cfp-for-kubecon-cloudnativecon-europe-2025-is-closing-12-october/
- https://www.cncf.io/blog/2024/08/19/inside-the-numbers-the-kubecon-cloudnativecon-selection-process-for-north-america-2024/
- https://www.cncf.io/blog/2023/04/26/introducing-sessionize-a-new-cfp-platform-for-cncf-events/
- https://www.cncf.io/blog/2024/11/26/the-ultimate-kubecon-cloudnativecon-north-america-2024-recap-the-cncf-ambassadors-edition/

**LinkedIn (first-party)**
- https://business.linkedin.com/marketing-solutions/linkedin-pages/best-practices
- https://www.linkedin.com/business/marketing/blog/social-media-marketing/how-to-grow-your-organic-following-on-linkedin
- https://www.linkedin.com/business/marketing/blog/linkedin-pages/whats-the-optimal-frequency-of-updates-on-a-company-or-showcase-page-asklms
- https://www.linkedin.com/business/marketing/blog/linkedin-pages/10-content-ideas-for-your-linkedin-page
- https://www.linkedin.com/business/marketing/blog/content-marketing/why-i-ll-never-tell-you-when-to-post-on-linkedin
- https://www.linkedin.com/blog/member/product/keeping-your-feed-relevant-and-productive
- https://www.linkedin.com/blog/engineering/search/introducing-semantic-capability-in-linkedins-content-search-engine
- Help: a1339724 (relevance), a9554004 (feed ranking), a1338787 (spam), a528176 (3,000 chars), a563309 (images), a1311816 (video), a518909 (documents), a519856 (alt text), a525082 (mentions), a567075 (Page posts), a552496 · a554183 (Events); LMS a564051 (Page content analytics definitions)

**Bluesky (first-party)**
- https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json · embed/images.json · embed/external.json
- https://bsky.network/docs/about-bluesky-content/post-richtext · /posts · rate-limits (bsky-docs repo)
- https://github.com/bluesky-social/social-app/blob/main/src/lib/constants.ts · src/lib/strings/url-helpers.ts · rich-text-manip.ts · locale/locales/en/messages.po
- https://bsky.social/about/blog/05-31-2024-search · 7-27-2023-custom-feeds · 06-26-2024-starter-packs · 09-11-2024-video · 4-28-2023-domain-handle-tutorial · 10-31-2025-building-healthier-social-media-update
- https://github.com/bluesky-social/atproto/discussions/3517 (link character counting)
- `public.api.bsky.app` `getAuthorFeed` over 22 conference accounts, 1,082 posts (observational corpus; exemplars: [KCD UK](https://bsky.app/profile/kcduk.bsky.social/post/3lq3lncn3ua2r), [NDC Conferences](https://bsky.app/profile/ndcconferences.com/post/3mugz53l7as2o), [Cloud Native Days Italy](https://bsky.app/profile/cloudnativedaysitaly.org/post/3mqo5papfnu27), [CNCF CFP post](https://bsky.app/profile/cncf.io/post/3mrmydflfos2k))

**Secondary / benchmark reports (labelled [2nd] above)**
- Socialinsider LinkedIn benchmarks 2026 (1.3 M posts, 16,645 Pages, 2024–2025): https://www.socialinsider.io/social-media-benchmarks/linkedin
- Rival IQ 2024 LinkedIn Benchmark Report (58 K posts): https://www.rivaliq.com/blog/linkedin-benchmark-report/
- Buffer benchmarks 2026: https://buffer.com/resources/social-media-benchmarks/ · https://buffer.com/resources/best-time-to-post-on-bluesky/ · https://buffer.com/resources/x-threads-bluesky-data/ · https://buffer.com/resources/state-of-social-media-engagement-2026/
- Metricool 2026 studies: https://metricool.com/press-release-linkedin-study-2026/ · https://metricool.com/press-release-2026-social-media-study/
- Hootsuite best time to post on LinkedIn (2025): https://blog.hootsuite.com/best-time-to-post-on-linkedin/
- Bizzabo 2026 event marketing statistics: https://www.bizzabo.com/blog/event-marketing-statistics
- Eventbrite marketing timeline and sales-curve posts (music/festival vertical): https://www.eventbrite.co.uk/blog/event-marketing-timeline-ds00/ · https://www.eventbrite.com/blog/event-marketing-lifecycle-ds00/
- LinkedIn fold / hashtag removals: https://authoredup.com/blog/linkedin-character-limit · https://sproutsocial.com/insights/linkedin-hashtags/ · https://www.socialmediatoday.com/news/linkedin-algorithm-update-older-posts-ai-tools-hashtag-use/753512/
- Richard van der Blom, *Algorithm Insights* 2025/2026 — cited second-hand only; not fetched.
