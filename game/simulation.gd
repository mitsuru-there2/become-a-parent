extends RefCounted

const Events = preload("res://game/events.gd")
const Adult = preload("res://game/adult.gd")
const WORK = {"reduced": [90, 2, 2, 1], "normal": [130, 4, 4, 3], "heavy": [180, 6, 7, 4]}
const PEOPLE = ["A", "B"]
const DOMAINS = ["study", "craft"]

static func c(value) -> int:
	return clampi(int(value), 0, 100)

static func initial_plan() -> Dictionary:
	var p = {"work": "normal", "care": 3, "bond": 1, "rest": 2, "self": 0}
	return {"parents": {"A": p.duplicate(), "B": p.duplicate()}, "activity": {"domain": "none", "level": 0, "sponsor": "A"}, "style": "respect", "help": "none"}

static func start(scenario: String, seed: int) -> Dictionary:
	var p = {"age_months": 360, "stress": 30, "health": 80, "fulfillment": 50, "social": 50, "regret": 10}
	var s = {"versions": {"rules": "rules-1", "data": "data-1", "save": "save-1"}, "scenario": scenario, "seed": seed, "phase": "childhood", "n": 0,
		"cash": 120, "parents": {"A": p.duplicate(), "B": p.duplicate()}, "couple": 60,
		"child": {"trust": {"A": 60, "B": 60}, "stress": 20, "autonomy": 40, "interest": {"study": 40, "craft": 65}, "ability": {"study": 10, "craft": 10}, "aptitude": {"study": 2, "craft": 3}, "adaptation": 3 if scenario == "home-02" else 1},
		"grandparents": {"health": 80, "relation": 60, "funds": 40, "network": true},
		"plan": initial_plan(), "previous_plan": initial_plan(), "answers": {}, "events": [], "seen": {}, "queue": [], "history": [], "draws": [], "effects": [], "deltas": [], "changed": false, "paused": false, "last_repair": false, "repaired": false, "oddity_count": 0, "observations": [], "result": null}
	open_turn(s)
	return s

static func stage(n: int) -> Dictionary:
	var age = n / 2
	if age < 3: return {"id": "baby", "care": 6, "cost": 20, "school": "未就学"}
	if age < 6: return {"id": "preschool", "care": 4, "cost": 24, "school": "未就学"}
	if age < 12: return {"id": "primary", "care": 2, "cost": 28, "school": "小%d" % (age - 5)}
	if age < 15: return {"id": "junior", "care": 1, "cost": 32, "school": "中%d" % (age - 11)}
	if age < 18: return {"id": "senior", "care": 1, "cost": 36, "school": "高%d相当" % (age - 14)}
	return {"id": "launch", "care": 1, "cost": 36, "school": "進路準備期"}

static func draw(s: Dictionary, phase: String, index: int, slot: String) -> int:
	var key = "rules-1|data-1|%d|%s|%d|%s" % [s.seed, phase, index, slot]
	var bytes = key.sha256_buffer()
	var value = 0
	# Modular accumulation avoids signed 64-bit overflow.
	for i in range(8): value = (value * 256 + bytes[i]) % 100
	s.draws.append({"phase": phase, "index": index, "slot": slot, "value": value})
	return value

