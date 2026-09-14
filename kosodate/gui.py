"""Loopback-only GUI transport for the public CLI service. No game rules."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import threading
import webbrowser

from .contract import Failure, actions, canonical, invalid, strict_json
from .play import preset

WEB = Path(__file__).with_name("web")
PUBLIC_COMMANDS = {"new", "observe", "actions", "plan", "choose", "reset-plan",
                   "advance", "forecast", "history", "result"}


class GuiServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, service, run, scenario="home-01", seed=0, port=0):
        self.service = service
        self.run_path = str(Path(run).resolve())
        self.defaults = {"scenario": scenario, "seed": seed}
        self.token = secrets.token_urlsafe(32)
        self.lock = threading.Lock()
        super().__init__(("127.0.0.1", port), GuiHandler)
        self.authority = "127.0.0.1:%d" % self.server_port
        self.url = "http://" + self.authority

    def present(self, response):
        pub = response.get("public")
        presets = {str(i): preset(pub, str(i)) for i in range(1, 5)} if pub and pub.get("plan") else {}
        return {"response": response, "presets": presets}

    def bootstrap(self):
        with self.lock:
            response = self.service.execute("observe", run=self.run_path)[0] if Path(self.run_path).exists() else None
            scenarios = self.service.execute("scenarios")[0]["payload"]["scenarios"]
            data = self.present(response) if response else {"response": None, "presets": {}}
            return dict(data, fields=actions([])["plan_fields"], scenarios=scenarios,
                        defaults=self.defaults, save_name=Path(self.run_path).name)

    def dispatch(self, packet):
        command = ""
        try:
            if not isinstance(packet, dict) or set(packet) != {"command", "args"}:
                invalid("commandとargsを指定してください")
            command, args = packet["command"], packet["args"]
            if not isinstance(command, str) or command not in PUBLIC_COMMANDS:
                invalid("この画面では利用できない操作です")
            if not isinstance(args, dict) or set(args) - {"revision", "request_id", "input", "scenario", "seed", "offset", "limit"}:
                invalid("利用できない引数です")
            with self.lock:
                return self.present(self.service.execute(command, run=self.run_path, **args)[0])
        except Failure as failure:
            return self.present(self.service.envelope(command, error=failure))


class GuiHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, *_):
        pass

    def reply(self, status, body, content_type="application/json; charset=utf-8"):
        if not isinstance(body, bytes):
            body = canonical(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # A dropped response can be retried using the same request-id.

    def trusted(self, token=False):
        valid = self.headers.get("Host") == self.server.authority
        origin = self.headers.get("Origin")
        valid = valid and (origin is None or origin == self.server.url)
        valid = valid and self.headers.get("Sec-Fetch-Site") != "cross-site"
        if token:
            valid = valid and secrets.compare_digest(self.headers.get("X-Session-Token", ""), self.server.token)
        if not valid:
            self.reply(403, {"message": "この画面からの操作を確認できません。起動時のURLを開き直してください。"})
        return valid

    def do_GET(self):
        if not self.trusted():
            return
        if self.path == "/api/bootstrap":
            if self.trusted(token=True):
                self.reply(200, self.server.bootstrap())
            return
        files = {"/": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript"),
                 "/scene.js": ("scene.js", "text/javascript"), "/style.css": ("style.css", "text/css")}
        if self.path not in files:
            self.reply(404, {"message": "ページがありません。"})
            return
        name, mime = files[self.path]
        data = (WEB / name).read_bytes()
        if name == "index.html":
            data = data.replace(b"__SESSION_TOKEN__", self.server.token.encode("ascii"))
        self.reply(200, data, mime + "; charset=utf-8")

    def do_POST(self):
        if not self.trusted(token=True):
            return
        if self.path != "/api/command":
            self.reply(404, {"message": "操作先がありません。"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 65536:
                invalid("入力は1〜65536バイトで指定してください")
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                invalid("JSON形式で送信してください")
            packet = strict_json(self.rfile.read(length))
        except (Failure, ValueError) as exc:
            self.reply(400, {"message": str(exc)})
            return
        self.reply(200, self.server.dispatch(packet))


def gui(service, run, scenario="home-01", seed=0, port=0, open_browser=True):
    # Validate launch defaults without creating a save before the player starts.
    service.validate("new", dict(run=run, scenario=scenario, seed=seed, request_id="gui-start"))
    with GuiServer(service, run, scenario, seed, port) as server:
        print("親伝説 — Become a Parent\n画面：%s\n保存先：%s\n終了は Ctrl+C。保存した方針と回答から再開できます。" % (server.url, server.run_path), flush=True)
        if open_browser:
            webbrowser.open(server.url)
        try:
            server.serve_forever(poll_interval=0.2)
        except KeyboardInterrupt:
            print("\nゲーム画面を終了しました。")
        finally:
            # Wait for an in-flight commit before the caller closes Godot.
            with server.lock:
                pass
    return 0
