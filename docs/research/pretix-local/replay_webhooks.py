# Run: docker exec pretix-local pretix shell -c "exec(open('/data/replay_webhooks.py').read())"
# Replays this event's order log entries through pretix's real send_webhook task, with
# the private-network guard lifted for THIS process only (the instance config is untouched).
from django.conf import settings
from django_scopes import scopes_disabled

from pretix.api.models import WebHook, WebHookCall
from pretix.api.webhooks import get_all_webhook_events, send_webhook
from pretix.base.models import LogEntry

settings.ALLOW_HTTP_TO_PRIVATE_NETWORKS = True
types = get_all_webhook_events()
with scopes_disabled():
    hook = WebHook.objects.get(organizer__slug="cndn-test")
    entries = list(
        LogEntry.all.filter(event__slug="cndn27", action_type__startswith="pretix.event.order.").order_by("id")
    )
    for le in entries:
        if le.action_type in types and hook.listeners.filter(action_type=le.action_type).exists() or (
            le.action_type.startswith("pretix.event.order.changed.")
            and hook.listeners.filter(action_type="pretix.event.order.changed.*").exists()
        ):
            r = send_webhook.apply(args=(le.id, le.action_type, hook.id))
            print(le.action_type, "->", r.result)
        else:
            print(le.action_type, "(not subscribed or not a webhook type)")
    print("calls:", list(WebHookCall.objects.values_list("action_type", "return_code", "success")))