static func observe_child(s: Dictionary) -> Array:
	var ch = s.child
	var obs = []
	var baby = stage(mini(s.n, 39)).id == "baby"
	obs.append({"code": "energy", "subject": "child", "text": "余裕がありそう" if ch.stress < 40 else ("少し疲れている様子" if ch.stress < 70 else "休みたがることが増えた")})
	for p in PEOPLE:
		var texts = ["話しかけても会話が続きにくい", "用事や近況を話す", "自分から話をしに来る"]
		if baby: texts = ["反応が少ない", "声や気配に反応する", "自分から触れ合いを求める"]
		var t = ch.trust[p]
		obs.append({"code": "relationship." + p, "subject": p, "text": texts[0 if t < 30 else (1 if t < 60 else 2)]})
	if not baby:
		obs.append({"code": "agency", "subject": "child", "text": "決めてもらうのを待つことが多い" if ch.autonomy < 30 else ("選択肢を示すと選ぶ" if ch.autonomy < 60 else "自分の希望を言う")})
	for d in DOMAINS:
		var prefix = ("ことばや数の遊び：" if d == "study" else "形や音の遊び：") if baby else ("学習：" if d == "study" else "創作：")
		obs.append({"code": "interest." + d, "subject": d, "text": prefix + ("最近は話題にしない" if ch.interest[d] < 40 else ("誘うと取り組むことがある" if ch.interest[d] < 60 else "自分から話題にする"))})
		obs.append({"code": "progress." + d, "subject": d, "text": prefix + ("試しながら覚えている" if ch.ability[d] < 30 else ("一人でできることが増えた" if ch.ability[d] < 60 else "得意なこととして披露する"))})
	if not s.deltas.is_empty():
		if s.changed and s.deltas[-1] >= 5: obs.append({"code": "settling", "subject": "child", "text": "新しい場の後は疲れている様子"})
		if (s.paused or s.last_repair) and s.deltas[-1] < 0: obs.append({"code": "recovery", "subject": "child", "text": "前より余裕が出てきた様子"})
	if s.deltas.size() >= 2 and s.previous_plan.parents.A.bond + s.previous_plan.parents.B.bond >= 2:
		var code = "mixed"
		var line = "調子には波がある"
		if s.deltas[-1] > 0 and s.deltas[-2] > 0:
			code = "strain_rising"
			line = "疲れが続いて増えている様子"
		elif s.deltas[-1] < 0 and s.deltas[-2] < 0:
			code = "strain_easing"
			line = "疲れが続いて和らいでいる様子"
		obs.append({"code": "trend: " + code, "subject": "child", "text": line})
	return obs

static func open_turn(s: Dictionary) -> void:
	s.observations = observe_child(s)
	s.events = []
	s.answers = {}
	var t = s.n + 1
	var ids = []
	if Events.FIXED.has(t): ids.append(Events.FIXED[t])
	var ch = s.child
	if t >= 3 and t <= 38 and t - s.seen.get("E-10", -100) >= 4 and (ch.stress >= 60 or mini(ch.trust.A, ch.trust.B) < 40 or maxi(s.parents.A.stress, s.parents.B.stress) >= 70):
		ids.append("E-10")
	elif t >= 5 and not s.seen.has("E-09") and s.grandparents.network and s.grandparents.funds >= 20 and s.grandparents.relation >= 30:
		ids.append("E-09")
	ids.sort()
	for id in ids:
		var target = "study"
		if id == "E-05" and s.previous_plan.activity.domain != "none": target = s.previous_plan.activity.domain
		if id == "E-07" and ch.interest.craft > ch.interest.study: target = "craft"
		var line = Events.DATA[id][0]
		if id == "E-07": line += "「%s寄りの道を考えている」" % ("学習" if target == "study" else "創作")
		s.events.append({"instance_id": "t%02d:%s" % [t, id], "event_id": id, "text": line, "target": target})
		s.seen[id] = t

static func answer_list(answers: Dictionary) -> Array:
	var ids = answers.keys()
	ids.sort()
	var result = []
	for id in ids: result.append({"event_instance": id, "option_id": answers[id]})
	return result

static func reason(code: String, path: String, message: String) -> Dictionary:
	return {"code": code, "path": path, "message": message}

