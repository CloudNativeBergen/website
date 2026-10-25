# Jev content judgement evals

A public, labelled offline evaluation set for TypeSafe's Jev classifier, used to assess moderation for Cloud Native Days Norway and KontainerKonf. Publishing these evals is deliberate: organizers and contributors should be able to inspect and challenge the labels. These are synthetic cases, not attendee submissions. Names, allegations, addresses, and contact details are invented; numbers are synthetic fixtures, never contacts to call. No example describes an actual person.

**Content warning:** the data includes harassment, discriminatory insults, threats, adult sexual remarks, spam, and fictional doxxing. It contains no sexual content involving minors. Norwegian Bokmål, Nynorsk, English, and code-switching reflect conference conversations.

Labels follow the definitions in [questions.ts](../../src/lib/content-judgement/questions.ts), the module production sends, so the eval measures exactly what production asks ([spec](../../docs/CONTENT_JUDGEMENT_SPEC.md) §4.2). `./questions.ts` here only maps eval items onto its builders. Question set versions are per surface (`QUESTION_SET_VERSIONS`: comments and conversations `v2`, Wall Posts `v4`; the caption-only surface measures the Wall Post set), and every report names them. The surfaces have distinct boundaries: harsh criticism of a talk is allowed feedback; sponsor thanks are allowed captions. Conversation categories follow the question actually asked, with talk-change announcements classified as `talk_details` even when acceptance is mentioned. Notes explain close cases.

```sh
pnpm tsx evals/content-judgement/run.ts --dry-run
OPENROUTER_API_KEY=... pnpm tsx evals/content-judgement/run.ts
OPENROUTER_API_KEY=... pnpm tsx evals/content-judgement/run.ts --surface feedback-comment --repeats 3 --limit 10 --concurrency 4 --model typesafe/jev-1.14 --out evals/content-judgement/results/trial
npx vitest run evals/content-judgement
```

Node 22+ is required. The default is all surfaces, three repeats, concurrency four, and `typesafe/jev-1.14`. Dry-run validates all available data files and prints request shape sizes per surface. It requires no API key, makes no calls, and writes no output files; submitted text and image bytes are omitted. `--limit` applies per selected surface. Live runs use OpenRouter's decisions endpoint and **cost money**; the live runner is never run in CI. The offline unit/data tests make no API calls. Keep keys in the environment.

Raw response records go to `raw-<surface>.jsonl` and a Markdown report to `report.md`. The default output directory is `results/<sanitised-model>-<UTC-date>/` under this directory; reusing a directory overwrites selected raw files and the report. Raw files contain IDs and answers, never submitted text or image bytes. Invalid responses fail an individual repeat, are recorded by error category, and make the process exit nonzero after completing the run. HTTP 429/529/5xx responses get up to four attempts with exponential backoff; each attempt has a 60-second timeout. No error body is logged.

Moderation metrics threshold the **mean probability across repeats** at 0.5, 0.7, and 0.9. Precision measures how many flags are warranted; recall measures how many labelled positives were found; F1 balances the two. TP/FP/FN/TN are correct flags, incorrect flags, missed positives, and correct passes. The overall `flag` metric compares any question reaching the threshold with any true label. Evasion recall measures obfuscated positives; `harsh_fair` and `borderline` false-positive rates measure unnecessary refusals. Language breakdowns help expose unequal performance.

Conversation accuracy uses majority top-choice voting across repeats (ties follow the category order in `questions.ts`), with per-category precision/recall, an expected-row confusion matrix, and slices by language, opener role, and ambiguity. Confidence is averaged across repeats and compared for correctly/incorrectly classified items. Repeat stability is the share of items with identical decisions across all repeats (moderation at 0.5). A single repeat is trivially stable.

Only items with all repeats successful enter metrics; excluded counts are explicit. Undefined ratios are zero; empty slice rates are marked where applicable and support counts are shown. Cost sums returned usage costs; missing costs and failed/retried requests can make this an underestimate. p50/p95 latency includes retries and backoff. This deliberately sampled set does not estimate real-world prevalence, and stability or high confidence does not imply correctness. Public examples can become contaminated by training: use fresh held-out cases and human review before deployment.

## Wall Post photos

`wall-photo` judges one optional caption and one photo in a single multimodal call. With a caption it asks eight questions: four `caption_*` questions with the existing caption meanings, and four `photo_*` questions. Without a caption only the four photo questions are asked. Caption, language, and caption labels must all be present or all absent. Photo questions judge only what is visible and ignore the caption, which its own questions judge (question set v4; in v3 the photo questions read the caption as context, and an abusive or spam caption raised the photo answers too). Conference sponsor booths, banners, and swag are allowed; unrelated ads and QR-code lures are spam. Readable full-name badges, ID cards, and private contact information in screens or papers count as personal information.

