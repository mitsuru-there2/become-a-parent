import type {
  State,
  Plan,
  Observation,
  Domain,
  Forecast,
  PublicState,
  Choice,
  NumericState,
  History,
  Money,
  Reason,
} from "./types";
import { PEOPLE, DOMAINS, c, div, clone, hash } from "./shared";
import { FIXED, DATA, option } from "./events";
import { finish } from "./adult";
const WORK = { reduced: [90, 2, 2, 1], normal: [130, 4, 4, 3], heavy: [180, 6, 7, 4] };
export function initialPlan(): Plan {
  const p = { work: "normal" as const, care: 3, bond: 1, rest: 2, self: 0 };
  return {
    parents: { A: { ...p }, B: { ...p } },
    activity: { domain: "none", level: 0, sponsor: "A" },
    style: "respect",
    help: "none",
  };
}
export function start(scenario: string, seed: number): State {
  const p = { age_months: 360, stress: 30, health: 80, fulfillment: 50, social: 50, regret: 10 };
  const s: State = {
    versions: { rules: "rules-1", data: "data-1", save: "save-2" },
    scenario,
    seed,
    phase: "childhood",
    n: 0,
    cash: 120,
    parents: { A: { ...p }, B: { ...p } },
    couple: 60,
    child: {
      trust: { A: 60, B: 60 },
      stress: 20,
      autonomy: 40,
      interest: { study: 40, craft: 65 },
      ability: { study: 10, craft: 10 },
      aptitude: { study: 2, craft: 3 },
      adaptation: scenario === "home-02" ? 3 : 1,
    },
    grandparents: { health: 80, relation: 60, funds: 40, network: true },
    plan: initialPlan(),
    previous_plan: initialPlan(),
    answers: {},
    events: [],
    seen: {},
    queue: [],
    history: [],
    draws: [],
    effects: [],
    deltas: [],
    changed: false,
    paused: false,
    last_repair: false,
    repaired: false,
    oddity_count: 0,
    observations: [],
    result: null,
  };
  openTurn(s);
  return s;
}
export function stage(n: number) {
  const age = div(n, 2);
  if (age < 3) return { id: "baby", care: 6, cost: 20, school: "未就学" };
  if (age < 6) return { id: "preschool", care: 4, cost: 24, school: "未就学" };
  if (age < 12) return { id: "primary", care: 2, cost: 28, school: `小${age - 5}` };
  if (age < 15) return { id: "junior", care: 1, cost: 32, school: `中${age - 11}` };
  if (age < 18) return { id: "senior", care: 1, cost: 36, school: `高${age - 14}相当` };
  return { id: "launch", care: 1, cost: 36, school: "進路準備期" };
}
export function draw(s: State, phase: string, index: number, slot: string) {
  const key = `rules-1|data-1|${s.seed}|${phase}|${index}|${slot}`,
    value = Number(BigInt("0x" + hash(key).slice(0, 16)) % 100n);
  s.draws.push({ phase, index, slot, value });
  return value;
}
export function observeChild(s: State): Observation[] {
  const ch = s.child,
    obs: Observation[] = [],
    baby = stage(Math.min(s.n, 39)).id === "baby";
  const add = (code: string, subject: string, text: string) => obs.push({ code, subject, text });
  add(
    "energy",
    "child",
    ch.stress < 40
      ? "余裕がありそう"
      : ch.stress < 70
        ? "少し疲れている様子"
        : "休みたがることが増えた",
  );
  for (const p of PEOPLE) {
    const texts = baby
      ? ["反応が少ない", "声や気配に反応する", "自分から触れ合いを求める"]
      : ["話しかけても会話が続きにくい", "用事や近況を話す", "自分から話をしに来る"];
    const t = ch.trust[p];
    add("relationship." + p, p, texts[t < 30 ? 0 : t < 60 ? 1 : 2]);
  }
  if (!baby)
    add(
      "agency",
      "child",
      ch.autonomy < 30
        ? "決めてもらうのを待つことが多い"
        : ch.autonomy < 60
          ? "選択肢を示すと選ぶ"
          : "自分の希望を言う",
    );
  for (const d of DOMAINS) {
    const prefix = baby
      ? d === "study"
        ? "ことばや数の遊び："
        : "形や音の遊び："
      : d === "study"
        ? "学習："
        : "創作：";
    add(
      "interest." + d,
      d,
      prefix +
        (ch.interest[d] < 40
          ? "最近は話題にしない"
          : ch.interest[d] < 60
            ? "誘うと取り組むことがある"
            : "自分から話題にする"),
    );
    add(
      "progress." + d,
      d,
      prefix +
        (ch.ability[d] < 30
          ? "試しながら覚えている"
          : ch.ability[d] < 60
            ? "一人でできることが増えた"
            : "得意なこととして披露する"),
    );
  }
  const last = s.deltas.at(-1) ?? 0;
  if (s.deltas.length) {
    if (s.changed && last >= 5) add("settling", "child", "新しい場の後は疲れている様子");
    if ((s.paused || s.last_repair) && last < 0)
      add("recovery", "child", "前より余裕が出てきた様子");
  }
  if (
    s.deltas.length >= 2 &&
    s.previous_plan.parents.A.bond + s.previous_plan.parents.B.bond >= 2
  ) {
    const prev = s.deltas.at(-2)!;
    add(
      "trend: " +
        (last > 0 && prev > 0 ? "strain_rising" : last < 0 && prev < 0 ? "strain_easing" : "mixed"),
      "child",
      last > 0 && prev > 0
        ? "疲れが続いて増えている様子"
        : last < 0 && prev < 0
          ? "疲れが続いて和らいでいる様子"
          : "調子には波がある",
    );
  }
  return obs;
}
export function openTurn(s: State) {
  s.observations = observeChild(s);
  s.events = [];
  s.answers = {};
  const t = s.n + 1,
    ids: string[] = [],
    ch = s.child;
  if (FIXED[t]) ids.push(FIXED[t]);
  if (
    t >= 3 &&
    t <= 38 &&
    t - (s.seen["E-10"] ?? -100) >= 4 &&
    (ch.stress >= 60 ||
      Math.min(ch.trust.A, ch.trust.B) < 40 ||
      Math.max(s.parents.A.stress, s.parents.B.stress) >= 70)
  )
    ids.push("E-10");
  else if (
    t >= 5 &&
    !s.seen["E-09"] &&
    s.grandparents.network &&
    s.grandparents.funds >= 20 &&
    s.grandparents.relation >= 30
  )
    ids.push("E-09");
  for (const id of ids.sort()) {
    let target: Domain = "study";
    if (id === "E-05" && s.previous_plan.activity.domain !== "none")
      target = s.previous_plan.activity.domain;
    if (id === "E-07" && ch.interest.craft > ch.interest.study) target = "craft";
    let text = DATA[id][0];
    if (id === "E-07") text += `「${target === "study" ? "学習" : "創作"}寄りの道を考えている」`;
    s.events.push({
      instance_id: `t${String(t).padStart(2, "0")}:${id}`,
      event_id: id,
      text,
      target,
    });
    s.seen[id] = t;
  }
}
export const answerList = (answers: Record<string, string>) =>
  Object.keys(answers)
    .sort()
    .map((id) => ({ event_instance: id, option_id: answers[id] }));
