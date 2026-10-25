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

## Pass bar

Agreed on 2026-10-25 in [Build the offline eval set and the pass bar per surface](https://github.com/CloudNativeBergen/website/issues/1569). "Flag" means any of the four moderation questions at or above the threshold, using the mean probability across repeats.

| Use                               | Surface                                        | Bar                                                                                                           |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Advice (badge)                    | Wall Post captions, Feedback Response comments | Flag at **0.5**: recall ≥ 95%, harsh-but-fair false-positive rate ≤ 5%                                        |
| Enforcement candidate (auto-hide) | Wall Post captions, Feedback Response comments | Flag at **0.9**: precision ≥ 98%, **zero** harsh-but-fair or borderline false positives, evasion recall ≥ 80% |
| Message Category                  | Conversation openings                          | Accuracy ≥ 90%; a choice with confidence below **0.7** is shown as uncertain and not used as a filter value   |

The bar must be met again whenever the model build or `QUESTION_SET_VERSION` changes, and on a set expanded with adversarial items written by a human before enforcement is switched on anywhere. This set was generated and labelled by a model, so its numbers are an upper bound, not proof.

## Runs

- [`typesafe/jev-1.14-20261014`, 2026-10-25](results/typesafe-jev-1.14-2026-10-25/report.md): all three bars met. Flag at 0.5: 100% precision, 98.7% / 97.6% recall (captions / comments), 0 of 30 harsh-but-fair comments flagged. Flag at 0.9: 100% precision, 82.7% / 84.1% recall, evasion recall 84% / 80%, which clears the enforcement bar narrowly. Categories: 97.3% accuracy, wrong answers at mean confidence 0.56. Every "abusive" false positive is a sexual remark aimed at the speaker, labelled only "sexual". The misses are Norwegian sexual remarks with spaced-out letters. 1,206 calls, $0.049, p50 250 ms.
