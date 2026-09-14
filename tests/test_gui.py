"""GUI transport contract tests. Play decisions use public responses only."""
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest

from kosodate.engine import Engine
from kosodate.gui import GuiServer
from kosodate.service import Service


class GuiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = Engine()

    @classmethod
    def tearDownClass(cls):
        cls.engine.close()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="kosodate-gui-test-")
        self.run = str(Path(self.tmp.name) / "family.sqlite")
        self.service = Service(self.engine)
        self.server = GuiServer(self.service, self.run)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.sequence = 0

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def http(self, method, path, packet=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=40)
        try:
            body = json.dumps(packet).encode() if packet is not None else None
            h = {"X-Session-Token": self.server.token, "Content-Type": "application/json"}
            h.update(headers or {})
            conn.request(method, path, body=body, headers=h)
            response = conn.getresponse()
            return response.status, response.read()
        finally:
            conn.close()

    def call(self, command, **args):
        status, body = self.http("POST", "/api/command", {"command": command, "args": args})
        self.assertEqual(status, 200)
        return json.loads(body)

    def start(self):
        self.response = self.call("new", scenario="home-01", seed=0, request_id="new")["response"]
        self.assertTrue(self.response["ok"], self.response)

    def update(self, command, value=None):
        self.sequence += 1
        args = dict(revision=self.response["revision"], request_id="gui-%d" % self.sequence)
        if value is not None:
            args["input"] = value
        data = self.call(command, **args)
        self.response = data["response"]
        self.assertTrue(self.response["ok"], self.response)
        return data

    def test_complete_life_cli_resume_and_replay(self):
        # Initial bootstrap is read-only: no empty save is created.
        initial = json.loads(self.http("GET", "/api/bootstrap")[1])
        self.assertIsNone(initial["response"])
        self.assertFalse(Path(self.run).exists())
        self.start()
        for turn in range(40):
            self.update("plan", self.response["public"]["forecast"]["fallback_plan"])
            for event in list(self.response["choices"]):
                option = next(o for o in event["options"] if o["cost"] == 0)
                self.update("choose", dict(event_instance=event["instance_id"], option_id=option["option_id"]))
            self.update("advance")
            self.assertEqual(self.response["public"]["time"]["completed_turns"], turn + 1)
            cli, code = self.service.execute("observe", run=self.run)
            self.assertEqual(code, 0)
            self.assertEqual(cli["public"], self.response["public"])
            self.assertEqual(cli["choices"], self.response["choices"])
        self.assertEqual(self.response["phase"], "finished")
        result = self.call("result")["response"]["payload"]
        reopened = json.loads(self.http("GET", "/api/bootstrap")[1])
        self.assertEqual(reopened["response"]["phase"], "finished")
        self.assertEqual(reopened["presets"], {})
        history = self.call("history", offset=0, limit=200)["response"]["payload"]
        self.assertIsNone(history["next_offset"])
        self.assertEqual(sum(h["kind"] == "turn" for h in history["items"]), 40)
        self.assertGreater(sum(h["kind"] == "adult" for h in history["items"]), 0)
        replay_path = str(Path(self.tmp.name) / "replay.sqlite")
        replay, code = self.service.execute("replay", run=self.run, out=replay_path, request_id="replay")
        self.assertEqual(code, 0, replay)
        self.assertTrue(replay["payload"]["matched"])
        self.assertEqual(self.service.execute("result", run=replay_path)[0]["payload"], result)

    def test_invalid_missing_resources_conflict_and_retry(self):
        self.start()
        self.assertEqual(self.call("advance", revision=0, request_id="missing")["response"]["error"]["code"], "ANSWER_REQUIRED")
        self.update("plan", {"parents": {"A": {"work": "heavy", "rest": 3, "bond": 2}}})
        event = self.response["choices"][0]
        self.update("choose", dict(event_instance=event["instance_id"], option_id=event["options"][0]["option_id"]))
        self.assertEqual(self.call("advance", revision=self.response["revision"], request_id="resources")["response"]["error"]["code"], "RESOURCE_LIMIT")
        self.update("plan", self.response["public"]["forecast"]["fallback_plan"])
        args = dict(revision=self.response["revision"], request_id="retry-advance")
        first = self.call("advance", **args)["response"]
        again = self.call("advance", **args)["response"]
        self.assertTrue(again["payload"]["receipt"]["duplicate"])
        self.assertEqual(first["public"], again["public"])
        self.assertEqual(again["public"]["time"]["completed_turns"], 1)
        conflict = self.call("reset-plan", revision=0, request_id="old")["response"]
        self.assertEqual(conflict["error"]["code"], "STALE_REVISION")
        invalid = self.call("plan", revision=first["revision"], request_id="bad", input={"parents":{"A":{"care":True}}})["response"]
        self.assertEqual(invalid["error"]["code"], "INVALID_INPUT")
        # A CLI edit becomes visible when the GUI reopens, including saved drafts.
        cli, code = self.service.execute("plan", run=self.run, revision=first["revision"], request_id="cli-edit", input={"parents":{"A":{"rest":2}}})
        self.assertEqual(code, 0)
        reopened = json.loads(self.http("GET", "/api/bootstrap")[1])["response"]
        self.assertEqual(reopened["public"], cli["public"])

    def test_public_boundary_and_http_guards(self):
        self.start()
        for command, args in (("debug-state", {}), ("replay", {}), ("observe", {"run":"/tmp/other.sqlite"})):
            self.assertEqual(self.call(command, **args)["response"]["error"]["code"], "INVALID_INPUT")
        for headers in ({"Origin":"https://example.com"}, {"Host":"example.com"}, {"X-Session-Token":"wrong"}, {"Sec-Fetch-Site":"cross-site"}):
            self.assertEqual(self.http("POST", "/api/command", {"command":"observe","args":{}}, headers)[0], 403)
        self.assertEqual(self.http("GET", "/api/bootstrap", headers={"X-Session-Token":""})[0], 403)
        for path in ("/../../README.md", "/game/simulation.gd", "/family.sqlite"):
            self.assertEqual(self.http("GET", path)[0], 404)
        for packet in (None, [], {"command":[],"args":{}}, {"command":"observe","args":[]}):
            status, body = self.http("POST", "/api/command", packet)
            self.assertIn(status, (200,400))
            self.assertNotIn(b'"state":', body)
        body = self.http("GET", "/api/bootstrap")[1]
        for forbidden in (b'"state":', b'"draws":', b'"effects":', b'"aptitude":'):
            self.assertNotIn(forbidden, body)
        status, html = self.http("GET", "/")
        self.assertEqual(status, 200)
        self.assertNotIn(b"__SESSION_TOKEN__", html)