export function forecast(s: State, answers = s.answers): Forecast {
  const plan = s.plan,
    st = stage(s.n),
    reasons: Reason[] = [],
    used = { A: 0, B: 0 };
  let income = 0,
    cost = 200 + st.cost + [0, 12, 30][plan.activity.level] + (plan.help === "paid" ? 8 : 0),
    care = 0;
  const reason = (code: string, path: string, message: string) =>
    reasons.push({ code, path, message });
  for (const p of PEOPLE) {
    const a = plan.parents[p];
    income += WORK[a.work][0];
    cost += 4 * a.self;
    used[p] =
      WORK[a.work][1] +
      a.care +
      a.bond +
      a.rest +
      a.self +
      (plan.activity.sponsor === p ? plan.activity.level : 0);
    care += a.care;
    if (used[p] > 12)
      reason("TIME_LIMIT", "parents." + p, `親${p}の配分が12時間単位を超えています`);
  }
  const required = Math.max(0, st.care - (plan.help !== "none" ? 2 : 0));
  if (care !== required)
    reason("CARE_MISMATCH", "parents", `今期の世話は合計${required}単位に配分してください`);
  if (plan.help === "grand" && (s.grandparents.health < 40 || s.grandparents.relation < 30))
    reason("HELP_UNAVAILABLE", "help", "祖父母の体力か関係に余裕がありません");
  if (st.id === "baby" && plan.activity.domain !== "none")
    reason("ACTIVITY_AGE", "activity.domain", "乳児期の遊びは関わりの時間で扱います");
  for (const e of s.events) {
    if (!answers[e.instance_id]) {
      reason(
        "ANSWER_REQUIRED",
        e.instance_id,
        "出来事への回答が必要です（費用0の選択肢もあります）",
      );
      continue;
    }
    const o = option(e.event_id, answers[e.instance_id]);
    cost += o[2];
    const aid = Number(o[3].income ?? 0);
    income += aid;
    if (aid > s.grandparents.funds)
      reason("FUNDS_UNAVAILABLE", e.instance_id, "祖父母の援助資金が足りません");
  }
  if (s.cash + income - cost < 0) reason("CASH_LIMIT", "cash", "予測残金が不足しています");
  const fallback = initialPlan();
  for (const p of PEOPLE) {
    fallback.parents[p].care = div(st.care + (p === "A" ? 1 : 0), 2);
    fallback.parents[p].bond = 0;
    fallback.parents[p].rest = 0;
    fallback.parents[p].self = 0;
  }
  return {
    income,
    cost,
    projected_cash: s.cash + income - cost,
    time_used: used,
    time_limit: 12,
    care_required: required,
    care_allocated: care,
    can_advance: !reasons.length,
    reasons,
    uncertain_expense_cap: 8,
    fallback_plan: fallback,
  };
}
export function publicView(s: State): { public: PublicState; choices: Choice[] } {
  const finished = s.phase === "finished",
    st = stage(s.n);
  const pub: PublicState = {
    versions: s.versions,
    time: {
      completed_turns: s.n,
      next_turn: finished ? null : s.n + 1,
      child_months: s.n * 6,
      season: finished ? null : s.n % 2 === 0 ? "春〜夏" : "秋〜冬",
      stage: finished ? null : st.id,
      school_label: finished ? null : st.school,
    },
    cash: finished ? null : s.cash,
    parents: s.parents,
    couple: s.couple,
    grandparents: s.grandparents,
    observations: s.observations,
    plan: finished ? null : s.plan,
    answers: finished ? [] : answerList(s.answers),
    forecast: finished ? null : forecast(s),
  };
  const choices: Choice[] = finished
    ? []
    : s.events.map((e) => ({
        instance_id: e.instance_id,
        event_id: e.event_id,
        text: e.text,
        options: DATA[e.event_id][1].map((o) => {
          const id = e.event_id + ":" + o[0],
            reasons = forecast(s, { ...s.answers, [e.instance_id]: id }).reasons.filter(
              (r) => r.code !== "ANSWER_REQUIRED",
            );
          return {
            option_id: id,
            label: o[1],
            cost: o[2],
            income: Number(o[3].income ?? 0),
            available: !reasons.length,
            reasons,
          };
        }),
      }));
  return clone({ public: pub, choices });
}
export function normalUpdate(s: State) {
  const old = numericState(s),
    plan = s.plan,
    ch = s.child,
    q = stage(s.n).id === "baby" ? 0 : ["respect", "coach", "push"].indexOf(plan.style),
    d = plan.activity.domain,
    l = plan.activity.level,
    active = d !== "none",
    changed = active && d !== s.previous_plan.activity.domain,
    z = Number(old.parents.A.stress >= 70 || old.parents.B.stress >= 70),
    conflict = old.child.stress >= 60 || (active && old.child.interest[d] < 40);
  for (const p of PEOPLE) {
    const a = plan.parents[p],
      v = old.parents[p],
      w = WORK[a.work],
      t = old.child.trust[p];
    Object.assign(s.parents[p], {
      stress: c(
        v.stress +
          w[2] +
          a.care +
          (plan.activity.sponsor === p ? l : 0) -
          3 * a.rest -
          2 * a.self -
          3,
      ),
      health: Math.max(
        10,
        Math.min(
          100,
          v.health + Number(a.rest >= 2) - 2 * Number(v.stress >= 70) - Number(v.stress >= 90),
        ),
      ),
      fulfillment: c(v.fulfillment + w[3] + 3 * a.self - 4 - 2 * Number(v.stress >= 70)),
      social: c(v.social + 3 * a.self - 2),
      regret: c(
        v.regret +
          Number(v.stress >= 70 || t < 30 || v.fulfillment < 25) -
          Number(a.bond >= 1 && v.stress < 60 && t >= 50),
      ),
    });
    ch.trust[p] = c(t + a.bond - 1 + Number(q === 0) - 2 * Number(q === 2 && conflict));
  }
  s.couple = c(
    old.couple +
      Number(plan.parents.A.rest >= 1 && plan.parents.B.rest >= 1) -
      Number(Math.abs(plan.parents.A.care - plan.parents.B.care) >= 3) -
      z,
  );
  ch.stress = c(
    old.child.stress +
      2 * l +
      2 * q +
      old.child.adaptation * Number(changed) +
      2 * z -
      plan.parents.A.bond -
      plan.parents.B.bond -
      3 * Number(!active),
  );
  ch.autonomy = c(
    old.child.autonomy +
      Number(stage(s.n).id !== "baby") *
        (2 * Number(q === 0) + Number(q === 1) - 2 * Number(q === 2)),
  );
  for (const domain of DOMAINS) {
    const base = Number(["primary", "junior", "senior"].includes(stage(s.n).id)),
      gain = Math.max(
        0,
        base +
          Number(domain === d) *
            (l +
              Number(old.child.interest[domain] >= 60) +
              Number(old.child.aptitude[domain] === 3 && (s.n + 1) % 2 === 0)) -
          2 * Number(old.child.stress >= 70),
      );
    ch.ability[domain] = c(old.child.ability[domain] + gain);
    ch.interest[domain] = c(
      old.child.interest[domain] +
        Number(domain === d) * (1 - 3 * Number(old.child.stress >= 60)) -
        Number((s.n + 1) % 2 === 0 && active && domain !== d),
    );
  }
  s.grandparents.health = Math.max(
    0,
    Math.min(
      80,
      old.grandparents.health + (plan.help === "grand" ? -3 : 1) - Number((s.n + 1) % 2 === 0),
    ),
  );
  s.grandparents.relation = c(old.grandparents.relation + (plan.help === "grand" ? -1 : 1));
  s.changed = changed;
  s.paused = !active && s.previous_plan.activity.domain !== "none";
}
export function applyEffect(s: State, effect: Record<string, number | string>, target: Domain) {
  for (const [key, raw] of Object.entries(effect)) {
    const v = Number(raw);
    if (key === "S" || key === "F" || key === "G") {
      const field = ({ S: "stress", F: "fulfillment", G: "regret" } as const)[key];
      for (const p of PEOPLE) s.parents[p][field] = c(s.parents[p][field] + v);
    } else if (key === "T") {
      for (const p of PEOPLE) s.child.trust[p] = c(s.child.trust[p] + v);
    } else if (["X", "U", "adapt"].includes(key)) {
      const field = key === "U" ? "autonomy" : "stress";
      s.child[field] = c(s.child[field] + v * (key === "adapt" ? s.child.adaptation : 1));
    } else if (key.startsWith("B_") || key.startsWith("I_")) {
      const domain = key.slice(2) === "target" ? target : (key.slice(2) as Domain),
        field = key.startsWith("B_") ? "ability" : "interest";
      s.child[field][domain] = c(s.child[field][domain] + v);
    } else if (key === "GM" || key === "GR") {
      const field = key === "GM" ? "funds" : "relation";
      s.grandparents[field] = c(s.grandparents[field] + v);
    }
  }
}
export function applyOddity(
  s: State,
  value: number,
  money: Money,
  lines: string[],
  events: History["events"],
) {
  let id = "",
    line = "";
  if (value < 10) {
    id = "O-01";
    line = "忘れていた返金。家計簿が一瞬だけ拍手した。";
    money.income += 10;
    money.cap_overflow += Math.max(0, s.cash + 10 - 99999);
    s.cash = Math.min(99999, s.cash + 10);
  } else if (value < 18) {
    id = "O-02";
    line = "家電が、今しかないという顔で止まった。";
    if (s.cash < 8) lines.push("残金の範囲に修理を縮小した。負債はない。");
    money.expense += Math.min(s.cash, 8);
    s.cash = Math.max(0, s.cash - 8);
    for (const p of PEOPLE) s.parents[p].stress = c(s.parents[p].stress + 1);
  } else if (value < 25) {
    id = "O-03";
    line = "家族の妙な作品が回覧板の表紙になった。";
    s.oddity_count++;
    for (const p of PEOPLE) {
      s.parents[p].fulfillment = c(s.parents[p].fulfillment + 2);
      s.parents[p].social = c(s.parents[p].social + 2);
    }
  }
  if (id) {
    lines.push(line);
    events.push({
      instance_id: `t${String(s.n + 1).padStart(2, "0")}:${id}`,
      event_id: id,
      option_id: null,
      text: line,
    });
  }
}
export function advance(s: State, forcedDraw = -1) {
  const t = s.n + 1,
    before = numericState(s),
    f = forecast(s),
    money: Money = {
      scope: "household",
      before: s.cash,
      income: f.income,
      expense: f.cost,
      cap_overflow: Math.max(0, f.projected_cash - 99999),
      after: 0,
    };
  s.cash = Math.min(99999, f.projected_cash);
  normalUpdate(s);
  const lines: string[] = [],
    events: History["events"] = [],
    related: string[] = [];
  s.last_repair = false;
  for (const e of s.events) {
    const id = s.answers[e.instance_id],
      o = option(e.event_id, id);
    applyEffect(s, o[3], e.target);
    lines.push(`『${o[1]}』を選んだ。`);
    events.push({ instance_id: e.instance_id, event_id: e.event_id, option_id: id, text: e.text });
    if (o[3].delay) {
      s.queue.push({
        id: String(o[3].delay),
        due_turn: t + 2,
        source: e.instance_id,
        target: e.target,
      });
      if (o[3].delay === "L-02") {
        s.repaired = true;
        s.last_repair = true;
      }
    }
  }
  const remaining: State["queue"] = [];
  for (const delayed of s.queue) {
    if (delayed.due_turn !== t) {
      remaining.push(delayed);
      continue;
    }
    const success = s.plan.style !== "push" && s.plan.parents.A.bond + s.plan.parents.B.bond >= 2;
    if (delayed.id === "L-01") {
      if (success) applyEffect(s, { B_target: 2 }, delayed.target);
      lines.push(success ? "少し間を置いて、また取り組み始めた。" : "再開はまだ先になりそう。");
    } else {
      if (success) applyEffect(s, { X: -4, T: 2, G: -1 }, delayed.target);
      lines.push(
        success
          ? "あの会話のあと、少し話しやすくなった様子。"
          : "話しやすさが続くか、もう少し様子を見たい。",
      );
    }
    related.push(delayed.source);
  }
  s.queue = remaining;
  applyOddity(s, forcedDraw < 0 ? draw(s, "child", t, "oddity") : forcedDraw, money, lines, events);
  money.after = s.cash;
  if (money.cap_overflow > 0) lines.push(`保有上限による計上外：${money.cap_overflow}万円。`);
  s.n = t;
  for (const p of PEOPLE) s.parents[p].age_months += 6;
  s.deltas.push(s.child.stress - before.child.stress);
  if (s.deltas.length > 2) s.deltas.shift();
  s.previous_plan = clone(s.plan);
  s.observations = observeChild(s);
  s.history.push({
    index: s.history.length,
    kind: "turn",
    turn: t,
    adult_step: null,
    ages: {
      child_months: t * 6,
      A_months: s.parents.A.age_months,
      B_months: s.parents.B.age_months,
    },
    actions: { plan: clone(s.plan), answers: answerList(s.answers) },
    events,
    money: [money],
    observations: clone(s.observations),
    text: lines,
    related,
    adult_result: null,
  });
  s.effects.push({ turn: t, before, after: numericState(s) });
  if (t === 40) {
    s.answers = {};
    s.events = [];
    finish(s, draw);
    s.phase = "finished";
  } else openTurn(s);
}
export function numericState(s: State): NumericState {
  return clone({
    cash: s.cash,
    parents: s.parents,
    couple: s.couple,
    child: s.child,
    grandparents: s.grandparents,
  });
}