static func forecast(s: Dictionary, answers = null) -> Dictionary:
	if answers == null: answers = s.answers
	var plan = s.plan
	var st = stage(s.n)
	var reasons = []
	var income = 0
	var cost = 200 + st.cost + [0, 12, 30][int(plan.activity.level)] + (8 if plan.help == "paid" else 0)
	var used = {}
	var care = 0
	for p in PEOPLE:
		var a = plan.parents[p]
		income += WORK[a.work][0]
		cost += 4 * a.self
		used[p] = WORK[a.work][1] + a.care + a.bond + a.rest + a.self + (plan.activity.level if plan.activity.sponsor == p else 0)
		care += a.care
		if used[p] > 12: reasons.append(reason("TIME_LIMIT", "parents." + p, "親%sの配分が12時間単位を超えています" % p))
	var required = maxi(0, st.care - (2 if plan.help != "none" else 0))
	if care != required: reasons.append(reason("CARE_MISMATCH", "parents", "今期の世話は合計%d単位に配分してください" % required))
	if plan.help == "grand" and (s.grandparents.health < 40 or s.grandparents.relation < 30): reasons.append(reason("HELP_UNAVAILABLE", "help", "祖父母の体力か関係に余裕がありません"))
	if st.id == "baby" and plan.activity.domain != "none": reasons.append(reason("ACTIVITY_AGE", "activity.domain", "乳児期の遊びは関わりの時間で扱います"))
	for e in s.events:
		if not answers.has(e.instance_id):
			reasons.append(reason("ANSWER_REQUIRED", e.instance_id, "出来事への回答が必要です（費用0の選択肢もあります）"))
			continue
		var o = Events.option(e.event_id, answers[e.instance_id])
		cost += o[2]
		income += o[3].get("income", 0)
		if o[3].get("income", 0) > s.grandparents.funds: reasons.append(reason("FUNDS_UNAVAILABLE", e.instance_id, "祖父母の援助資金が足りません"))
	if s.cash + income - cost < 0: reasons.append(reason("CASH_LIMIT", "cash", "予測残金が不足しています"))
	var fallback = initial_plan()
	for p in PEOPLE:
		fallback.parents[p].care = (st.care + 1) / 2 if p == "A" else st.care / 2
		for k in ["bond", "rest", "self"]: fallback.parents[p][k] = 0
	return {"income": income, "cost": cost, "projected_cash": s.cash + income - cost, "time_used": used, "time_limit": 12, "care_required": required, "care_allocated": care, "can_advance": reasons.is_empty(), "reasons": reasons, "uncertain_expense_cap": 8, "fallback_plan": fallback}

static func public_view(s: Dictionary) -> Dictionary:
	var finished = s.phase == "finished"
	var st = stage(s.n)
	var pub = {"versions": s.versions, "time": {"completed_turns": s.n, "next_turn": null if finished else s.n + 1, "child_months": s.n * 6, "season": null if finished else ("春〜夏" if s.n % 2 == 0 else "秋〜冬"), "stage": null if finished else st.id, "school_label": null if finished else st.school},
		"cash": null if finished else s.cash, "parents": s.parents, "couple": s.couple, "grandparents": s.grandparents, "observations": s.observations, "plan": null if finished else s.plan, "answers": [] if finished else answer_list(s.answers), "forecast": null if finished else forecast(s)}
	var choices = []
	if not finished:
		for e in s.events:
			var options = []
			for o in Events.DATA[e.event_id][1]:
				var answers = s.answers.duplicate()
				var id = e.event_id + ":" + o[0]
				answers[e.instance_id] = id
				var reasons = forecast(s, answers).reasons.filter(func(r): return r.code != "ANSWER_REQUIRED")
				options.append({"option_id": id, "label": o[1], "cost": o[2], "income": o[3].get("income", 0), "available": reasons.is_empty(), "reasons": reasons})
			choices.append({"instance_id": e.instance_id, "event_id": e.event_id, "text": e.text, "options": options})
	return {"public": pub, "choices": choices}

