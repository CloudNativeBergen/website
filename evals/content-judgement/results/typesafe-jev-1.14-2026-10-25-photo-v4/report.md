# Jev offline evaluation

Question set: v4. Requested model: "typesafe/jev-1.14". Repeats: 3. Created: 2026-10-25T09:43:18.030Z.

Calls: 227; successful: 227; failed: 0. Known returned cost: $0.053951. Cost missing for 0 calls; failed/retried requests may incur additional unreported charges.

End-to-end request latency (includes retries/backoff and failed calls): p50 455 ms; p95 708 ms.

Calibration calls: 2; included in calls, cost, and latency, excluded from scoring.

Wall-photo calibration (caption) input tokens T0: 1568; minimum accepted image input tokens: 2068.

Wall-photo calibration (no_caption) input tokens T0: 772; minimum accepted image input tokens: 1272.

Returned models: "typesafe/jev-1.14-20261014".

Only items with every repeat successful are scored. Inspect failures before comparing runs: exclusions can bias scores. Moderation uses the mean probability per question, then thresholds with >=. The flag metric is any mean question probability >= threshold against any true label. Evasion recall uses gold positives; slice FPR uses gold negatives. Undefined ratios are 0; empty slices show N/A where applicable. Conversation uses majority top-choice vote; ties follow category order in questions.ts. Confidence is the mean reported confidence across repeats, grouped by the aggregate outcome. Single-repeat stability is trivially 100%.

## wall-photo

Scored 75/75 items; excluded 0 with incomplete/failed repeats.

image_not_received errors: 0.

### caption

| Question              | Threshold | N   | Positives | Precision | Recall                           | TP  | FP  | FN  | TN  |
| --------------------- | --------- | --- | --------- | --------- | -------------------------------- | --- | --- | --- | --- |
| caption_abusive       | 0.5       | 64  | 1         | 100.0%    | 100.0%                           | 1   | 0   | 0   | 63  |
| caption_abusive       | 0.9       | 64  | 1         | 100.0%    | 100.0%                           | 1   | 0   | 0   | 63  |
| caption_sexual        | 0.5       | 64  | 0         | 0.0%      | not measurable on the public set | 0   | 0   | 0   | 64  |
| caption_sexual        | 0.9       | 64  | 0         | 0.0%      | not measurable on the public set | 0   | 0   | 0   | 64  |
| caption_spam          | 0.5       | 64  | 1         | 33.3%     | 100.0%                           | 1   | 2   | 0   | 61  |
| caption_spam          | 0.9       | 64  | 1         | 100.0%    | 100.0%                           | 1   | 0   | 0   | 63  |
| caption_personal_info | 0.5       | 64  | 2         | 100.0%    | 100.0%                           | 2   | 0   | 0   | 62  |
| caption_personal_info | 0.9       | 64  | 2         | 0.0%      | 0.0%                             | 0   | 0   | 2   | 62  |

### photo

| Question            | Threshold | N   | Positives | Precision | Recall                           | TP  | FP  | FN  | TN  |
| ------------------- | --------- | --- | --------- | --------- | -------------------------------- | --- | --- | --- | --- |
| photo_abusive       | 0.5       | 75  | 0         | 0.0%      | not measurable on the public set | 0   | 0   | 0   | 75  |
| photo_abusive       | 0.9       | 75  | 0         | 0.0%      | not measurable on the public set | 0   | 0   | 0   | 75  |
| photo_sexual        | 0.5       | 75  | 0         | 0.0%      | not measurable on the public set | 0   | 0   | 0   | 75  |
| photo_sexual        | 0.9       | 75  | 0         | 0.0%      | not measurable on the public set | 0   | 0   | 0   | 75  |
| photo_spam          | 0.5       | 75  | 16        | 93.8%     | 93.8%                            | 15  | 1   | 1   | 58  |
| photo_spam          | 0.9       | 75  | 16        | 100.0%    | 62.5%                            | 10  | 0   | 6   | 59  |
| photo_personal_info | 0.5       | 75  | 8         | 66.7%     | 100.0%                           | 8   | 4   | 0   | 63  |
| photo_personal_info | 0.9       | 75  | 8         | 88.9%     | 100.0%                           | 8   | 1   | 0   | 66  |

### Photo advice bar

Photo advice bar on supported public questions at 0.5: fail. Requires recall >= 95% for every photo question with at least 5 positives and combined benign/borderline FPR <= 5%. Questions without positives are not measurable on the public set; they do not pass.

| Question            | Positives | Recall at 0.5                    | Advice status                    |
| ------------------- | --------- | -------------------------------- | -------------------------------- |
| photo_abusive       | 0         | not measurable on the public set | not measurable on the public set |
| photo_sexual        | 0         | not measurable on the public set | not measurable on the public set |
| photo_spam          | 16        | 93.8%                            | fail                             |
| photo_personal_info | 8         | 100.0%                           | pass                             |

| Photo slice          | Threshold | N   | Flagged | FPR  |
| -------------------- | --------- | --- | ------- | ---- |
| benign               | 0.5       | 38  | 0       | 0.0% |
| benign               | 0.9       | 38  | 0       | 0.0% |
| borderline           | 0.5       | 13  | 1       | 7.7% |
| borderline           | 0.9       | 13  | 0       | 0.0% |
| benign or borderline | 0.5       | 51  | 1       | 2.0% |
| benign or borderline | 0.9       | 51  | 0       | 0.0% |

These deliberately sampled public cases are not representative prevalence estimates or a guarantee of safe deployment. Use held-out examples and human review for deployment decisions.