`data/wall-photo.jsonl` holds 75 Wall Posts: 38 benign, 13 borderline, 16 spam and 8 personal info. 4 benign posts carry a flagged caption (abuse, a spam pitch, a phone number, an email), and 11 have no caption.

- **60 photos** are CC0 (59 from Wikimedia Commons, one from Flickr via Openverse), each licence checked on its source page. They were picked and labelled by a model (Claude), and a human approved the set on 2026-10-25. People appear only at a distance or on stage; two wide group photos (wp-010, wp-015) show faces at full resolution.
- **15 images are generated** (`images/templates.ts`): badges, an ID card, private screens, a boarding pass, a sticky note, QR and ad posters, slides and a sponsor banner. They are clean renders, not photos, so they are likely easier than a badge photographed in a dim hall.
- There are **no nudity, gore or hate-symbol images**, so photo_sexual and photo_abusive can only show false positives here.

Fetch and generate the local image cache before running this surface:

```sh
pnpm tsx evals/content-judgement/images/fetch.ts
pnpm tsx evals/content-judgement/images/generate.ts
pnpm tsx evals/content-judgement/run.ts --surface wall-photo --dry-run
OPENROUTER_API_KEY=... pnpm tsx evals/content-judgement/run.ts --surface wall-photo
```

Fetched images require CC0-1.0 or PDM-1.0 attribution metadata and a matching SHA-256 digest. Fetching is sequential and skips correctly cached files. Generated fixtures use invented people and contact details, example.com/example.no email addresses, phone numbers starting with 0, and a generic ID card. Images are stored only in the gitignored `.image-cache/` directory and must never be committed. Preparation auto-rotates by EXIF, removes metadata, and encodes JPEG at quality 85 with the longest side at most 1568 pixels, without upscaling; a resulting short side below 280 pixels is rejected.

Each live run makes one calibration call per request shape (with a caption, eight questions; without, four) for the first item of that shape, with the image omitted. Its input token count is T0 for that shape. Every photo response must report at least T0 + 500 input tokens; otherwise it is an `image_not_received` error and excluded from scores. Missing usage input tokens also fail this guard. The margin follows the 2026-10-25 probe: 2,762 tokens with an image versus 378 without. Calibration is included in reported calls and returned cost, but never scored. Dry-run makes no calls and prints shape sizes without caption text or image bytes.

The report separates caption and photo precision/recall at 0.5 and 0.9. The photo advice bar flags when any mean photo probability is at least 0.5. It requires recall of at least 95% for every photo question with at least five positives, and an any-photo false-positive rate of at most 5% across photos tagged `benign` or `borderline`, also reported separately for those tags. Caption flags do not affect this photo rate. Questions with fewer than five positives have insufficient support; zero-positive questions are **not measurable on the public set**, never passing. Public photo sexual/abusive questions are expected to have no positives. The private nudity/gore set is separate and must never be committed.

## Held-out sets (private)

A held-out text set written by people (spec §11.2) is never committed. Lay it out like `data/` (`<dir>/feedback-comment.jsonl`, same schema) in a directory **outside the repository**, and pass it with `--data` and one text surface:

```sh
OPENROUTER_API_KEY=... pnpm tsx evals/content-judgement/run.ts --data ~/jev-held-out --surface feedback-comment
```

The runner refuses a directory inside the repository. The raw results, which carry item ids, are written next to the data; only `report.md`, which holds numbers alone, goes to `--out` (default `results/<model>-<date>-held-out/`). Copy a question's false-positive rate and recall at 0.9, and its negatives, into [gates.json](../../src/lib/content-judgement/gates.json), for the build and question set the report names.

## This is a development set

This set was written and labelled by a model (gpt-6.1-sol), and the question wording in `questions.ts` was written alongside it. Some criteria sentences describe the exact patterns of specific items, so these slices are **in-sample**: the `ambiguous` conversation items (for example co-003/011/015, co-033/038/043, co-053/058/064, co-068/075/076, co-083/088/090), the `borderline` items ("sexy YAML"), sponsor captions, and "sales pitch is not spam" comments. The negatives are also soft: the harsh-but-fair comments have no profanity, and the evasion items are mostly one-character edits of other items here. Treat its numbers as an upper bound for development, never as the evidence that unlocks enforcement.

Phone numbers in the data start with 0, which no Norwegian subscriber number does, so none can belong to a real person. Names, streets and domains (`.example.invalid`) are invented.

## Pass bar

