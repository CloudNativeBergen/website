# Local self-hosted Pretix test instance

A throwaway branch, never merged: the test environment for the Pretix wayfinder map (#1367), created for
[Task: provision a Pretix test organizer account and API token](https://github.com/CloudNativeBergen/website/issues/1370).
It complements `docs/research/pretix-api.md` and `docs/research/pretix-webhooks.md` (branches
`research/pretix-api` and `research/pretix-webhooks`) with facts **observed** on a running Pretix 2026.8.0.

## Reproduce

```sh
D=<an empty scratch dir>; mkdir -p $D/data && chmod 777 $D/data
cp pretix.cfg $D/; cp bootstrap.py listener.py replay_webhooks.py $D/data/
docker run -d --name pretix-local -p 8345:80 -v $D/data:/data \
  -v $D/pretix.cfg:/etc/pretix/pretix.cfg:ro pretix/standalone:2026.8.0 all
# wait until http://localhost:8345/api/v1/version answers 403 (amd64 image; slow under emulation on arm64)
docker exec pretix-local pretix shell -c "exec(open('/data/bootstrap.py').read())"   # organizer + 2 teams + tokens -> $D/data/tokens.json
docker exec -d pretix-local python3 /data/listener.py                                # loopback-only webhook capture
python3 -I fixture.py $D/data/tokens.json                                            # event, products, orders, probes -> probes.json
docker exec pretix-local pretix shell -c "exec(open('/data/replay_webhooks.py').read())"  # see "Webhooks" below
```

- **Instance:** base URL `http://localhost:8345`, SQLite, no Redis (Celery runs tasks eagerly). Pretix organizer account `cndn-test`, event `cndn27` (default locale `nb-no`, locales `nb-no` and `en`, NOK, VAT 25 % included in prices).
- **Tokens** are written to `tokens.json` in the data dir and are never committed:
  - `app`: least privilege, exactly `event.orders:read`, `event.vouchers:read`, `event.vouchers:write`. This is what the adapter would use.
  - `setup`: all permissions, used only to build the fixture and register the webhook.
- **Fixture:**
  - "Conference Only (1 day)", with variations Early Bird and Standard; each variation has its own price and window.
  - "Speaker ticket": voucher-only and `hide_without_voucher`.
  - "T-shirt" (`admission: false`).
  - "Workshop add-on" in an add-on category.
  - An inactive "Old ticket".
  - Questions `job_title` and `diet`.
  - Quotas: Main, Early Bird (size 3) and Merch.
  - Vouchers: `SPEAKER-KARI` and `SPONSOR-ACME` (100 %).
  - Five orders, including one that had a position canceled after payment.

## Observed facts (2026-10-16, Pretix 2026.8.0)

The **ticket** column names the map ticket each fact feeds.

| Fact | Observed | Ticket |
|---|---|---|
| `GET /items/?active=true` | Includes the voucher-only, `hide_without_voucher` Speaker item; excludes the inactive item | Products (#1373) |
| Variations | Carry their own `price`, `available_from` / `available_until` (+ `_mode`), `hide_without_voucher` and `active` | #1373 |
| Event default locale | Read from `GET …/events/<e>/settings/` (`locale`, `locales`); **readable with the app token**. Bokmål is `nb-no`, not `nb` | #1373 |
| Question `identifier` | **Required** by the API. The control panel generates a random one when the organizer doesn't set it | #1373 (`job_title`) |
| Add-on positions | `addon_to` = the parent position's `id`; attendee name and email are **empty** even with `attendee_emails_asked` on | #1373 |
| Non-admission positions | T-shirt: empty attendee, own price and tax | #1373 |
| Attendee email | **Not enforced by the API**: a position can be paid with no `attendee_email`, so the order-email fallback is required | Neutral model |
| Position price | Gross after voucher; `tax_value` included (2000.00 with 400.00 tax at 25 %); a 100 % voucher gives `0.00` with `tax_rate 25.00` | Neutral model / Marketing |
| Canceled positions | Hidden from `GET /orders/` by default; shown with `include_canceled_positions=true` (`canceled: true`) | Neutral model |
| Outstanding after partial cancel | Order `total` 2500.00 with **5000.00 confirmed** payments: computed outstanding is **−2500.00** (refund due), so `outstanding` can be negative | Neutral model / Payment Summary |
| Voucher redeemed via `POST /orders/` | **Increments `redeemed`** (`SPEAKER-KARI` 1/1, `SPONSOR-ACME` 1/3) | Discounts (#1374) / invitations (#1375) |
| Delete a redeemed voucher | `403 "This voucher can not be deleted as it has already been used."` | #1374 |
| Voucher create with the app token | Works (`event.vouchers:write`) | #1374 |
| `GET /api/v1/version` | `200 {"pretix": "2026.8.0", "pretix_numeric": …}` on self-hosted | Connection status probe |
| Wrong event slug | `403`, not `404`, so the status probe can't tell a wrong slug from a wrong token | Connection status probe |
| App token reading `…/webhooks/` | `403`: least privilege holds | Connection (#1371) |
| Order created with `status: p` | Emits **both** `order.placed` and `order.paid` | Webhook (#1376) |

### Webhooks

`webhooks.ndjson` holds 10 real deliveries, made by Pretix's own `send_webhook` task:

- **Body:** exactly `{"notification_id", "organizer", "event", "code", "action"}`, sent as `Content-Type: application/json`.
- **Headers:** `User-Agent: python-requests/x`. **No signature header, no auth header, nothing that identifies Pretix**, so the secret in the target URL path is the only authenticity lever, as researched.
- **Request settings:** `allow_redirects=False`, `timeout=30`.
- **Responses:** `410` disables the webhook. Any other non-2xx is retried on a schedule adding up to about 3 days. The first retries (5 s, 30 s, 60 s) run on Celery; retries of 5 minutes or more are stored and scheduled by the periodic task. **This corrects the research**, which expected no retries on self-hosted. A self-hosted instance retries too, but its long retries only happen if the operator runs `pretix runperiodic`.
- **Outbound SSRF guard:** Pretix refuses webhook (and mail) targets on **loopback, link-local, private and CGNAT** addresses unless `[pretix] allow_http_to_private_networks=on`. On pretix.eu, and on any default self-hosted instance, our receiver must be a public URL; a local `next dev` can't receive Pretix webhooks without a tunnel. `replay_webhooks.py` lifts the guard for its own process only to capture the deliveries above; the instance config is untouched.

## Not observed here

- pretix.eu specifics: hosted retry behaviour, rate limits, what its version endpoint reports.
- Payment-provider plugins (Stripe/PayPal ids): no real payments were made.
