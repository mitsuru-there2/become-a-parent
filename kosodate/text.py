"""Japanese presentation of public information only."""
import json

LABELS = {"normal": "通常", "heavy": "多め", "reduced": "控えめ", "none": "なし", "study": "学習", "craft": "創作",
          "respect": "本人の意思を尊重", "coach": "目標を相談", "push": "強く促す", "grand": "祖父母", "paid": "有料支援"}


def plan_text(plan):
    lines = []
    for p, a in plan["parents"].items():
        lines.append("親%s：仕事=%s 世話=%d 関わり=%d 休息=%d 自分=%d" %
                     (p, LABELS[a["work"]], a["care"], a["bond"], a["rest"], a["self"]))
    a = plan["activity"]
    lines.append("活動=%s（量%d・担当%s） 方針=%s 支援=%s" %
                 (LABELS[a["domain"]], a["level"], a["sponsor"], LABELS[plan["style"]], LABELS[plan["help"]]))
    return lines


def history_text(items, detailed=False):
    lines = []
    for h in items:
        lines.append("\n第%d期の振り返り" % h["turn"] if h["kind"] == "turn" else "\nその後：子ども%d歳" % (h["ages"]["child_months"] // 12))
        lines.extend(h["text"] or ["大きな出来事のない半年。毎日の積み重ねが続いた。"])
        for m in h["money"]:
            lines.append("%s：%d + 収入%d − 支出%d − 計上外%d = %d万円" % (m["scope"], m["before"], m["income"], m["expense"], m["cap_overflow"], m["after"]))
        if h["related"]: lines.append("以前の選択とのつながり：" + ", ".join(h["related"]))
        if detailed:
            lines.append(json.dumps(h, ensure_ascii=False, indent=2))
    return lines


def result_text(result):
    e = result["ending"]
    lines = ["", "── %s ──" % e["title"], e["text"], ""]
    for p, r in result["parents"].items():
        a = r["axes"]
        lines.append("親%s：幸福 %d/100　%s（%d歳）" % (p, r["happiness"], r["label"], r["death_age"]))
        lines.append("  関係%d／生活の安心%d／自分の充実%d／子への安心%d／後悔%d" % (a["relationship"], a["security"], a["fulfillment"], a["child_assurance"], a["regret"]))
        lines.append("  最期の口座%d万円・健康%d" % (r["cash"], r["health"]))
    ch = result["child"]
    lines.append("子ども（%d歳）：幸福%d／主体性%d／社会的成果%d" % (ch["age"], ch["happiness"], ch["autonomy"], ch["social_success"]))
    lines.extend(result["story"])
    lines.append("結末 %s / %s" % (e["id"], e["version"]))
    return lines


def render(response):
    lines = []
    if not response["ok"]:
        lines.append("%s：%s" % (response["error"]["code"], response["error"]["message"]))
        lines.extend("  %s：%s" % (d["path"], d["reason"]) for d in response["error"]["details"])
    pub = response["public"]
    if pub:
        t = pub["time"]
        if response["phase"] == "childhood":
            lines.append("\n── 第%d/40期　子ども%d歳%dか月　%s・%s ──" % (t["next_turn"], t["child_months"] // 12, t["child_months"] % 12, t["season"], t["school_label"]))
            lines.append("家計：%d万円　夫婦の関係：%d" % (pub["cash"], pub["couple"]))
        else: lines.append("育児40期と老後の振り返りを完了。")
        for p, v in pub["parents"].items():
            lines.append("親%s（%d歳%dか月）：疲労%d 健康%d 充実%d 交流%d 後悔%d" % (p, v["age_months"] // 12, v["age_months"] % 12, v["stress"], v["health"], v["fulfillment"], v["social"], v["regret"]))
        g = pub["grandparents"]
        lines.append("祖父母：体力%d 関係%d 資金%d万円 地域の知り合い%s" % (g["health"], g["relation"], g["funds"], "あり" if g["network"] else "なし"))
        lines.append("\n子どもの様子")
        lines.extend("  [%s] %s" % (o["code"], o["text"]) for o in pub["observations"])
        if pub["plan"]:
            lines.append("\n今期の方針（確定するまで変更できます）")
            lines.extend(plan_text(pub["plan"]))
            f = pub["forecast"]
            lines.append("収入%d − 費用%d → 予測残金%d万円" % (f["income"], f["cost"], f["projected_cash"]))
            lines.append("時間：A %d/12（予備%d） B %d/12（予備%d） 世話：%d/%d" % (f["time_used"]["A"], 12-f["time_used"]["A"], f["time_used"]["B"], 12-f["time_used"]["B"], f["care_allocated"], f["care_required"]))
            lines.append("珍事による追加支出は最大%d万円（残金の範囲内）。" % f["uncertain_expense_cap"])
            if f["can_advance"]: lines.append("確定できます。")
            else: lines.extend("要調整：" + r["message"] for r in f["reasons"])
            answers = {a["event_instance"]: a["option_id"] for a in pub["answers"]}
            for e in response["choices"]:
                lines.append("\n[%s] %s" % (e["instance_id"], e["text"]))
                for o in e["options"]:
                    mark = "選択中" if answers.get(e["instance_id"]) == o["option_id"] else ""
                    lines.append("  %s：%s（費用%d／入金%d）%s%s" % (o["option_id"], o["label"], o["cost"], o["income"], mark, "・配分の調整が必要" if not o["available"] else ""))
        lines.append("実行 %s / revision %s / %s" % (response["run_id"], response["revision"], "/".join(pub["versions"].values())))
    payload = response["payload"]
    if payload:
        if "history_added" in payload: lines.extend(history_text(payload["history_added"]))
        elif response["command"] == "result": lines.extend(result_text(payload))
        elif response["command"] == "history": lines.extend(history_text(payload["items"], detailed=True))
        elif response["command"] not in {"observe", "forecast"}: lines.append(json.dumps(payload, ensure_ascii=False, indent=2))
    return "\n".join(lines)
