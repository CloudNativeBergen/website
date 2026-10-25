# Jev content judgement evals

A public, labelled offline evaluation set for TypeSafe's Jev classifier, used to assess moderation for Cloud Native Days Norway and KontainerKonf. Publishing these evals is deliberate: organizers and contributors should be able to inspect and challenge the labels. These are synthetic cases, not attendee submissions. Names, allegations, addresses, and contact details are invented; numbers are synthetic fixtures, never contacts to call. No example describes an actual person.

**Content warning:** the data includes harassment, discriminatory insults, threats, adult sexual remarks, spam, and fictional doxxing. It contains no sexual content involving minors. Norwegian Bokmål, Nynorsk, English, and code-switching reflect conference conversations.

Labels follow the definitions in [questions.ts](./questions.ts), version `v1`. The surfaces have distinct boundaries: harsh criticism of a talk is allowed feedback; sponsor thanks are allowed captions. Conversation categories follow the question actually asked, with talk-change announcements classified as `talk_details` even when acceptance is mentioned. Notes explain close cases.

```sh
pnpm tsx evals/content-judgement/run.ts --dry-run
OPENROUTER_API_KEY=... pnpm tsx evals/content-judgement/run.ts
OPENROUTER_API_KEY=... pnpm tsx evals/content-judgement/run.ts --surface feedback-comment --repeats 3 --limit 10 --concurrency 4 --model typesafe/jev-1.14 --out evals/content-judgement/results/trial
npx vitest run evals/content-judgement
```

Node 22+ is required. The default is all surfaces, three repeats, concurrency four, and `typesafe/jev-1.14`. Dry-run validates **all** data files and prints one request per surface without an API key, API calls, or output files. `--limit` applies per selected surface. Live runs use OpenRouter's decisions endpoint and **cost money**; the live runner is never run in CI. The offline unit/data tests make no API calls. Keep keys in the environment.

Raw response records go to `raw-<surface>.jsonl` and a Markdown report to `report.md`. The default output directory is `results/<sanitised-model>-<UTC-date>/` under this directory; reusing a directory overwrites selected raw files and the report. Raw files contain IDs and answers, never submitted text. Invalid responses fail an individual repeat, are recorded by error category, and make the process exit nonzero after completing the run. HTTP 429/529/5xx responses get up to four attempts with exponential backoff; each attempt has a 60-second timeout. No error body is logged.

Moderation metrics threshold the **mean probability across repeats** at 0.5, 0.7, and 0.9. Precision measures how many flags are warranted; recall measures how many labelled positives were found; F1 balances the two. TP/FP/FN/TN are correct flags, incorrect flags, missed positives, and correct passes. The overall `flag` metric compares any question reaching the threshold with any true label. Evasion recall measures obfuscated positives; `harsh_fair` and `borderline` false-positive rates measure unnecessary refusals. Language breakdowns help expose unequal performance.

Conversation accuracy uses majority top-choice voting across repeats (ties follow the category order in `questions.ts`), with per-category precision/recall, an expected-row confusion matrix, and slices by language, opener role, and ambiguity. Confidence is averaged across repeats and compared for correctly/incorrectly classified items. Repeat stability is the share of items with identical decisions across all repeats (moderation at 0.5). A single repeat is trivially stable.

Only items with all repeats successful enter metrics; excluded counts are explicit. Undefined ratios are zero; empty slice rates are marked where applicable and support counts are shown. Cost sums returned usage costs; missing costs and failed/retried requests can make this an underestimate. p50/p95 latency includes retries and backoff. This deliberately sampled set does not estimate real-world prevalence, and stability or high confidence does not imply correctness. Public examples can become contaminated by training: use fresh held-out cases and human review before deployment.

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

Every bar must be met again whenever the model build or `QUESTION_SET_VERSION` changes.

## Runs

Current: [`typesafe/jev-1.14-20261014`, question set v2, 2026-10-25](results/typesafe-jev-1.14-2026-10-25-v2/report.md). 1,206 calls, $0.049, no failures.

- **Advice bar: met.** Flag at 0.5: 100% precision, 98.7% / 97.6% recall (captions / comments), 0 of 30 harsh-but-fair comments flagged (in-sample, soft negatives).
- **Category bar: met.** 97.3% accuracy; the three wrong answers average confidence 0.57. One of them (co-078) is above the 0.7 uncertainty gate, and two correct answers (co-020, co-028) fall below it.
- **Enforcement: not measurable on this set**, and two questions would fail recall at 0.9 anyway:
  - **personal_info**: 42.9% / 21.4% recall at 0.9 (100% at 0.5). Recall dropped from v1 after the phone numbers were changed to start with 0, so part of it may be the less realistic numbers. Either way, personal info does not qualify for auto-hide at 0.9 today.
  - **sexual** on comments: 83.3% recall at 0.9, with evasion recall of 62.5% (8 items). The misses are Norwegian sexual remarks, several with spaced-out letters ("n a k e n", "R u m p a"), and one plain Bokmål caption (wc-071).
- Flag at 0.9: 100% precision, 81.3% / 82.9% recall, evasion recall 84.0% / 76.7%.
- The earlier 80% evasion-recall figure was proposed after seeing a run that scored exactly 80%, which is one reason enforcement now waits for the held-out set.

Earlier: [v1 run](results/typesafe-jev-1.14-2026-10-25/report.md), before sexual remarks aimed at a person were also labelled abusive (they were all counted as abusive "false positives") and before the phone numbers changed.
