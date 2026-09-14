import copy
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from kosodate.contract import Failure, strict_json
from kosodate.engine import Engine, ROOT
from kosodate.service import Service, snapshot


class CliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.engine = Engine()

    @classmethod
    def tearDownClass(cls): cls.engine.close()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="kosodate-test-")
        self.run = str(Path(self.tmp.name) / "run.sqlite")
        self.service = Service(self.engine)
        self.counter = 0
        self.response = self.ok("new", scenario="home-01", seed=0, request_id="new")

    def tearDown(self): self.tmp.cleanup()

    def ok(self, cmd, **args):
        args.setdefault("run", self.run)
        r, code = self.service.execute(cmd, **args)
        self.assertEqual(code, 0, r)
        return r

    def update(self, cmd, value=None):
        self.counter += 1
        kwargs = dict(revision=self.response["revision"], request_id="request-%d" % self.counter)
        if value is not None: kwargs["input"] = value
        self.response = self.ok(cmd, **kwargs)
        return self.response

    def turn(self):
        fallback = self.response["public"]["forecast"]["fallback_plan"]
        self.update("plan", fallback)
        for event in list(self.response["choices"]):
            option = next(o for o in event["options"] if o["cost"] == 0)
            self.update("choose", dict(event_instance=event["instance_id"], option_id=option["option_id"]))
        self.update("advance")

    def cli(self, *args, data=None):
        p = subprocess.run([sys.executable, "-m", "kosodate", *args], cwd=ROOT, input=data,
                           capture_output=True, text=True, timeout=40)
        return json.loads(p.stdout), p.returncode, p.stderr

    def test_duplicate_conflicts_and_read_only(self):
        args = dict(run=self.run, revision=0, request_id="answer", input=dict(event_instance="t01:E-01", option_id="E-01:watch"))
        response, code = self.service.execute("choose", **args)
        self.assertEqual(code, 0)
        self.response = response
        self.update("advance")
        duplicate, code = self.service.execute("choose", **args)
        self.assertEqual(code, 0)
        self.assertEqual(duplicate["revision"], 1)
        self.assertEqual(duplicate["public"]["time"]["completed_turns"], 0)
        self.assertTrue(duplicate["payload"]["receipt"]["duplicate"])
        args["input"]["option_id"] = "E-01:cuddle"
        self.assertEqual(self.service.execute("choose", **args)[0]["error"]["code"], "REQUEST_ID_CONFLICT")
        args["request_id"] = "new-id"
        self.assertEqual(self.service.execute("choose", **args)[0]["error"]["code"], "STALE_REVISION")
        before = Path(self.run).read_bytes()
        for _ in range(10): self.ok("observe")
        self.assertEqual(Path(self.run).read_bytes(), before)
        duplicate = self.ok("new", scenario="home-01", seed=0, request_id="new")
        self.assertEqual(duplicate["revision"], 0)
        self.assertEqual(self.service.execute("new", run=self.run, scenario="home-01", seed=0, request_id="different")[0]["error"]["code"], "RUN_EXISTS")

    def test_invalid_edits_atomicity_and_reset(self):
        before = Path(self.run).read_bytes()
        for patch in ({"parents": {"A": {"care": True}}}, {"activity": {"domain": "craft"}}, {"unknown": 2}, {}, {"parents": None}):
            result, code = self.service.execute("plan", run=self.run, revision=0, request_id="invalid", input=patch)
            self.assertEqual(code, 2, result)
            self.assertEqual(Path(self.run).read_bytes(), before)
        self.update("plan", {"parents": {"A": {"work": "heavy", "bond": 2, "rest": 3}}})
        self.update("choose", dict(event_instance="t01:E-01", option_id="E-01:watch"))
        before = Path(self.run).read_bytes()
        result, code = self.service.execute("advance", run=self.run, revision=self.response["revision"], request_id="too-much")
        self.assertEqual(code, 3)
        self.assertEqual(result["error"]["code"], "RESOURCE_LIMIT")
        self.assertEqual(Path(self.run).read_bytes(), before)
        self.update("reset-plan")
        self.assertEqual(len(self.response["public"]["answers"]), 1)
        self.update("advance")
        self.assertEqual(self.response["public"]["cash"], 160)

    def test_cli_input_validation_and_envelope(self):
        for data in ('{"parents":{},"parents":{}}', '{"parents":{"A":{"care":true}}}', '{"parents":{"A":{"care":1.0}}}', '{"parents":{"A":{"care":NaN}}}', '[1]', '{', '{"unknown":1}'):
            result, code, err = self.cli("plan", "--run", self.run, "--revision", "0", "--request-id", "bad", "--input", "-", data=data)
            self.assertEqual(code, 2, result)
            self.assertEqual(err, "")
            self.assertEqual(set(result), {"api_version", "ok", "command", "run_id", "revision", "phase", "public", "choices", "payload", "error"})
        for args, expected in ((["unknown"], "UNKNOWN_COMMAND"), (["observe", "--run", "/tmp/no-kosodate-save-xyz"], "RUN_NOT_FOUND"), (["plan", "--run", self.run], "INVALID_INPUT")):
            result, _, _ = self.cli(*args)
            self.assertEqual(result["error"]["code"], expected)
        result, code, err = self.cli("observe", "--run", self.run)
        self.assertEqual(code, 0)
        self.assertEqual(err, "")

    def test_partial_and_full_replay_finished_and_history(self):
        self.turn()
        self.update("plan", {"parents": {"A": {"rest": 3}}})
        replay = str(Path(self.tmp.name) / "partial.sqlite")
        result = self.ok("replay", out=replay, request_id="replay")
        self.assertTrue(result["payload"]["matched"])
        self.assertEqual(result["public"]["plan"]["parents"]["A"]["rest"], 0)
        for _ in range(39): self.turn()
        self.assertEqual(self.response["phase"], "finished")
        self.assertEqual(self.response["public"]["time"]["child_months"], 240)
        self.assertIsNone(self.response["public"]["plan"])
        self.assertEqual(self.response["choices"], [])
        final = self.ok("result")["payload"]
        self.assertIn(final["ending"]["id"], {"EN-01", "EN-02", "EN-03", "EN-04", "EN-05"})
        full = str(Path(self.tmp.name) / "full.sqlite")
        before = Path(self.run).read_bytes()
        result = self.ok("replay", out=full, request_id="replay-full")
        self.assertTrue(result["payload"]["matched"])
        self.assertEqual(result["payload"]["compared_turns"], 40)
        self.assertEqual(self.ok("result", run=full)["payload"], final)
        self.assertEqual(Path(self.run).read_bytes(), before)
        for command in ("plan", "choose", "advance", "reset-plan"):
            args = dict(run=self.run, revision=self.response["revision"], request_id="finished-"+command)
            if command == "plan": args["input"] = {"style": "respect"}
            if command == "choose": args["input"] = dict(event_instance="t40:E-08", option_id="E-08:send")
            self.assertEqual(self.service.execute(command, **args)[0]["error"]["code"], "FINISHED")
        history, offset = [], 0
        while True:
            page = self.ok("history", offset=offset, limit=7)["payload"]
            history.extend(page["items"])
            if page["next_offset"] is None: break
            offset = page["next_offset"]
        self.assertEqual([h["turn"] for h in history if h["kind"] == "turn"], list(range(1, 41)))
        self.assertEqual([h["index"] for h in history], list(range(len(history))))

    def test_save_corruption_incomplete_and_version(self):
        for name, content in (("empty", b""), ("garbage", b"bad sqlite")):
            path = Path(self.tmp.name) / name; path.write_bytes(content)
            result, code = self.service.execute("observe", run=str(path))
            self.assertEqual(code, 5)
            self.assertEqual(result["error"]["code"], "INCOMPLETE_RUN" if name == "empty" else "CORRUPT_SAVE")
            self.assertEqual(path.read_bytes(), content)
        with sqlite3.connect(self.run) as conn:
            conn.execute("UPDATE run SET save_version='future'")
        before = Path(self.run).read_bytes()
        self.assertEqual(self.service.execute("observe", run=self.run)[0]["error"]["code"], "VERSION_MISMATCH")
        self.assertEqual(Path(self.run).read_bytes(), before)

    def test_corrupt_checksum_and_replay_mismatch(self):
        self.turn()
        with sqlite3.connect(self.run) as conn:
            conn.execute("UPDATE commits SET digest='bad'")
        target = str(Path(self.tmp.name) / "mismatch.sqlite")
        response, code = self.service.execute("replay", run=self.run, out=target, request_id="mismatch")
        self.assertEqual(code, 6)
        self.assertEqual(response["error"]["code"], "REPLAY_MISMATCH")
        self.assertTrue(Path(target).exists())
        with sqlite3.connect(self.run) as conn:
            row = json.loads(conn.execute("SELECT snapshot_json FROM run").fetchone()[0])
            row["state"]["cash"] += 1
            conn.execute("UPDATE run SET snapshot_json=?", (json.dumps(row),))
        before = Path(self.run).read_bytes()
        self.assertEqual(self.service.execute("observe", run=self.run)[0]["error"]["code"], "CORRUPT_SAVE")
        self.assertEqual(Path(self.run).read_bytes(), before)

    def test_competing_cli_processes(self):
        commands = [[sys.executable, "-m", "kosodate", "reset-plan", "--run", self.run, "--revision", "0", "--request-id", name] for name in ("race-a", "race-b")]
        processes = [subprocess.Popen(c, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for c in commands]
        results = [json.loads(p.communicate(timeout=40)[0]) for p in processes]
        self.assertEqual(sum(r["ok"] for r in results), 1)
        self.assertEqual(next(r for r in results if not r["ok"])["error"]["code"], "STALE_REVISION")

    def test_forced_process_exit_at_commit_turn_one_and_forty(self):
        for completed in (0, 39):
            if completed:
                for _ in range(39): self.turn()
            self.update("plan", self.response["public"]["forecast"]["fallback_plan"])
            for event in list(self.response["choices"]):
                self.update("choose", dict(event_instance=event["instance_id"], option_id=next(o["option_id"] for o in event["options"] if o["cost"] == 0)))
            for point in ("before_commit", "after_commit"):
                target = str(Path(self.tmp.name) / ("crash-%s-%s.sqlite" % (completed, point)))
                Path(target).write_bytes(Path(self.run).read_bytes())
                script = "from kosodate.service import Service; import os,sys; s=Service(); s._test_hook=lambda p,c: os._exit(77) if p==sys.argv[3] else None; s.execute('advance',run=sys.argv[1],revision=int(sys.argv[2]),request_id='crash')"
                p = subprocess.run([sys.executable, "-c", script, target, str(self.response["revision"]), point], cwd=ROOT, timeout=40)
                self.assertEqual(p.returncode, 77)
                observed = self.ok("observe", run=target)
                self.assertEqual(observed["public"]["time"]["completed_turns"], completed + int(point == "after_commit"))
                self.assertEqual(observed["phase"], "finished" if completed == 39 and point == "after_commit" else "childhood")
                response, code = self.service.execute("advance", run=target, revision=self.response["revision"], request_id="crash")
                self.assertEqual(code, 0, response)
                self.assertEqual(response["public"]["time"]["completed_turns"], completed + 1)


if __name__ == "__main__": unittest.main()
