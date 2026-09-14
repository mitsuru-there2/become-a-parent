"""A deterministic public-only CLI player, not an independent LLM study.

This file reads no save, engine source, debug-state, or reference calculations.
Public input/output and reasons are recorded separately from internal tests.
"""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import sys
import uuid


class PublicPlayer:
    def __init__(self, process, directory, pattern, seed, max_calls=600):
        self.process = process
        self.directory = directory
        self.pattern, self.seed = pattern, seed
        self.path = str((directory / (pattern + "-seed%d.sqlite" % seed)).resolve())
        self.count, self.advances = 0, 0
        self.max_calls = max_calls
        self.changed, self.paused_once = False, False
        self.repeat_error, self.last_error = 0, None
        self.log = open(directory / (pattern + "-seed%d.jsonl" % seed), "w", encoding="utf-8")
        self.started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.response = None

    def call(self, command, reason, **args):
        if self.count >= self.max_calls: raise RuntimeError("operation_limit")
        request = dict(command=command, **args)
        request.setdefault("run", self.path)
        if command in {"new", "plan", "choose", "reset-plan", "advance", "replay"}: request["request_id"] = uuid.uuid4().hex
        if command in {"plan", "choose", "reset-plan", "advance"}: request["revision"] = self.response["revision"]
        seen = [o["code"] for o in self.response["public"]["observations"]] if self.response and self.response["public"] else []
        self.process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line: raise RuntimeError("external_interruption")
        result = json.loads(line)
        self.count += 1
        self.log.write(json.dumps(dict(time=datetime.datetime.now(datetime.timezone.utc).isoformat(), input=request, output=result["response"], exit_code=result["exit_code"], observed_ids=seen, reason=reason), ensure_ascii=False) + "\n")
        self.log.flush()
        self.response = result["response"]
        if result["exit_code"]:
            signature = (command, json.dumps(args, sort_keys=True), self.response["error"]["code"])
            self.repeat_error = self.repeat_error + 1 if signature == self.last_error else 1
            self.last_error = signature
            if self.repeat_error >= 3: raise RuntimeError("stuck")
            raise RuntimeError("input_error: " + self.response["error"]["code"])
        self.repeat_error = 0
        if command == "advance": self.advances += 1
        return self.response

    def select_plan(self, public):
        import copy
        plan = copy.deepcopy(public["forecast"]["fallback_plan"])
        obs = {o["code"]: o["text"] for o in public["observations"]}
        tired = obs["energy"] != "余裕がありそう" or max(p["stress"] for p in public["parents"].values()) >= 70
        if self.pattern == "BP-03" and tired: self.changed = True
        goal = self.pattern == "BP-02" or (self.pattern == "BP-03" and not self.changed)
        own = self.pattern == "BP-04"
        layout = [("heavy", 0, 1, 0), ("normal", 1, 1, 0)] if goal else ([("heavy", 0, 1, 2), ("normal", 0, 1, 2)] if own else [("normal", 1, 2, 1)] * 2)
        for p, (work, bond, rest, own_time) in zip(("A", "B"), layout):
            plan["parents"][p].update(work=work, bond=bond, rest=rest, self=own_time)
        active = public["time"]["stage"] != "baby" and not own
        if self.pattern == "BP-03" and self.changed and tired:
            active = False
            for p in ("A", "B"): plan["parents"][p]["rest"] = 3
        if self.pattern in {"BP-01", "BP-05"} and "settling" in obs and not self.paused_once:
            active, self.paused_once = False, True
        plan["activity"] = dict(domain="craft" if active else "none", level=(2 if goal else 1) if active else 0, sponsor="B" if goal else "A")
        plan["style"] = "coach" if goal and public["time"]["stage"] != "baby" else "respect"
        return plan, goal

    def run(self):
        status, error = "completed", None
        result = None
        try:
            self.call("new", "指定された家庭とシードで開始する。", scenario="home-02" if self.pattern == "BP-05" else "home-01", seed=self.seed)
            run_id = self.response["run_id"]
            self.call("actions", "公開されている操作項目と値域を取得する。")
            discovered = {f["path"] for f in self.response["payload"]["plan_fields"]}
            if "parents.A.care" not in discovered: raise RuntimeError("input_error")
            while self.response["phase"] != "finished":
                public = self.response["public"]
                plan, goal = self.select_plan(public)
                self.call("plan", "公開された世話の必要量を配分し、比較目的と疲れの観察に合わせる。", input=plan)
                for event in list(self.response["choices"]):
                    option = {
                        "E-01": "watch", "E-02": "dive" if goal or self.pattern in {"BP-01", "BP-05"} else "gradual",
                        "E-03": "lessons" if goal else "play", "E-04": "drill" if goal else "cheer",
                        "E-05": "continue" if goal else "listen", "E-06": "back" if goal else "pace",
                        "E-07": "suggest" if goal else "ask", "E-08": "prepare" if goal else "send",
                        "E-09": "accept" if goal else "coordinate", "E-10": "defer" if goal else "repair"}[event["event_id"]]
                    wanted = event["event_id"] + ":" + option
                    chosen = next(o for o in event["options"] if o["option_id"] == wanted)
                    self.call("choose", "表示された選択肢「%s」を目的に合わせて選ぶ。" % chosen["label"], input=dict(event_instance=event["instance_id"], option_id=wanted))
                if not self.response["public"]["forecast"]["can_advance"]: raise RuntimeError("input_error: forecast")
                self.call("advance", "公開予測で収支・時間・世話と全回答が成立しているため半年を確定する。")
            self.call("result", "親子の幸福と結末を振り返る。")
            result = self.response["payload"]
            self.call("history", "完走後に公開の操作履歴を記録する。")
            self.call("replay", "完走後に別保存へ確定操作を再生し、一致を検証する。", out=self.path.replace(".sqlite", "-replay.sqlite"))
        except (RuntimeError, BrokenPipeError, json.JSONDecodeError) as exc:
            error = str(exc)
            status = error.split(":")[0] if error.split(":")[0] in {"input_error", "stuck", "operation_limit", "external_interruption"} else "external_interruption"
            run_id = self.response["run_id"] if self.response else None
        finally: self.log.close()
        record = dict(kind="public_cli_automated_policy_not_blind_llm_play", pattern=self.pattern, scenario="home-02" if self.pattern == "BP-05" else "home-01", seed=self.seed, run_id=run_id, versions=self.response["public"]["versions"] if self.response and self.response["public"] else None,
                      started=self.started, finished=datetime.datetime.now(datetime.timezone.utc).isoformat(), model="none (deterministic public policy)", max_calls=self.max_calls, calls=self.count, advances=self.advances, status=status, error=error, changed_policy=self.changed, paused_activity=self.paused_once, save=self.path, result=result)
        (self.directory / (self.pattern + "-seed%d-summary.json" % self.seed)).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        return record


def main():
    parser = argparse.ArgumentParser(description="公開CLIだけで固定方針をテストプレイし、全入力・出力・理由を記録します。")
    parser.add_argument("--out", required=True)
    parser.add_argument("--seeds", type=int, default=3)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    output = Path(args.out); output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()): parser.error("上書きを避けるため空の出力ディレクトリを指定してください")
    process = subprocess.Popen([sys.executable, "-m", "kosodate", "serve"], cwd=root,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
    results = []
    try:
        for pattern in ("BP-01", "BP-02", "BP-03", "BP-04", "BP-05"):
            for seed in range(args.seeds):
                result = PublicPlayer(process, output, pattern, seed).run()
                results.append(result)
                print("%s seed%d: %s (%d calls)" % (pattern, seed, result["status"], result["calls"]), flush=True)
    finally:
        process.stdin.close(); process.wait(timeout=10); process.stdout.close()
    summary = dict(kind="public_cli_automated_policy_comparison", results=results)
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return int(any(r["status"] != "completed" for r in results))


if __name__ == "__main__": sys.exit(main())
