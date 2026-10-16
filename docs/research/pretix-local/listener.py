"""Webhook capture for a throwaway local Pretix. Runs INSIDE the container, loopback only."""
import datetime
import http.server
import json

LOG = "/data/webhooks.ndjson"


class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        rec = {
            "at": datetime.datetime.utcnow().isoformat() + "Z",
            "path": self.path,
            "headers": dict(self.headers),
            "body": body,
        }
        with open(LOG, "a") as f:
            f.write(json.dumps(rec) + "\n")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *a):
        pass


http.server.HTTPServer(("127.0.0.1", 8346), H).serve_forever()
