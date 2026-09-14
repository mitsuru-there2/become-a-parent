extends RefCounted

const PEOPLE = ["A", "B"]
const INCOME = {"reduced": 90, "normal": 130, "heavy": 180}

static func c(value) -> int:
	return clampi(int(value), 0, 100)

static func child_result(s: Dictionary, age: int, career: Dictionary) -> Dictionary:
	var ch = s.child
	return {"age": age, "domain": career.domain, "route": career.route, "social_success": career.social_success, "residence": career.residence,
		"happiness": c((100 - ch.stress + ch.autonomy + maxi(ch.interest.study, ch.interest.craft)) / 3), "autonomy": ch.autonomy}

static func score(axes: Dictionary) -> int:
	return int((25 * axes.relationship + 25 * axes.security + 25 * axes.fulfillment + 15 * axes.child_assurance + 10 * (100 - axes.regret)) / 100)

static func parent_result(s: Dictionary, p: String, money: int, spouse_alive: bool, child: Dictionary) -> Dictionary:
	var v = s.parents[p]
	var relationship = (2 * s.child.trust[p] + v.social + (s.couple if spouse_alive else 0)) / (4 if spouse_alive else 3)
	var axes = {"relationship": relationship, "security": (mini(100, money / 5) + v.health) / 2, "fulfillment": v.fulfillment, "child_assurance": (child.happiness + child.social_success) / 2, "regret": v.regret}
	var happiness = score(axes)
	return {"death_age": v.age_months / 12, "happiness": happiness, "axes": axes, "cash": money, "health": v.health, "label": "満ち足りた振り返り" if happiness >= 75 else ("喜びと心残りのある振り返り" if happiness >= 45 else "心残りの大きい振り返り")}

static func ending(s: Dictionary, child: Dictionary) -> Dictionary:
	var trust = (s.child.trust.A + s.child.trust.B) / 2
	var fulfillment = (s.parents.A.fulfillment + s.parents.B.fulfillment) / 2
	var social = (s.parents.A.social + s.parents.B.social) / 2
	var id = "EN-05"
	var title = "小さな靴、大きな予定"
	var line = "靴箱を片づけると、小さな靴が出てきた。予定通りのことも、そうでないこともあった。家族の歩みは、この一足には収まりきらない。"
	if child.social_success >= 70 and trust < 40:
		id = "EN-01"
		title = "立派な額縁、静かな食卓"
		line = "壁には立派な額縁が並んだ。食卓には、聞きそびれた話が残った。大きな成果と、親子それぞれの実感を振り返る。"
	elif s.repaired and trust >= 60:
		id = "EN-02"
		title = "「あのとき、ごめん」の続き"
		line = "昔の言い争いを話せる日が来た。謝罪の名文句は忘れたが、そのあとに続いた会話は覚えている。"
	elif fulfillment >= 70 and social >= 50:
		id = "EN-03"
		title = "それぞれの予定表"
		line = "親の予定表にも、子どもの予定表にも、別々の用事がある。家族の予定を合わせる係は、最後までなかなか忙しかった。"
	elif child.residence == "far" and trust >= 60:
		id = "EN-04"
		title = "遠くの街から、いつもの声"
		line = "遠くの街から電話が鳴る。最初の話題はいつも天気。大事な話は、だいたいそのあとにやってきた。"
	return {"version": "ending-1", "id": id, "title": title, "text": line}

static func event(k: int, id: String, p: String, line: String) -> Dictionary:
	return {"instance_id": "a%02d:%s:%s" % [k, id, p], "event_id": id, "option_id": null, "text": line}