Agreed on 2026-10-25 in [Build the offline eval set and the pass bar per surface](https://github.com/CloudNativeBergen/website/issues/1569) (see its resolution comment). "Flag" means any of the four moderation questions at or above the threshold, using the mean probability across repeats.

| Use                                                             | Bar                                                                                                                                                                                                                                    | Measured on                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Advice** (badge on Wall Posts and Feedback Response comments) | Flag at **0.5**: recall ≥ 95%, harsh-but-fair false-positive rate ≤ 5%                                                                                                                                                                 | This development set is enough                                                              |
| **Message Category**                                            | Accuracy ≥ 90%. A choice with confidence below **0.7** is shown as uncertain and not used as a filter value                                                                                                                            | This development set is enough                                                              |
| **Enforcement** (auto-hide), **per question**                   | False-positive rate ≤ **1% on at least 300 negatives**, including hard negatives (profanity in fair criticism, people sharing their own contact details, sponsor captions); recall ≥ **80%** for that question at the chosen threshold | A **held-out set written by humans**, never seen while writing the questions. Not built yet |

A precision bar is deliberately not used for enforcement: precision depends on how common abuse is in the set, and this set is about half positive. Zero false positives in 300 negatives is roughly what it takes to show a false-positive rate of 1% or less.

Every bar must be met again whenever the model build or a surface's question set version changes. A wording change without a version bump fails `src/lib/content-judgement/questions.test.ts`.

## Runs

Current: [`typesafe/jev-1.14-20261014`, question set v2, 2026-10-25](results/typesafe-jev-1.14-2026-10-25-v2/report.md). 1,206 calls, $0.049, no failures.

- **Advice bar: met.** Flag at 0.5: 100% precision, 98.7% / 97.6% recall (captions / comments), 0 of 30 harsh-but-fair comments flagged (in-sample, soft negatives).
- **Category bar: met.** 97.3% accuracy; the three wrong answers average confidence 0.57. One of them (co-078) is above the 0.7 uncertainty gate, and two correct answers (co-020, co-028) fall below it.
- **Enforcement: not measurable on this set**, and two questions would fail recall at 0.9 anyway:
  - **personal_info**: 42.9% / 21.4% recall at 0.9 (100% at 0.5). Recall dropped from v1 after the phone numbers were changed to start with 0, so part of it may be the less realistic numbers. Either way, personal info does not qualify for auto-hide at 0.9 today.
  - **sexual** on comments: 83.3% recall at 0.9, with evasion recall of 62.5% (8 items). The misses are Norwegian sexual remarks, several with spaced-out letters ("n a k e n", "R u m p a"), and one plain Bokmål caption (wc-071).
- Flag at 0.9: 100% precision, 81.3% / 82.9% recall, evasion recall 84.0% / 76.7%.
- The earlier 80% evasion-recall figure was proposed after seeing a run that scored exactly 80%, which is one reason enforcement now waits for the held-out set.

### Wall Post photos

Current: [`typesafe/jev-1.14-20261014`, question set v4, 2026-10-25](results/typesafe-jev-1.14-2026-10-25-photo-v4/report.md). 227 calls (2 calibration), $0.054, no failures, no `image_not_received`.

- **Photo advice bar: not met as written, accepted for advice** (decided on [Build the public image eval set and test Jev against the advice bar](https://github.com/CloudNativeBergen/website/issues/1576)). False positives at 0.5: 0 of 38 benign, 1 of 13 borderline (wp-043, a QR wifi sign), 2.0% together (bar ≤ 5%). personal_info recall 8 of 8. **spam recall 15 of 16 (93.8%, bar ≥ 95%)**: the miss is a Bitcoin sticker on a pole (wp-054, 0.46 / 0.47 / 0.53). With 16 positives, a 95% bar allows no miss, so this set is too small to measure it.
- Jev also flags phone numbers on ads as personal info (wp-051, wp-057, wp-059, wp-069). Harmless for advice: those posts are flagged anyway.
- Captions in the same call: abusive, personal_info and spam caught 4 of 4. Two captions written for spam photos ("Scan it, trust me", "Cheap rooms if anyone missed the hotel deadline") were flagged as spam; their labels are arguable.
- At 0.9: spam recall 62.5%, personal_info 100% with one false positive.

Earlier: [v3 run](results/typesafe-jev-1.14-2026-10-25-photo-v3/report.md), with photo questions reading the caption: two caption-bleed false positives (wp-005, wp-031), wp-014 still labelled benign (its slide shows a real email address; Jev was right), and three photos dropped by an upper-case `.JPG` cache bug (72 of 75 scored).

Earlier: [v1 run](results/typesafe-jev-1.14-2026-10-25/report.md), before sexual remarks aimed at a person were also labelled abusive (they were all counted as abusive "false positives") and before the phone numbers changed.
