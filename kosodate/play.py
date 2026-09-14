"""Interactive client: uses only the public service responses."""
import copy
from pathlib import Path
import uuid
from .text import render, result_text, history_text, LABELS


def preset(pub, name):
    plan = copy.deepcopy(pub["plan"])
    care = pub["forecast"]["fallback_plan"]["parents"]
    layouts = {"1": [("normal", 1, 2, 1), ("normal", 1, 2, 1)],
               "2": [("heavy", 0, 1, 0), ("normal", 1, 1, 0)],
               "3": [("normal", 1, 3, 1), ("normal", 1, 3, 1)],
               "4": [("heavy", 0, 1, 2), ("normal", 0, 1, 2)]}
    for p, values in zip(("A", "B"), layouts[name]):
        work, bond, rest, own = values
        plan["parents"][p] = dict(work=work, care=care[p]["care"], bond=bond, rest=rest, self=own)
    active = name in {"1", "2"} and pub["time"]["stage"] != "baby"
    plan["activity"] = dict(domain="craft" if active else "none", level=(2 if name == "2" else 1) if active else 0, sponsor="B" if name == "2" else "A")
    plan["style"] = "coach" if name == "2" and active else "respect"
    plan["help"] = "none"
    return plan


def play(service, path, scenario="home-01", seed=0):
    args = dict(run=path)
    response, code = service.execute("observe", **args) if Path(path).exists() else service.execute("new", **args, scenario=scenario, seed=seed, request_id=uuid.uuid4().hex)
    if code:
        print(render(response))
        return code
    print("\n親伝説 — Become a Parent")
    print("半年ずつ、0歳から20歳まで。親の老後はそのあとに続きます。")
    print("時間は各親12単位。変更は案として保存され、nで半年を確定します。qでいつでも中断できます。")

    def update(command, value=None):
        nonlocal response
        args = dict(run=path, revision=response["revision"], request_id=uuid.uuid4().hex)
        if value is not None: args["input"] = value
        result, code = service.execute(command, **args)
        if code:
            print(render(result))
            # An error need not carry a state (e.g. a malformed patch).
            response, _ = service.execute("observe", run=path)
        else: response = result
        return code

    def ask_events():
        for e in list(response["choices"]):
            chosen = {a["event_instance"]: a["option_id"] for a in response["public"]["answers"]}
            if e["instance_id"] in chosen: continue
            print("\n" + e["text"])
            for i, o in enumerate(e["options"], 1): print("%d. %s（費用%d／入金%d万円）" % (i, o["label"], o["cost"], o["income"]))
            while True:
                answer = input("選択番号（戻る=b／中断=q）> ").strip()
                if answer == "q": raise EOFError
                if answer == "b": return False
                if answer.isdigit() and 1 <= int(answer) <= len(e["options"]):
                    if update("choose", {"event_instance": e["instance_id"], "option_id": e["options"][int(answer)-1]["option_id"]}): return False
                    break
                print("表示された番号を入力してください。")
        return True

    try:
        while response["phase"] != "finished":
            print(render(response))
            print("\n方針：1 好きに付き合う / 2 目標を目指す / 3 余白を作る / 4 親の時間も")
            print("操作：e 個別編集 / a 回答の編集 / c 世話の配分を合わせる / r 案を戻す / h 履歴 / ? 遊び方 / q 中断")
            command = input("n または Enterで半年を確定 > ").strip()
            if command == "q": break
            if command in {"1", "2", "3", "4"}: update("plan", preset(response["public"], command))
            elif command in {"", "n"}:
                if ask_events(): update("advance")
            elif command == "c":
                need = response["public"]["forecast"]["care_required"]
                update("plan", {"parents": {"A": {"care": (need+1)//2}, "B": {"care": need//2}}})
            elif command == "r": update("reset-plan")
            elif command == "a":
                choices = response["choices"]
                if not choices: print("今期に選択する出来事はありません。")
                for e in choices:
                    print(e["text"])
                    for i, o in enumerate(e["options"], 1): print("%d. %s" % (i, o["label"]))
                    answer = input("選択番号（Enterで変更なし）> ").strip()
                    if answer.isdigit() and 1 <= int(answer) <= len(e["options"]): update("choose", {"event_instance": e["instance_id"], "option_id": e["options"][int(answer)-1]["option_id"]})
            elif command == "e":
                action_response, _ = service.execute("actions", run=path)
                fields = action_response["payload"]["plan_fields"]
                for i, field in enumerate(fields, 1):
                    choices = " / ".join("%s=%s" % (v, LABELS.get(v, v)) for v in field["enum"]) if field["enum"] else "%s〜%s" % (field["min"], field["max"])
                    print("%d. %s (%s)" % (i, field["path"], choices))
                number = input("項目番号（Enterで戻る）> ").strip()
                if number.isdigit() and 1 <= int(number) <= len(fields):
                    field = fields[int(number)-1]
                    value = input("新しい値 > ").strip()
                    if field["type"] == "integer":
                        try: value = int(value)
                        except ValueError:
                            print("整数を入力してください。")
                            continue
                    keys = field["path"].split(".")
                    patch = value
                    for key in reversed(keys): patch = {key: patch}
                    if field["path"] == "activity.domain": patch["activity"]["level"] = 0 if value == "none" else max(1, response["public"]["plan"]["activity"]["level"])
                    if field["path"] == "activity.level" and value == 0: patch["activity"]["domain"] = "none"
                    update("plan", patch)
            elif command == "h":
                history, _ = service.execute("history", run=path)
                print("\n".join(history_text(history["payload"]["items"])))
            elif command == "?":
                print("世話は必要量ちょうど。仕事・関わり・休息・自分の時間・活動担当の合計は各12以内です。")
                print("仕事は収入と時間を、休息は疲労を、自分の時間は趣味や交流を支えます。関わりで子どもの様子を見守れます。")
                print("費用や時間が足りなければ案を直せます。活動は3歳から。年代が変わったらcで世話を配分し直せます。")
                print("エンディングは5種類。親の幸福と子どもの幸福は別に振り返ります。数値はこのゲームのルールです。")
            else: print("表示された操作を入力してください。")
            # Don't repeat last turn's recap on a read-only menu action.
            if command not in {"", "n"}: response, _ = service.execute("observe", run=path)
        if response["phase"] == "finished":
            print("\n".join(history_text((response.get("payload") or {}).get("history_added", []))))
            result, _ = service.execute("result", run=path)
            print("\n".join(result_text(result["payload"])))
    except (EOFError, KeyboardInterrupt):
        print()
    print("保存先：%s\n同じコマンドで再開・振り返りができます。" % Path(path).resolve())
    return 0
