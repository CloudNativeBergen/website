"""Build a CNDN-shaped test event on the local Pretix and probe the facts the map needs.

Run: python3 -I fixture.py <path to tokens.json>
Writes probe results to probes.json next to this file. Safe to re-run: it deletes
and recreates the event.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8345/api/v1"
TOK = json.load(open(sys.argv[1]))
ORG = TOK["organizer"]
EV = "cndn27"
HERE = os.path.dirname(os.path.abspath(__file__))
probes = {}


def call(method, path, body=None, token="setup", ok=(200, 201, 204)):
    url = path if path.startswith("http") else f"{BASE}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Token {TOK[token]}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        if e.code in ok:
            return e.code, raw
        return e.code, raw


def must(method, path, body=None, token="setup"):
    status, res = call(method, path, body, token)
    if status not in (200, 201, 204):
        raise SystemExit(f"{method} {path} -> {status}: {res}")
    return res


def all_pages(path, token="app"):
    out, url = [], path
    while url:
        res = must("GET", url, token=token)
        out += res["results"]
        url = res["next"]
    return out


E = f"/organizers/{ORG}/events/{EV}"

# ── reset ────────────────────────────────────────────────────────────────────
call("DELETE", E + "/")  # 403 once it has orders; then we rename instead
status, _ = call("GET", E + "/")
if status == 200:
    raise SystemExit(f"event {EV} exists with orders; bump EV in the script to re-run")

# ── event ────────────────────────────────────────────────────────────────────
must("POST", f"/organizers/{ORG}/events/", {
    "name": {"en": "CNDN Test 2027 (en)"},
    "slug": EV, "currency": "NOK", "date_from": "2027-06-01T09:00:00Z",
    "live": False,
})
must("PATCH", E + "/settings/", {
    "locales": ["nb-no", "en"], "locale": "nb-no",
    "attendee_names_asked": True, "attendee_emails_asked": True,
    "attendee_company_asked": True,
})
must("PATCH", E + "/", {"name": {"nb-no": "CNDN Test 2027", "en": "CNDN Test 2027 (en)"}})

tax = must("POST", E + "/taxrules/", {"name": {"en": "VAT 25 %"}, "rate": "25.00", "price_includes_tax": True})
cat = must("POST", E + "/categories/", {"name": {"en": "Tickets"}, "position": 0})
addon_cat = must("POST", E + "/categories/", {"name": {"en": "Add-ons"}, "is_addon": True, "position": 1})

conf = must("POST", E + "/items/", {
    "name": {"nb-no": "Konferanse (1 dag)", "en": "Conference Only (1 day)"},
    "category": cat["id"], "default_price": "2500.00", "tax_rule": tax["id"],
    "admission": True, "position": 0, "has_variations": True,
    "variations": [
        {"value": {"nb-no": "Tidlig", "en": "Early Bird"}, "default_price": "2000.00", "position": 0,
         "available_from": "2026-01-01T00:00:00Z", "available_until": "2027-03-01T00:00:00Z"},
        {"value": {"nb-no": "Standard", "en": "Standard"}, "default_price": "2500.00", "position": 1,
         "available_from": "2027-03-01T00:00:00Z"},
    ],
})
speaker = must("POST", E + "/items/", {
    "name": {"en": "Speaker ticket"}, "category": cat["id"], "default_price": "0.00",
    "admission": True, "require_voucher": True, "hide_without_voucher": True, "position": 1,
})
shirt = must("POST", E + "/items/", {
    "name": {"en": "T-shirt"}, "category": cat["id"], "default_price": "200.00", "tax_rule": tax["id"],
    "admission": False, "position": 2,
})
workshop = must("POST", E + "/items/", {
    "name": {"en": "Workshop add-on"}, "category": addon_cat["id"], "default_price": "1500.00",
    "tax_rule": tax["id"], "admission": False, "position": 0,
})
old = must("POST", E + "/items/", {
    "name": {"en": "Old ticket"}, "category": cat["id"], "default_price": "100.00",
    "admission": True, "active": False, "position": 3,
})
must("POST", f"{E}/items/{conf['id']}/addons/", {"addon_category": addon_cat["id"], "min_count": 0, "max_count": 1})

var_early, var_std = conf["variations"][0]["id"], conf["variations"][1]["id"]
must("POST", E + "/quotas/", {"name": "Main", "size": 100,
                              "items": [conf["id"], speaker["id"], old["id"]],
                              "variations": [var_early, var_std]})
must("POST", E + "/quotas/", {"name": "Early Bird", "size": 3, "items": [conf["id"]], "variations": [var_early]})
must("POST", E + "/quotas/", {"name": "Merch", "size": None, "items": [shirt["id"], workshop["id"]]})

jt = must("POST", E + "/questions/", {"question": {"en": "Job title", "nb-no": "Stilling"}, "identifier": "job_title",
                                       "type": "S", "required": False, "items": [conf["id"], speaker["id"]]})
diet = must("POST", E + "/questions/", {"question": {"en": "Dietary needs"}, "identifier": "diet", "type": "S", "required": False,
                                         "items": [conf["id"]]})
probes["auto_question_identifier"] = diet["identifier"]

# ── webhook (setup token: needs organizer.settings.general:write) ───────────
must("POST", f"/organizers/{ORG}/webhooks/", {
    "enabled": True, "target_url": "http://127.0.0.1:8346/hook/s3cret-in-path",
    "all_events": True, "limit_events": [],
    "action_types": ["pretix.event.order.placed", "pretix.event.order.paid",
                     "pretix.event.order.canceled", "pretix.event.order.changed.*"],
})

# ── voucher, created with the LEAST-PRIVILEGE token ─────────────────────────
v = must("POST", E + "/vouchers/", {"code": "SPEAKER-KARI", "max_usages": 1, "item": speaker["id"],
                                    "price_mode": "set", "value": "0.00", "tag": "speaker"}, token="app")
sponsor_v = must("POST", E + "/vouchers/", {"code": "SPONSOR-ACME", "max_usages": 3, "quota": None,
                                            "item": conf["id"], "price_mode": "percent", "value": "100.00"},
                 token="app")

# ── orders ───────────────────────────────────────────────────────────────────
o_paid = must("POST", E + "/orders/", {
    "email": "office@acme.example", "locale": "en", "status": "p", "payment_provider": "manual",
    "invoice_address": {"company": "Acme AS", "name_parts": {"_scheme": "full", "full_name": "Office Manager"},
                        "street": "Gate 1", "zipcode": "5003", "city": "Bergen", "country": "NO"},
    "positions": [
        {"positionid": 1, "item": conf["id"], "variation": var_early, "price": "2000.00",
         "attendee_name_parts": {"_scheme": "full", "full_name": "Kari Nordmann"},
         "attendee_email": "kari@acme.example", "company": "Acme Consulting",
         "answers": [{"question": jt["id"], "answer": "SRE", "options": []}]},
        {"positionid": 2, "item": workshop["id"], "addon_to": 1, "price": "1500.00"},
        {"positionid": 3, "item": shirt["id"], "price": "200.00"},
        {"positionid": 4, "item": conf["id"], "variation": var_std, "price": "2500.00",
         "attendee_name_parts": {"_scheme": "full", "full_name": "Ola Nordmann"},
         "attendee_email": "ola@acme.example"},
    ],
})
o_pending = must("POST", E + "/orders/", {
    "email": "late@example.org", "locale": "en", "status": "n", "payment_provider": "manual",
    "positions": [{"positionid": 1, "item": conf["id"], "variation": var_std, "price": "2500.00",
                   "attendee_name_parts": {"_scheme": "full", "full_name": "Late Payer"}}],
})
o_speaker = must("POST", E + "/orders/", {
    "email": "kari.speaker@example.org", "locale": "en", "status": "p", "payment_provider": "free",
    "positions": [{"positionid": 1, "item": speaker["id"], "price": "0.00", "voucher": "SPEAKER-KARI",
                   "attendee_name_parts": {"_scheme": "full", "full_name": "Kari Speaker"},
                   "attendee_email": "kari.speaker@example.org"}],
})
o_sponsor = must("POST", E + "/orders/", {
    "email": "guest@sponsor.example", "locale": "en", "status": "p", "payment_provider": "free",
    "positions": [{"positionid": 1, "item": conf["id"], "variation": var_std, "price": "0.00",
                   "voucher": "SPONSOR-ACME",
                   "attendee_name_parts": {"_scheme": "full", "full_name": "Sponsor Guest"},
                   "attendee_email": "guest@sponsor.example"}],
})
o_cancel = must("POST", E + "/orders/", {
    "email": "two@example.org", "locale": "en", "status": "p", "payment_provider": "manual",
    "positions": [
        {"positionid": 1, "item": conf["id"], "variation": var_std, "price": "2500.00",
         "attendee_name_parts": {"_scheme": "full", "full_name": "Stays"}},
        {"positionid": 2, "item": conf["id"], "variation": var_std, "price": "2500.00",
         "attendee_name_parts": {"_scheme": "full", "full_name": "Canceled Seat"}},
    ],
})
# Cancel ONE position of a paid order, then pay the pending order (fires order.paid).
second = [p for p in o_cancel["positions"] if p["positionid"] == 2][0]
probes["cancel_one_position"] = call("DELETE", f"{E}/orderpositions/{second['id']}/")[0]
probes["mark_paid"] = call("POST", f"{E}/orders/{o_pending['code']}/mark_paid/")[0]

# ── probes, all with the APP token ──────────────────────────────────────────
items = all_pages(E + "/items/?active=true")
probes["active_items"] = [(i["name"], i["active"], i["require_voucher"], i["hide_without_voucher"], i["admission"])
                          for i in items]
probes["variation_keys"] = sorted(items[0]["variations"][0].keys()) if items and items[0]["variations"] else None
probes["variation_windows"] = [(v_["value"], v_.get("available_from"), v_.get("available_until"), v_["price"])
                               for i in items for v_ in i["variations"]]
probes["quotas_availability"] = [(q["name"], q.get("available"), q.get("available_number"))
                                 for q in all_pages(E + "/quotas/?with_availability=true")]
probes["event"] = {k: must("GET", E + "/", token="app").get(k) for k in ("name", "currency", "public_url", "testmode")}
probes["event_settings_locale"] = call("GET", E + "/settings/", token="app")

orders = all_pages(E + "/orders/")
probes["orders"] = [{
    "code": o["code"], "status": o["status"], "email": o["email"], "total": o["total"],
    "company": (o.get("invoice_address") or {}).get("company"),
    "payments": [(p["state"], p["amount"], p["provider"]) for p in o["payments"]],
    "positions": [{
        "id": p["id"], "positionid": p["positionid"], "item": p["item"], "variation": p["variation"],
        "price": p["price"], "tax_value": p["tax_value"], "tax_rate": p["tax_rate"],
        "attendee_name": p["attendee_name"], "attendee_email": p["attendee_email"], "company": p["company"],
        "addon_to": p["addon_to"], "voucher": p["voucher"], "canceled": p["canceled"],
        "answers": [(a["question_identifier"], a["answer"]) for a in p["answers"]],
    } for p in o["positions"]],
} for o in orders]
probes["orders_with_canceled_positions"] = [
    (o["code"], [(p["positionid"], p["canceled"]) for p in o["positions"]])
    for o in all_pages(E + "/orders/?include_canceled_positions=true")
]
probes["vouchers"] = [(x["code"], x["redeemed"], x["max_usages"]) for x in all_pages(E + "/vouchers/")]
probes["voucher_delete_redeemed"] = call("DELETE", f"{E}/vouchers/{v['id']}/", token="app")
probes["version"] = call("GET", BASE + "/version", token="app")
probes["wrong_event_slug"] = call("GET", f"/organizers/{ORG}/events/nope/", token="app")[0]
probes["app_token_webhook_write"] = call("GET", f"/organizers/{ORG}/webhooks/", token="app")[0]
probes["order_codes"] = {"paid": o_paid["code"], "pending": o_pending["code"], "speaker": o_speaker["code"],
                         "sponsor": o_sponsor["code"], "partial_cancel": o_cancel["code"]}

json.dump(probes, open(os.path.join(HERE, "probes.json"), "w"), indent=1, ensure_ascii=False)
print("fixture + probes ok ->", os.path.join(HERE, "probes.json"))
