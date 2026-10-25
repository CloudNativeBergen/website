# Jev offline evaluation

Question set: v3. Requested model: "typesafe/jev-1.14". Repeats: 3. Created: 2026-10-25T09:35:18.435Z.

Calls: 227; successful: 218; failed: 9. Known returned cost: $0.051180. Cost missing for 9 calls; failed/retried requests may incur additional unreported charges.

End-to-end request latency (includes retries/backoff and failed calls): p50 449 ms; p95 736 ms.

Calibration calls: 2; included in calls, cost, and latency, excluded from scoring.

Wall-photo calibration (caption) input tokens T0: 1520; minimum accepted image input tokens: 2020.

Wall-photo calibration (no_caption) input tokens T0: 724; minimum accepted image input tokens: 1224.

Returned models: "typesafe/jev-1.14-20261014".

| Error category | Count |
| --- | --- |
| unexpected_error | 9 |

Only items with every repeat successful are scored. Inspect failures before comparing runs: exclusions can bias scores. Moderation uses the mean probability per question, then thresholds with >=. The flag metric is any mean question probability >= threshold against any true label. Evasion recall uses gold positives; slice FPR uses gold negatives. Undefined ratios are 0; empty slices show N/A where applicable. Conversation uses majority top-choice vote; ties follow category order in questions.ts. Confidence is the mean reported confidence across repeats, grouped by the aggregate outcome. Single-repeat stability is trivially 100%.

## wall-photo

Scored 72/75 items; excluded 3 with incomplete/failed repeats.

image_not_received errors: 0.

### caption

| Question | Threshold | N | Positives | Precision | Recall | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| caption_abusive | 0.5 | 61 | 1 | 100.0% | 100.0% | 1 | 0 | 0 | 60 |
| caption_abusive | 0.9 | 61 | 1 | 100.0% | 100.0% | 1 | 0 | 0 | 60 |
| caption_sexual | 0.5 | 61 | 0 | 0.0% | not measurable on the public set | 0 | 0 | 0 | 61 |
| caption_sexual | 0.9 | 61 | 0 | 0.0% | not measurable on the public set | 0 | 0 | 0 | 61 |
| caption_spam | 0.5 | 61 | 1 | 33.3% | 100.0% | 1 | 2 | 0 | 58 |
| caption_spam | 0.9 | 61 | 1 | 100.0% | 100.0% | 1 | 0 | 0 | 60 |
| caption_personal_info | 0.5 | 61 | 1 | 100.0% | 100.0% | 1 | 0 | 0 | 60 |
| caption_personal_info | 0.9 | 61 | 1 | 0.0% | 0.0% | 0 | 0 | 1 | 60 |

### photo

| Question | Threshold | N | Positives | Precision | Recall | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| photo_abusive | 0.5 | 72 | 0 | 0.0% | not measurable on the public set | 0 | 1 | 0 | 71 |
| photo_abusive | 0.9 | 72 | 0 | 0.0% | not measurable on the public set | 0 | 0 | 0 | 72 |
| photo_sexual | 0.5 | 72 | 0 | 0.0% | not measurable on the public set | 0 | 0 | 0 | 72 |
| photo_sexual | 0.9 | 72 | 0 | 0.0% | not measurable on the public set | 0 | 0 | 0 | 72 |
| photo_spam | 0.5 | 72 | 16 | 88.2% | 93.8% | 15 | 2 | 1 | 54 |
| photo_spam | 0.9 | 72 | 16 | 100.0% | 62.5% | 10 | 0 | 6 | 56 |
| photo_personal_info | 0.5 | 72 | 7 | 58.3% | 100.0% | 7 | 5 | 0 | 60 |
| photo_personal_info | 0.9 | 72 | 7 | 77.8% | 100.0% | 7 | 2 | 0 | 63 |

### Photo advice bar

Photo advice bar on supported public questions at 0.5: fail. Requires recall >= 95% for every photo question with at least 5 positives and combined benign/borderline FPR <= 5%. Questions without positives are not measurable on the public set; they do not pass.

| Question | Positives | Recall at 0.5 | Advice status |
| --- | --- | --- | --- |
| photo_abusive | 0 | not measurable on the public set | not measurable on the public set |
| photo_sexual | 0 | not measurable on the public set | not measurable on the public set |
| photo_spam | 16 | 93.8% | fail |
| photo_personal_info | 7 | 100.0% | pass |

| Photo slice | Threshold | N | Flagged | FPR |
| --- | --- | --- | --- | --- |
| benign | 0.5 | 36 | 3 | 8.3% |
| benign | 0.9 | 36 | 1 | 2.8% |
| borderline | 0.5 | 13 | 1 | 7.7% |
| borderline | 0.9 | 13 | 0 | 0.0% |
| benign or borderline | 0.5 | 49 | 4 | 8.2% |
| benign or borderline | 0.9 | 49 | 1 | 2.0% |

These deliberately sampled public cases are not representative prevalence estimates or a guarantee of safe deployment. Use held-out examples and human review for deployment decisions.