static func normal_update(s: Dictionary) -> void:
	var old = s.duplicate(true)
	var plan = s.plan
	var ch = s.child
	var q = ["respect", "coach", "push"].find(plan.style) if stage(s.n).id != "baby" else 0
	var d = plan.activity.domain
	var l = plan.activity.level
	var active = d != "none"
	var changed = active and d != s.previous_plan.activity.domain
	var z = int(old.parents.A.stress >= 70 or old.parents.B.stress >= 70)
	var conflict = old.child.stress >= 60 or (active and old.child.interest[d] < 40)
	for p in PEOPLE:
		var a = plan.parents[p]
		var v = old.parents[p]
		var w = WORK[a.work]
		var t = old.child.trust[p]
		s.parents[p].stress = c(v.stress + w[2] + a.care + (l if plan.activity.sponsor == p else 0) - 3 * a.rest - 2 * a.self - 3)
		s.parents[p].health = clampi(v.health + int(a.rest >= 2) - 2 * int(v.stress >= 70) - int(v.stress >= 90), 10, 100)
		s.parents[p].fulfillment = c(v.fulfillment + w[3] + 3 * a.self - 4 - 2 * int(v.stress >= 70))
		s.parents[p].social = c(v.social + 3 * a.self - 2)
		s.parents[p].regret = c(v.regret + int(v.stress >= 70 or t < 30 or v.fulfillment < 25) - int(a.bond >= 1 and v.stress < 60 and t >= 50))
		ch.trust[p] = c(t + a.bond - 1 + int(q == 0) - 2 * int(q == 2 and conflict))
	s.couple = c(old.couple + int(plan.parents.A.rest >= 1 and plan.parents.B.rest >= 1) - int(abs(plan.parents.A.care - plan.parents.B.care) >= 3) - z)
	ch.stress = c(old.child.stress + 2 * l + 2 * q + old.child.adaptation * int(changed) + 2 * z - plan.parents.A.bond - plan.parents.B.bond - 3 * int(not active))
	ch.autonomy = c(old.child.autonomy + int(stage(s.n).id != "baby") * (2 * int(q == 0) + int(q == 1) - 2 * int(q == 2)))
	for domain in DOMAINS:
		var base = int(stage(s.n).id in ["primary", "junior", "senior"])
		var gain = maxi(0, base + int(domain == d) * (l + int(old.child.interest[domain] >= 60) + int(old.child.aptitude[domain] == 3 and (s.n + 1) % 2 == 0)) - 2 * int(old.child.stress >= 70))
		ch.ability[domain] = c(old.child.ability[domain] + gain)
		ch.interest[domain] = c(old.child.interest[domain] + int(domain == d) * (1 - 3 * int(old.child.stress >= 60)) - int((s.n + 1) % 2 == 0 and active and domain != d))
	s.grandparents.health = clampi(old.grandparents.health + (-3 if plan.help == "grand" else 1) - int((s.n + 1) % 2 == 0), 0, 80)
	s.grandparents.relation = c(old.grandparents.relation + (-1 if plan.help == "grand" else 1))
	s.changed = changed
	s.paused = not active and s.previous_plan.activity.domain != "none"

static func apply_effect(s: Dictionary, effect: Dictionary, target: String) -> void:
	for key in effect:
		var v = effect[key]
		if key in ["S", "F", "G"]:
			var field = {"S": "stress", "F": "fulfillment", "G": "regret"}[key]
			for p in PEOPLE: s.parents[p][field] = c(s.parents[p][field] + v)
		elif key == "T":
			for p in PEOPLE: s.child.trust[p] = c(s.child.trust[p] + v)
		elif key in ["X", "U", "adapt"]:
			var field = "autonomy" if key == "U" else "stress"
			s.child[field] = c(s.child[field] + v * (s.child.adaptation if key == "adapt" else 1))
		elif key.begins_with("B_") or key.begins_with("I_"):
			var domain = key.substr(2)
			if domain == "target": domain = target
			var field = "ability" if key.begins_with("B_") else "interest"
			s.child[field][domain] = c(s.child[field][domain] + v)
		elif key in ["GM", "GR"]:
			var field = "funds" if key == "GM" else "relation"
			s.grandparents[field] = c(s.grandparents[field] + v)