static func finish(s: Dictionary, draw: Callable) -> void:
	var ch = s.child
	var domain = "craft" if ch.interest.craft > ch.interest.study else "study"
	var route = "specialist" if ch.ability[domain] >= 60 else ("explorer" if ch.autonomy >= 50 else "supported")
	var r = draw.call(s, "adult", 0, "career")
	var luck = -10 if r < 20 else (10 if r >= 80 else 0)
	var success = c((ch.ability[domain] + ch.autonomy) / 2 + luck)
	var distance = draw.call(s, "adult", 0, "distance")
	var career = {"domain": domain, "route": route, "social_success": success, "residence": "far" if distance < (60 if success >= 60 else 30) else "near"}
	var accounts = {"A": (s.cash + 1) / 2, "B": s.cash / 2}
	var alive = {"A": true, "B": true}
	var results = {"A": null, "B": null}
	var child = child_result(s, 20, career)
	for k in range(1, 9):
		var old = s.duplicate(true)
		var was_alive = alive.duplicate()
		var money = []
		var lines = []
		var events = []
		for p in PEOPLE:
			if not alive[p]: continue
			var before = accounts[p]
			var income = 5 * (INCOME[s.previous_plan.parents[p].work] * 2 if k <= 3 else 200)
			var wanted = 5 * (240 if k <= 3 else 220)
			var shortfall = before + income < wanted
			var expense = mini(wanted, before + income)
			var overflow = maxi(0, before + income - expense - 99999)
			accounts[p] = before + income - expense - overflow
			money.append({"scope": p, "before": before, "income": income, "expense": expense, "cap_overflow": overflow, "after": accounts[p]})
			if shortfall: lines.append("親%s：暮らしを%d万円縮小して調整した。" % [p, wanted - expense])
			if overflow: lines.append("親%s：保有上限による計上外%d万円。" % [p, overflow])
			var v = old.parents[p]
			var t = old.child.trust[p]
			s.parents[p].stress = c(v.stress - 8 + 4 * int(shortfall))
			s.parents[p].health = maxi(0, v.health - (5 if k <= 3 else 10) - 3 * int(v.stress >= 60) - 2 * int(shortfall))
			s.parents[p].fulfillment = c(v.fulfillment + (3 if v.social >= 50 else -3) - 3 * int(v.health < 30))
			s.parents[p].social = c(v.social - 2)
			s.child.trust[p] = c(t + (2 if t >= 50 else -1))
			s.parents[p].regret = c(v.regret + int(t < 30 or v.fulfillment < 25) - int(t >= 60 and v.fulfillment >= 50))
			s.parents[p].age_months = (50 + 5 * k) * 12
		ch.stress = c(old.child.stress - 5 + 5 * int(success < 40))
		ch.autonomy = c(old.child.autonomy + int(route != "supported"))
		for p in PEOPLE:
			if not alive[p]: continue
			var line = ""
			if k == 1:
				line = "近況の連絡が届いた。" if ch.trust[p] >= 50 else "連絡は用件が中心だった。"
				if ch.trust[p] >= 50: s.parents[p].fulfillment = c(s.parents[p].fulfillment + 2)
				events.append(event(k, "A-01", p, "親%s：%s" % [p, line]))
			if k == 3:
				line = "退職後にも会う人と予定がある。" if s.parents[p].social >= 50 else "仕事の外の過ごし方を探し始めた。"
				if s.parents[p].social >= 50: s.parents[p].fulfillment = c(s.parents[p].fulfillment + 3)
				events.append(event(k, "A-02", p, "親%s：%s" % [p, line]))
			if k >= 4 and draw.call(s, "adult", k, "health-" + p) < 20:
				s.parents[p].health = maxi(0, s.parents[p].health - 5)
				events.append(event(k, "A-03", p, "親%s：体調を崩し、しばらく休んだ。" % p))
			if k == 5 and s.repaired and ch.trust[p] >= 60:
				s.parents[p].regret = c(s.parents[p].regret - 3)
				events.append(event(k, "A-04", p, "親%s：昔の言い争いを、今は一緒に振り返れた。" % p))
		if k == 6 and s.oddity_count > 0: events.append(event(k, "A-05", "family", "妙な作品が、まだ家に残っている。"))
		child = child_result(s, 20 + 5 * k, career)
		var deaths = []
		var this_results = {"A": null, "B": null}
		for p in PEOPLE:
			if alive[p] and (k == 8 or (k >= 3 and s.parents[p].health == 0)): deaths.append(p)
		for p in deaths:
			results[p] = parent_result(s, p, accounts[p], was_alive["B" if p == "A" else "A"], child)
			this_results[p] = results[p].duplicate(true)
			alive[p] = false
			lines.append("親%sは%d歳で最期を迎えた。幸福%d。関係%d／安心%d／充実%d／子への安心%d／後悔%d。" % [p, results[p].death_age, results[p].happiness, results[p].axes.relationship, results[p].axes.security, results[p].axes.fulfillment, results[p].axes.child_assurance, results[p].axes.regret])
		if deaths.size() == 1:
			var survivor = "B" if deaths[0] == "A" else "A"
			if alive[survivor]:
				s.parents[survivor].stress = c(s.parents[survivor].stress + 10)
				lines.append("親%sは伴侶を見送った。残る日々をたどる。" % survivor)
		events.sort_custom(func(a, b): return a.instance_id < b.instance_id)
		for e in events: lines.append(e.text)
		lines.append("子ども%d歳：幸福%d、主体性%d。" % [child.age, child.happiness, child.autonomy])
		s.history.append({"index": s.history.size(), "kind": "adult", "turn": null, "adult_step": k, "ages": {"child_months": child.age * 12, "A_months": s.parents.A.age_months, "B_months": s.parents.B.age_months}, "actions": null, "events": events, "money": money, "observations": [], "text": lines, "related": [], "adult_result": {"alive": alive.duplicate(), "parents": this_results, "child": child.duplicate()}})
		if not alive.A and not alive.B: break
	var story = []
	for p in PEOPLE: story.append("親%s：幸福%d／%s。" % [p, results[p].happiness, results[p].label])
	var routes = {"specialist": "学びを生かす専門の道" if domain == "study" else "作ることを仕事にする道", "explorer": "試しながら自分の道を探す", "supported": "相談しながら足場を作る"}
	story.append("子どもは%sへ。社会的成果%d。" % [routes[route], success])
	story.append("遠方で暮らす。" if career.residence == "far" else "近くで暮らす。")
	story.append("子どもの幸福%d／主体性%d。" % [child.happiness, child.autonomy])
	for p in PEOPLE:
		if s.repaired and ch.trust[p] >= 60: story.append("親%s：関係を修復したあとの会話が続いた。" % p)
		if success >= 70 and ch.trust[p] < 40: story.append("親%s：成果は大きかったが、会話は少なかった。" % p)
		if career.residence == "far" and ch.trust[p] >= 60: story.append("親%s：距離があっても連絡が続いた。" % p)
		if s.parents[p].social >= 60: story.append("親%s：家族以外とのつながりも支えになった。" % p)
	if s.oddity_count > 0: story.append("回覧板を飾った作品は、家族の思い出になった。")
	for p in PEOPLE: story.append("親%sの最期は%d歳。" % [p, results[p].death_age])
	s.result = {"parents": results, "child": child, "ending": ending(s, child), "story": story}
