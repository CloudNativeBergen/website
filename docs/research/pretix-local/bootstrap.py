# Run with: docker exec pretix-local pretix shell -c "exec(open('/data/bootstrap.py').read())"
# Idempotent. Writes the two tokens to /data/tokens.json (scratchpad, never the repo).
import json

from pretix.base.models import Organizer, Team, TeamAPIToken

org, _ = Organizer.objects.get_or_create(slug="cndn-test", defaults={"name": "CNDN test"})

setup, _ = Team.objects.get_or_create(
    organizer=org,
    name="setup (fixture builder)",
    defaults=dict(all_events=True, all_event_permissions=True, all_organizer_permissions=True),
)
app, _ = Team.objects.get_or_create(
    organizer=org,
    name="app (least privilege)",
    defaults=dict(
        all_events=True,
        limit_event_permissions={
            "event.orders:read": True,
            "event.vouchers:read": True,
            "event.vouchers:write": True,
        },
    ),
)


def token(team):
    t = team.tokens.filter(active=True).first() or TeamAPIToken.objects.create(team=team, name=team.name)
    return t.token


out = {"organizer": org.slug, "setup": token(setup), "app": token(app)}
with open("/data/tokens.json", "w") as f:
    json.dump(out, f)
print("bootstrap ok:", org.slug, "app perms:", sorted(app.event_permission_set(include_legacy=False)))