static func apply_oddity(s: Dictionary, value: int, money: Dictionary, lines: Array, events: Array) -> void:
	var id = ""
	var line = ""
	if value < 10:
		id = "O-01"
		line = "忘れていた返金。家計簿が一瞬だけ拍手した。"
		money.income += 10
		money.cap_overflow += maxi(0, s.cash + 10 - 99999)
		s.cash = mini(99999, s.cash + 10)
	elif value < 18:
		id = "O-02"
		line = "家電が、今しかないという顔で止まった。"
		if s.cash < 8: lines.append("残金の範囲に修理を縮小した。負債はない。")
		money.expense += mini(s.cash, 8)
		s.cash = maxi(0, s.cash - 8)
		for p in PEOPLE: s.parents[p].stress = c(s.parents[p].stress + 1)
	elif value < 25:
		id = "O-03"
		line = "家族の妙な作品が回覧板の表紙になった。"
		s.oddity_count += 1
		for p in PEOPLE:
			s.parents[p].fulfillment = c(s.parents[p].fulfillment + 2)
			s.parents[p].social = c(s.parents[p].social + 2)
	if id != "":
		lines.append(line)
		events.append({"instance_id": "t%02d:%s" % [s.n + 1, id], "event_id": id, "option_id": null, "text": line})

static func advance(s: Dictionary, forced_draw: int = -1) -> void:
	var t = s.n + 1
	var before = s.duplicate(true)
	var f = forecast(s)
	var money = {"scope": "household", "before": s.cash, "income": f.income, "expense": f.cost, "cap_overflow": maxi(0, f.projected_cash - 99999), "after": 0}
	s.cash = mini(99999, f.projected_cash)
	normal_update(s)
	var lines = []
	var events = []
	var related = []
	s.last_repair = false
	for e in s.events:
		var option_id = s.answers[e.instance_id]
		var o = Events.option(e.event_id, option_id)
		apply_effect(s, o[3], e.target)
		lines.append("『%s』を選んだ。" % o[1])
		events.append({"instance_id": e.instance_id, "event_id": e.event_id, "option_id": option_id, "text": e.text})
		if o[3].has("delay"):
			s.queue.append({"id": o[3].delay, "due_turn": t + 2, "source": e.instance_id, "target": e.target})
			if o[3].delay == "L-02":
				s.repaired = true
				s.last_repair = true
	var remaining = []
	for delayed in s.queue:
		if delayed.due_turn != t:
			remaining.append(delayed)
			continue
		var success = s.plan.style != "push" and s.plan.parents.A.bond + s.plan.parents.B.bond >= 2
		if delayed.id == "L-01":
			if success: apply_effect(s, {"B_target": 2}, delayed.target)
			lines.append("少し間を置いて、また取り組み始めた。" if success else "再開はまだ先になりそう。")
		else:
			if success: apply_effect(s, {"X": -4, "T": 2, "G": -1}, delayed.target)
			lines.append("あの会話のあと、少し話しやすくなった様子。" if success else "話しやすさが続くか、もう少し様子を見たい。")
		related.append(delayed.source)
	s.queue = remaining
	var value = draw(s, "child", t, "oddity") if forced_draw < 0 else forced_draw
	apply_oddity(s, value, money, lines, events)
	money.after = s.cash
	if money.cap_overflow > 0: lines.append("保有上限による計上外：%d万円。" % money.cap_overflow)
	s.n = t
	for p in PEOPLE: s.parents[p].age_months += 6
	s.deltas.append(s.child.stress - before.child.stress)
	if s.deltas.size() > 2: s.deltas.pop_front()
	s.previous_plan = s.plan.duplicate(true)
	s.observations = observe_child(s)
	s.history.append({"index": s.history.size(), "kind": "turn", "turn": t, "adult_step": null, "ages": {"child_months": t * 6, "A_months": s.parents.A.age_months, "B_months": s.parents.B.age_months}, "actions": {"plan": s.plan.duplicate(true), "answers": answer_list(s.answers)}, "events": events, "money": [money], "observations": s.observations.duplicate(true), "text": lines, "related": related, "adult_result": null})
	s.effects.append({"turn": t, "before": numeric_state(before), "after": numeric_state(s)})
	if t == 40:
		s.answers = {}
		s.events = []
		s.plan = {}
		Adult.finish(s, draw)
		s.phase = "finished"
	else: open_turn(s)

static func numeric_state(s: Dictionary) -> Dictionary:
	return {"cash": s.cash, "parents": s.parents.duplicate(true), "couple": s.couple, "child": s.child.duplicate(true), "grandparents": s.grandparents.duplicate(true)}
