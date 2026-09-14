"""Atomic local saves, idempotent requests, replay and public responses."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import uuid

from .contract import (COMMANDS, READS, UPDATES, VERSIONS, Failure, actions, bounded,
                       canonical, invalid, merge_plan, request_id, validate_choice, validate_patch)
from .engine import Engine


def digest(state):
    return hashlib.sha256(canonical(state).encode("utf-8")).hexdigest()


def snapshot(state):
    return canonical({"state": state, "sha256": digest(state)})


def connect(path, write=False):
    uri = Path(path).resolve().as_uri() + ("?mode=rw" if write else "?mode=ro")
    conn = sqlite3.connect(uri, uri=True, timeout=5, isolation_level=None)
    conn.execute("PRAGMA busy_timeout=5000")
    if write:
        conn.execute("PRAGMA synchronous=FULL")
        conn.execute("PRAGMA journal_mode=DELETE")
    return conn


def load(conn):
    try:
        rows = conn.execute("SELECT id, save_version, revision, snapshot_json FROM run").fetchall()
    except sqlite3.OperationalError as exc:
        if "no such table" in str(exc):
            raise Failure("INCOMPLETE_RUN", "保存の作成が完了していません。別の保存先を使ってください。") from exc
        raise
    if len(rows) != 1: raise Failure("INCOMPLETE_RUN", "保存に有効な実行がありません。")
    run_id, version, revision, raw = rows[0]
    try:
        packed = json.loads(raw)
        state = packed["state"]
        if packed["sha256"] != digest(state): raise ValueError("checksum")
        if version != "save-1" or state["versions"] != VERSIONS:
            raise Failure("VERSION_MISMATCH", "この保存のルール・データ・保存版には対応していません。")
        if state["phase"] not in {"childhood", "finished"} or not 0 <= state["n"] <= 40: raise ValueError("phase")
        if (state["phase"] == "finished") != (state["n"] == 40): raise ValueError("phase")
        if type(revision) is not int or revision < 0: raise ValueError("revision")
        if conn.execute("SELECT count(*) FROM commits").fetchone()[0] != state["n"]: raise ValueError("commits")
        for key in ("parents", "child", "previous_plan", "grandparents", "answers"):
            if not isinstance(state[key], dict): raise ValueError(key)
        if not isinstance(state["history"], list): raise ValueError("history")
        return run_id, revision, state
    except (KeyError, ValueError, TypeError) as exc:
        raise Failure("CORRUPT_SAVE", "保存データの整合性を確認できません。") from exc


class Service:
    def __init__(self, engine=None):
        self.engine = engine
        self.owns_engine = engine is None
        self._test_hook = None

    def call_engine(self, op, **args):
        if self.engine is None: self.engine = Engine()
        return self.engine.call(op, **args)

    def close(self):
        if self.owns_engine and self.engine: self.engine.close()

    @staticmethod
    def envelope(command, context=None, view=None, payload=None, error=None):
        return {"api_version": "cli-1", "ok": error is None, "command": command,
                "run_id": context[0] if context else None, "revision": context[1] if context else None,
                "phase": context[2]["phase"] if context else None,
                "public": view["public"] if view else None, "choices": view["choices"] if view else [],
                "payload": payload if error is None else None,
                "error": {"code": error.code, "message": error.message, "details": error.details} if error else None}

    def execute(self, command, **args):
        context, view, conn = None, None, None
        try:
            self.validate(command, args)
            if command == "scenarios":
                return self.envelope(command, payload={"scenarios": [
                    {"id": "home-01", "label": "基本の家庭", "description": "子ども1人の人生を通す"},
                    {"id": "home-02", "label": "もう一つの家庭", "description": "子ども1人の人生を通す"}]}), 0
            if command in {"new", "replay"}:
                return self.create(command, args)
            path = Path(args["run"])
            if not path.exists(): raise Failure("RUN_NOT_FOUND", "保存ファイルがありません。")
            conn = connect(path, command in UPDATES)
            conn.execute("BEGIN IMMEDIATE" if command in UPDATES else "BEGIN")
            context = load(conn)
            run_id, revision, state = context
            view = self.call_engine("observe", state=state)["view"]
            if command in UPDATES:
                normalized = self.normalized(command, args)
                duplicate = self.duplicate(conn, args["request_id"], normalized)
                if duplicate: return duplicate, 0
                if args["revision"] != revision:
                    raise Failure("STALE_REVISION", "状態が更新されています。observeで最新のrevisionを取得してください。")
                if state["phase"] == "finished": raise Failure("FINISHED", "この人生は終了しています。resultで振り返れます。")
                old_count = len(state["history"])
                if command == "plan": state["plan"] = merge_plan(state["plan"], args["input"])
                elif command == "choose":
                    choice = args["input"]
                    found = any(e["instance_id"] == choice["event_instance"] and
                                any(o["option_id"] == choice["option_id"] for o in e["options"]) for e in view["choices"])
                    if not found: raise Failure("UNKNOWN_ACTION", "現在提示されている出来事と選択肢のIDを指定してください。")
                    state["answers"][choice["event_instance"]] = choice["option_id"]
                elif command == "reset-plan": state["plan"] = copy.deepcopy(state["previous_plan"])
                else:
                    f = view["public"]["forecast"]
                    missing = [r for r in f["reasons"] if r["code"] == "ANSWER_REQUIRED"]
                    if missing: raise Failure("ANSWER_REQUIRED", "出来事への回答が必要です。", [{"path": r["path"], "reason": r["message"]} for r in missing])
                    if not f["can_advance"]: raise Failure("RESOURCE_LIMIT", "方針の配分を調整してください。", [{"path": r["path"], "reason": r["message"]} for r in f["reasons"]])
                calculated = self.call_engine("advance" if command == "advance" else "observe", state=state)
                state, view = calculated["state"], calculated["view"]
                context = (run_id, revision + 1, state)
                if command == "advance":
                    turn = state["history"][old_count]
                    conn.execute("INSERT INTO commits VALUES(?,?,?,?)", (state["n"], canonical(turn["actions"]["plan"]), canonical(turn["actions"]["answers"]), digest(state)))
                payload = {"receipt": {"request_id": args["request_id"], "applied_revision": revision + 1, "duplicate": False}, "history_added": state["history"][old_count:]}
                response = self.envelope(command, context, view, payload)
                conn.execute("UPDATE run SET revision=?,snapshot_json=? WHERE id=?", (revision + 1, snapshot(state), run_id))
                conn.execute("INSERT INTO receipts VALUES(?,?,?)", (args["request_id"], normalized, canonical(response)))
                if self._test_hook: self._test_hook("before_commit", command)
                conn.commit()
                if self._test_hook: self._test_hook("after_commit", command)
                return response, 0
            payload = {}
            if command == "actions": payload = actions(view["choices"])
            elif command == "history":
                offset, limit = args.get("offset", 0), args.get("limit", 50)
                total = len(state["history"])
                payload = {"items": state["history"][offset:offset + limit], "next_offset": offset + limit if offset + limit < total else None, "total": total}
            elif command == "result":
                if state["phase"] != "finished": raise Failure("NOT_FINISHED", "まだ育児編の途中です。")
                payload = state["result"]
            elif command == "debug-state": payload = {"debug_only": True, "state": state, "draws": state["draws"], "effects": state["effects"]}
            return self.envelope(command, context, view, payload), 0
        except Failure as exc:
            return self.envelope(command, context, view, error=exc), exc.exit_code
        except sqlite3.Error as exc:
            code = "RUN_LOCKED" if "locked" in str(exc) or "busy" in str(exc) else "CORRUPT_SAVE"
            failure = Failure(code, "保存ファイルを利用できません。" if code == "CORRUPT_SAVE" else "別の操作が保存中です。時間を置いて再試行してください。")
            return self.envelope(command, context, view, error=failure), failure.exit_code
        except OSError:
            failure = Failure("IO_ERROR", "ファイルの読み書きに失敗しました。保存先と権限を確認してください。")
            return self.envelope(command, context, view, error=failure), 5
        except (RuntimeError, ValueError, KeyError, TypeError, BrokenPipeError):
            failure = Failure("INTERNAL_ERROR", "エンジンの処理が完了しませんでした。Godotの導入状況を確認してください。保存済みの状態から再開できます。")
            return self.envelope(command, context, view, error=failure), 6
        finally:
            if conn:
                if conn.in_transaction: conn.rollback()
                conn.close()

    @staticmethod
    def validate(command, args):
        if command not in COMMANDS: raise Failure("UNKNOWN_COMMAND", "不明なコマンドです。--helpを確認してください。")
        required = set()
        if command != "scenarios": required.add("run")
        if command in UPDATES: required.update({"revision", "request_id"})
        if command in {"plan", "choose"}: required.add("input")
        if command == "new": required.update({"scenario", "seed", "request_id"})
        if command == "replay": required.update({"out", "request_id"})
        allowed = required | ({"offset", "limit"} if command == "history" else set())
        if set(args) - allowed: invalid("このコマンドでは使えない引数です", sorted(set(args) - allowed)[0])
        for key in required:
            if key not in args or args[key] is None: invalid("必須引数がありません", key)
        if "request_id" in args: request_id(args["request_id"])
        if "revision" in args: bounded(args["revision"], 0, 2**63 - 1, "revision")
        if command == "new":
            if args["scenario"] not in {"home-01", "home-02"}: invalid("不明な初期家庭です", "scenario")
            bounded(args["seed"], 0, 4294967295, "seed")
        if command == "plan": validate_patch(args["input"])
        if command == "choose": validate_choice(args["input"])
        if command == "history":
            bounded(args.get("offset", 0), 0, 2**31 - 1, "offset")
            bounded(args.get("limit", 50), 1, 200, "limit")

    @staticmethod
    def normalized(command, args, source_run_id=None):
        value = {k: v for k, v in args.items() if k not in {"run", "out", "request_id"}}
        value["command"] = command
        if source_run_id: value["source_run_id"] = source_run_id
        return canonical(value)

    @staticmethod
    def duplicate(conn, rid, normalized):
        row = conn.execute("SELECT request_json,response_json FROM receipts WHERE request_id=?", (rid,)).fetchone()
        if not row: return None
        if row[0] != normalized: raise Failure("REQUEST_ID_CONFLICT", "同じrequest-idが別の入力で使用済みです。")
        try:
            response = json.loads(row[1])
            if not isinstance(response.get("payload"), dict): raise ValueError("receipt")
        except (ValueError, TypeError, AttributeError) as exc:
            raise Failure("CORRUPT_SAVE", "保存された操作の応答を読み込めません。") from exc
        response["payload"].setdefault("receipt", {})["duplicate"] = True
        return response

    def create(self, command, args):
        source = None
        commits = []
        if command == "replay":
            if not Path(args["run"]).exists(): raise Failure("RUN_NOT_FOUND", "再生元の保存がありません。")
            conn = connect(args["run"])
            try:
                conn.execute("BEGIN")
                source = load(conn)
                commits = conn.execute("SELECT turn,plan_json,answers_json,digest FROM commits ORDER BY turn").fetchall()
            finally: conn.close()
        normalized = self.normalized(command, args, source[0] if source else None)
        path = Path(args["out"] if source else args["run"])
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
        except FileExistsError:
            conn = connect(path)
            try:
                conn.execute("BEGIN")
                context = load(conn)
                view = self.call_engine("observe", state=context[2])["view"]
                try:
                    duplicate = self.duplicate(conn, args["request_id"], normalized)
                    if duplicate: return duplicate, 0
                    raise Failure("RUN_EXISTS", "保存先が使用済みです。新しいパスを指定してください。")
                except Failure as failure:
                    return self.envelope(command, context, view, error=failure), failure.exit_code
            finally: conn.close()
        conn = connect(path, True)
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("CREATE TABLE run(id TEXT PRIMARY KEY,save_version TEXT,revision INTEGER,snapshot_json TEXT)")
            conn.execute("CREATE TABLE receipts(request_id TEXT PRIMARY KEY,request_json TEXT,response_json TEXT)")
            conn.execute("CREATE TABLE commits(turn INTEGER PRIMARY KEY,plan_json TEXT,answers_json TEXT,digest TEXT)")
            scenario, seed = (source[2]["scenario"], source[2]["seed"]) if source else (args["scenario"], args["seed"])
            calculated = self.call_engine("new", scenario=scenario, seed=seed)
            state, view = calculated["state"], calculated["view"]
            matched = True
            for turn, plan, answers, expected in commits:
                state["plan"] = json.loads(plan)
                state["answers"] = {a["event_instance"]: a["option_id"] for a in json.loads(answers)}
                calculated = self.call_engine("observe", state=state)
                if not calculated["view"]["public"]["forecast"]["can_advance"]:
                    raise Failure("REPLAY_MISMATCH", "再生する操作の確定条件が一致しません。")
                calculated = self.call_engine("advance", state=state)
                state, view = calculated["state"], calculated["view"]
                actual = digest(state)
                conn.execute("INSERT INTO commits VALUES(?,?,?,?)", (turn, plan, answers, actual))
                if turn != state["n"] or actual != expected:
                    matched = False
                    break
            context = (str(uuid.uuid4()), state["n"] if source else 0, state)
            conn.execute("INSERT INTO run VALUES(?,?,?,?)", (context[0], "save-1", context[1], snapshot(state)))
            if source:
                payload = {"source_run_id": source[0], "new_run_id": context[0], "matched": matched, "compared_turns": state["n"], "compared_adult_steps": sum(h["kind"] == "adult" for h in state["history"]), "receipt": {"request_id": args["request_id"], "applied_revision": context[1], "duplicate": False}}
            else:
                payload = {"receipt": {"request_id": args["request_id"], "applied_revision": 0, "duplicate": False}, "history_added": []}
            failure = None if matched else Failure("REPLAY_MISMATCH", "確定操作を再生した結果が一致しません。")
            response = self.envelope(command, context, view, payload, failure)
            if matched: conn.execute("INSERT INTO receipts VALUES(?,?,?)", (args["request_id"], normalized, canonical(response)))
            conn.commit()
            return response, 0 if matched else 6
        finally:
            if conn.in_transaction: conn.rollback()
            conn.close()
