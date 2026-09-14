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
import { PEOPLE, DOMAINS, clampStat, integerDivide, clone, hash } from "./shared";
import { FIXED_EVENTS, EVENT_DATA, findEventOption } from "./events";
import { finish } from "./adult";
const WORK = {
  reduced: { income: 90, time: 2, stress: 2, fulfillment: 1 },
  normal: { income: 130, time: 4, stress: 4, fulfillment: 3 },
  heavy: { income: 180, time: 6, stress: 7, fulfillment: 4 },
};
export function initialPlan(): Plan {
  const parentAllocation = { work: "normal" as const, care: 3, bond: 1, rest: 2, self: 0 };
  return {
    parents: { A: { ...parentAllocation }, B: { ...parentAllocation } },
    activity: { domain: "none", level: 0, sponsor: "A" },
    style: "respect",
    help: "none",
  };
}
export function start(scenario: string, seed: number): State {
  const parentStats = {
    age_months: 360,
    stress: 30,
    health: 80,
    fulfillment: 50,
    social: 50,
    regret: 10,
  };
  const state: State = {
    versions: { rules: "rules-1", data: "data-1", save: "save-2" },
    scenario,
    seed,
    phase: "childhood",
    n: 0,
    cash: 120,
    parents: { A: { ...parentStats }, B: { ...parentStats } },
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
  openTurn(state);
  return state;
}
export function stage(completedTurns: number) {
  const age = integerDivide(completedTurns, 2);
  if (age < 3) return { id: "baby", care: 6, cost: 20, school: "未就学" };
  if (age < 6) return { id: "preschool", care: 4, cost: 24, school: "未就学" };
  if (age < 12) return { id: "primary", care: 2, cost: 28, school: `小${age - 5}` };
  if (age < 15) return { id: "junior", care: 1, cost: 32, school: `中${age - 11}` };
  if (age < 18) return { id: "senior", care: 1, cost: 36, school: `高${age - 14}相当` };
  return { id: "launch", care: 1, cost: 36, school: "進路準備期" };
}
export function draw(state: State, phase: string, index: number, slot: string) {
  // 抽選スロットごとに独立した値を作り、呼び出し順で既存の抽選結果を変えない。
  const key = `rules-1|data-1|${state.seed}|${phase}|${index}|${slot}`;
  const value = Number(BigInt("0x" + hash(key).slice(0, 16)) % 100n);
  state.draws.push({ phase, index, slot, value });
  return value;
}
export function observeChild(state: State): Observation[] {
  const child = state.child;
  const observations: Observation[] = [];
  const isBaby = stage(Math.min(state.n, 39)).id === "baby";
  const addObservation = (code: string, subject: string, text: string) =>
    observations.push({ code, subject, text });
  addObservation(
    "energy",
    "child",
    child.stress < 40
      ? "余裕がありそう"
      : child.stress < 70
        ? "少し疲れている様子"
        : "休みたがることが増えた",
  );
  for (const parentId of PEOPLE) {
    const texts = isBaby
      ? ["反応が少ない", "声や気配に反応する", "自分から触れ合いを求める"]
      : ["話しかけても会話が続きにくい", "用事や近況を話す", "自分から話をしに来る"];
    const trust = child.trust[parentId];
    addObservation(
      "relationship." + parentId,
      parentId,
      texts[trust < 30 ? 0 : trust < 60 ? 1 : 2],
    );
  }
  if (!isBaby)
    addObservation(
      "agency",
      "child",
      child.autonomy < 30
        ? "決めてもらうのを待つことが多い"
        : child.autonomy < 60
          ? "選択肢を示すと選ぶ"
          : "自分の希望を言う",
    );
  for (const domain of DOMAINS) {
    const prefix = isBaby
      ? domain === "study"
        ? "ことばや数の遊び："
        : "形や音の遊び："
      : domain === "study"
        ? "学習："
        : "創作：";
    addObservation(
      "interest." + domain,
      domain,
      prefix +
        (child.interest[domain] < 40
          ? "最近は話題にしない"
          : child.interest[domain] < 60
            ? "誘うと取り組むことがある"
            : "自分から話題にする"),
    );
    addObservation(
      "progress." + domain,
      domain,
      prefix +
        (child.ability[domain] < 30
          ? "試しながら覚えている"
          : child.ability[domain] < 60
            ? "一人でできることが増えた"
            : "得意なこととして披露する"),
    );
  }
  const latestStressDelta = state.deltas.at(-1) ?? 0;
  if (state.deltas.length) {
    if (state.changed && latestStressDelta >= 5)
      addObservation("settling", "child", "新しい場の後は疲れている様子");
    if ((state.paused || state.last_repair) && latestStressDelta < 0)
      addObservation("recovery", "child", "前より余裕が出てきた様子");
  }
  if (
    state.deltas.length >= 2 &&
    state.previous_plan.parents.A.bond + state.previous_plan.parents.B.bond >= 2
  ) {
    const previousStressDelta = state.deltas.at(-2)!;
    addObservation(
      "trend: " +
        (latestStressDelta > 0 && previousStressDelta > 0
          ? "strain_rising"
          : latestStressDelta < 0 && previousStressDelta < 0
            ? "strain_easing"
            : "mixed"),
      "child",
      latestStressDelta > 0 && previousStressDelta > 0
        ? "疲れが続いて増えている様子"
        : latestStressDelta < 0 && previousStressDelta < 0
          ? "疲れが続いて和らいでいる様子"
          : "調子には波がある",
    );
  }
  return observations;
}
export function openTurn(state: State) {
  state.observations = observeChild(state);
  state.events = [];
  state.answers = {};
  const turn = state.n + 1;
  const eventIds: string[] = [];
  const child = state.child;
  if (FIXED_EVENTS[turn]) eventIds.push(FIXED_EVENTS[turn]);
  if (
    turn >= 3 &&
    turn <= 38 &&
    turn - (state.seen["E-10"] ?? -100) >= 4 &&
    (child.stress >= 60 ||
      Math.min(child.trust.A, child.trust.B) < 40 ||
      Math.max(state.parents.A.stress, state.parents.B.stress) >= 70)
  )
    eventIds.push("E-10");
  else if (
    turn >= 5 &&
    !state.seen["E-09"] &&
    state.grandparents.network &&
    state.grandparents.funds >= 20 &&
    state.grandparents.relation >= 30
  )
    eventIds.push("E-09");
  for (const eventId of eventIds.sort()) {
    let target: Domain = "study";
    if (eventId === "E-05" && state.previous_plan.activity.domain !== "none")
      target = state.previous_plan.activity.domain;
    if (eventId === "E-07" && child.interest.craft > child.interest.study) target = "craft";
    let text = EVENT_DATA[eventId][0];
    if (eventId === "E-07")
      text += `「${target === "study" ? "学習" : "創作"}寄りの道を考えている」`;
    state.events.push({
      instance_id: `t${String(turn).padStart(2, "0")}:${eventId}`,
      event_id: eventId,
      text,
      target,
    });
    state.seen[eventId] = turn;
  }
}
export const answerList = (answers: Record<string, string>) =>
  Object.keys(answers)
    .sort()
    .map((id) => ({ event_instance: id, option_id: answers[id] }));
export function forecast(state: State, answers = state.answers): Forecast {
  const plan = state.plan;
  const lifeStage = stage(state.n);
  const reasons: Reason[] = [];
  const timeUsed = { A: 0, B: 0 };
  let income = 0;
  let cost =
    200 + lifeStage.cost + [0, 12, 30][plan.activity.level] + (plan.help === "paid" ? 8 : 0);
  let allocatedCare = 0;
  const addReason = (code: string, path: string, message: string) =>
    reasons.push({ code, path, message });
  for (const parentId of PEOPLE) {
    const allocation = plan.parents[parentId];
    income += WORK[allocation.work].income;
    cost += 4 * allocation.self;
    timeUsed[parentId] =
      WORK[allocation.work].time +
      allocation.care +
      allocation.bond +
      allocation.rest +
      allocation.self +
      (plan.activity.sponsor === parentId ? plan.activity.level : 0);
    allocatedCare += allocation.care;
    if (timeUsed[parentId] > 12)
      addReason(
        "TIME_LIMIT",
        "parents." + parentId,
        `親${parentId}の配分が12時間単位を超えています`,
      );
  }
  const requiredCare = Math.max(0, lifeStage.care - (plan.help !== "none" ? 2 : 0));
  if (allocatedCare !== requiredCare)
    addReason("CARE_MISMATCH", "parents", `今期の世話は合計${requiredCare}単位に配分してください`);
  if (plan.help === "grand" && (state.grandparents.health < 40 || state.grandparents.relation < 30))
    addReason("HELP_UNAVAILABLE", "help", "祖父母の体力か関係に余裕がありません");
  if (lifeStage.id === "baby" && plan.activity.domain !== "none")
    addReason("ACTIVITY_AGE", "activity.domain", "乳児期の遊びは関わりの時間で扱います");
  for (const event of state.events) {
    if (!answers[event.instance_id]) {
      addReason(
        "ANSWER_REQUIRED",
        event.instance_id,
        "出来事への回答が必要です（費用0の選択肢もあります）",
      );
      continue;
    }
    const [, , optionCost, effects] = findEventOption(event.event_id, answers[event.instance_id]);
    cost += optionCost;
    const aid = Number(effects.income ?? 0);
    income += aid;
    if (aid > state.grandparents.funds)
      addReason("FUNDS_UNAVAILABLE", event.instance_id, "祖父母の援助資金が足りません");
  }
  if (state.cash + income - cost < 0) addReason("CASH_LIMIT", "cash", "予測残金が不足しています");
  const fallbackPlan = initialPlan();
  for (const parentId of PEOPLE) {
    fallbackPlan.parents[parentId].care = integerDivide(
      lifeStage.care + (parentId === "A" ? 1 : 0),
      2,
    );
    fallbackPlan.parents[parentId].bond = 0;
    fallbackPlan.parents[parentId].rest = 0;
    fallbackPlan.parents[parentId].self = 0;
  }
  return {
    income,
    cost,
    projected_cash: state.cash + income - cost,
    time_used: timeUsed,
    time_limit: 12,
    care_required: requiredCare,
    care_allocated: allocatedCare,
    can_advance: !reasons.length,
    reasons,
    uncertain_expense_cap: 8,
    fallback_plan: fallbackPlan,
  };
}
export function publicView(state: State): { public: PublicState; choices: Choice[] } {
  // 公開項目を列挙する境界。Stateを展開すると、子どもの隠し数値がUIへ漏れる。
  const finished = state.phase === "finished";
  const lifeStage = stage(state.n);
  const publicState: PublicState = {
    versions: state.versions,
    time: {
      completed_turns: state.n,
      next_turn: finished ? null : state.n + 1,
      child_months: state.n * 6,
      season: finished ? null : state.n % 2 === 0 ? "春〜夏" : "秋〜冬",
      stage: finished ? null : lifeStage.id,
      school_label: finished ? null : lifeStage.school,
    },
    cash: finished ? null : state.cash,
    parents: state.parents,
    couple: state.couple,
    grandparents: state.grandparents,
    observations: state.observations,
    plan: finished ? null : state.plan,
    answers: finished ? [] : answerList(state.answers),
    forecast: finished ? null : forecast(state),
  };
  const choices: Choice[] = finished
    ? []
    : state.events.map((event) => ({
        instance_id: event.instance_id,
        event_id: event.event_id,
        text: event.text,
        options: EVENT_DATA[event.event_id][1].map(([id, label, cost, effects]) => {
          const optionId = event.event_id + ":" + id;
          const reasons = forecast(state, {
            ...state.answers,
            [event.instance_id]: optionId,
          }).reasons.filter((reason) => reason.code !== "ANSWER_REQUIRED");
          return {
            option_id: optionId,
            label,
            cost,
            income: Number(effects.income ?? 0),
            available: !reasons.length,
            reasons,
          };
        }),
      }));
  return clone({ public: publicState, choices });
}
export function normalUpdate(state: State) {
  // 全員の変化は同じ期首の数値から計算する。更新済みの親の数値を参照しない。
  const previousState = numericState(state);
  const plan = state.plan;
  const child = state.child;
  const styleIntensity =
    stage(state.n).id === "baby" ? 0 : ["respect", "coach", "push"].indexOf(plan.style);
  const activityDomain = plan.activity.domain;
  const activityLevel = plan.activity.level;
  const hasActivity = activityDomain !== "none";
  const activityChanged = hasActivity && activityDomain !== state.previous_plan.activity.domain;
  const parentalStrain = Number(
    previousState.parents.A.stress >= 70 || previousState.parents.B.stress >= 70,
  );
  const hasConflict =
    previousState.child.stress >= 60 ||
    (hasActivity && previousState.child.interest[activityDomain] < 40);
  for (const parentId of PEOPLE) {
    const allocation = plan.parents[parentId];
    const previousParent = previousState.parents[parentId];
    const workload = WORK[allocation.work];
    const previousTrust = previousState.child.trust[parentId];
    Object.assign(state.parents[parentId], {
      stress: clampStat(
        previousParent.stress +
          workload.stress +
          allocation.care +
          (plan.activity.sponsor === parentId ? activityLevel : 0) -
          3 * allocation.rest -
          2 * allocation.self -
          3,
      ),
      health: Math.max(
        10,
        Math.min(
          100,
          previousParent.health +
            Number(allocation.rest >= 2) -
            2 * Number(previousParent.stress >= 70) -
            Number(previousParent.stress >= 90),
        ),
      ),
      fulfillment: clampStat(
        previousParent.fulfillment +
          workload.fulfillment +
          3 * allocation.self -
          4 -
          2 * Number(previousParent.stress >= 70),
      ),
      social: clampStat(previousParent.social + 3 * allocation.self - 2),
      regret: clampStat(
        previousParent.regret +
          Number(
            previousParent.stress >= 70 || previousTrust < 30 || previousParent.fulfillment < 25,
          ) -
          Number(allocation.bond >= 1 && previousParent.stress < 60 && previousTrust >= 50),
      ),
    });
    child.trust[parentId] = clampStat(
      previousTrust +
        allocation.bond -
        1 +
        Number(styleIntensity === 0) -
        2 * Number(styleIntensity === 2 && hasConflict),
    );
  }
  state.couple = clampStat(
    previousState.couple +
      Number(plan.parents.A.rest >= 1 && plan.parents.B.rest >= 1) -
      Number(Math.abs(plan.parents.A.care - plan.parents.B.care) >= 3) -
      parentalStrain,
  );
  child.stress = clampStat(
    previousState.child.stress +
      2 * activityLevel +
      2 * styleIntensity +
      previousState.child.adaptation * Number(activityChanged) +
      2 * parentalStrain -
      plan.parents.A.bond -
      plan.parents.B.bond -
      3 * Number(!hasActivity),
  );
  child.autonomy = clampStat(
    previousState.child.autonomy +
      Number(stage(state.n).id !== "baby") *
        (2 * Number(styleIntensity === 0) +
          Number(styleIntensity === 1) -
          2 * Number(styleIntensity === 2)),
  );
  for (const domain of DOMAINS) {
    const schoolGain = Number(["primary", "junior", "senior"].includes(stage(state.n).id));
    const abilityGain = Math.max(
      0,
      schoolGain +
        Number(domain === activityDomain) *
          (activityLevel +
            Number(previousState.child.interest[domain] >= 60) +
            Number(previousState.child.aptitude[domain] === 3 && (state.n + 1) % 2 === 0)) -
        2 * Number(previousState.child.stress >= 70),
    );
    child.ability[domain] = clampStat(previousState.child.ability[domain] + abilityGain);
    child.interest[domain] = clampStat(
      previousState.child.interest[domain] +
        Number(domain === activityDomain) * (1 - 3 * Number(previousState.child.stress >= 60)) -
        Number((state.n + 1) % 2 === 0 && hasActivity && domain !== activityDomain),
    );
  }
  state.grandparents.health = Math.max(
    0,
    Math.min(
      80,
      previousState.grandparents.health +
        (plan.help === "grand" ? -3 : 1) -
        Number((state.n + 1) % 2 === 0),
    ),
  );
  state.grandparents.relation = clampStat(
    previousState.grandparents.relation + (plan.help === "grand" ? -1 : 1),
  );
  state.changed = activityChanged;
  state.paused = !hasActivity && state.previous_plan.activity.domain !== "none";
}
export function applyEffect(state: State, effect: Record<string, number | string>, target: Domain) {
  for (const [key, raw] of Object.entries(effect)) {
    const amount = Number(raw);
    // 効果キーはdata-1の表記。incomeとdelayは予測・確定処理がそれぞれ扱う。
    switch (key) {
      case "S":
      case "F":
      case "G": {
        const field = ({ S: "stress", F: "fulfillment", G: "regret" } as const)[key];
        for (const parentId of PEOPLE)
          state.parents[parentId][field] = clampStat(state.parents[parentId][field] + amount);
        break;
      }
      case "T": {
        for (const parentId of PEOPLE)
          state.child.trust[parentId] = clampStat(state.child.trust[parentId] + amount);
        break;
      }
      case "X":
      case "U":
      case "adapt": {
        const field = key === "U" ? "autonomy" : "stress";
        state.child[field] = clampStat(
          state.child[field] + amount * (key === "adapt" ? state.child.adaptation : 1),
        );
        break;
      }
      case "GM":
      case "GR": {
        const field = key === "GM" ? "funds" : "relation";
        state.grandparents[field] = clampStat(state.grandparents[field] + amount);
        break;
      }
      default: {
        if (key.startsWith("B_") || key.startsWith("I_")) {
          const domain = key.slice(2) === "target" ? target : (key.slice(2) as Domain);
          const field = key.startsWith("B_") ? "ability" : "interest";
          state.child[field][domain] = clampStat(state.child[field][domain] + amount);
        }
      }
    }
  }
}
export function applyOddity(
  state: State,
  value: number,
  money: Money,
  lines: string[],
  events: History["events"],
) {
  let id = "";
  let line = "";
  if (value < 10) {
    id = "O-01";
    line = "忘れていた返金。家計簿が一瞬だけ拍手した。";
    money.income += 10;
    money.cap_overflow += Math.max(0, state.cash + 10 - 99999);
    state.cash = Math.min(99999, state.cash + 10);
  } else if (value < 18) {
    id = "O-02";
    line = "家電が、今しかないという顔で止まった。";
    if (state.cash < 8) lines.push("残金の範囲に修理を縮小した。負債はない。");
    money.expense += Math.min(state.cash, 8);
    state.cash = Math.max(0, state.cash - 8);
    for (const parentId of PEOPLE)
      state.parents[parentId].stress = clampStat(state.parents[parentId].stress + 1);
  } else if (value < 25) {
    id = "O-03";
    line = "家族の妙な作品が回覧板の表紙になった。";
    state.oddity_count++;
    for (const parentId of PEOPLE) {
      state.parents[parentId].fulfillment = clampStat(state.parents[parentId].fulfillment + 2);
      state.parents[parentId].social = clampStat(state.parents[parentId].social + 2);
    }
  }
  if (id) {
    lines.push(line);
    events.push({
      instance_id: `t${String(state.n + 1).padStart(2, "0")}:${id}`,
      event_id: id,
      option_id: null,
      text: line,
    });
  }
}
export function advance(state: State, forcedDraw = -1) {
  const turn = state.n + 1;
  const before = numericState(state);
  const projection = forecast(state);
  const money: Money = {
    scope: "household",
    before: state.cash,
    income: projection.income,
    expense: projection.cost,
    cap_overflow: Math.max(0, projection.projected_cash - 99999),
    after: 0,
  };
  state.cash = Math.min(99999, projection.projected_cash);
  // 通常更新 → 選択の即時効果 → 遅延効果 → 偶発事象の順序もrules-1の一部。
  normalUpdate(state);
  const lines: string[] = [];
  const events: History["events"] = [];
  const related: string[] = [];
  state.last_repair = false;
  for (const event of state.events) {
    const optionId = state.answers[event.instance_id];
    const [, label, , effects] = findEventOption(event.event_id, optionId);
    applyEffect(state, effects, event.target);
    lines.push(`『${label}』を選んだ。`);
    events.push({
      instance_id: event.instance_id,
      event_id: event.event_id,
      option_id: optionId,
      text: event.text,
    });
    if (effects.delay) {
      state.queue.push({
        id: String(effects.delay),
        due_turn: turn + 2,
        source: event.instance_id,
        target: event.target,
      });
      if (effects.delay === "L-02") {
        state.repaired = true;
        state.last_repair = true;
      }
    }
  }
  const pendingEffects: State["queue"] = [];
  for (const delayed of state.queue) {
    if (delayed.due_turn !== turn) {
      pendingEffects.push(delayed);
      continue;
    }
    const canResume =
      state.plan.style !== "push" && state.plan.parents.A.bond + state.plan.parents.B.bond >= 2;
    if (delayed.id === "L-01") {
      if (canResume) applyEffect(state, { B_target: 2 }, delayed.target);
      lines.push(canResume ? "少し間を置いて、また取り組み始めた。" : "再開はまだ先になりそう。");
    } else {
      if (canResume) applyEffect(state, { X: -4, T: 2, G: -1 }, delayed.target);
      lines.push(
        canResume
          ? "あの会話のあと、少し話しやすくなった様子。"
          : "話しやすさが続くか、もう少し様子を見たい。",
      );
    }
    related.push(delayed.source);
  }
  state.queue = pendingEffects;
  applyOddity(
    state,
    forcedDraw < 0 ? draw(state, "child", turn, "oddity") : forcedDraw,
    money,
    lines,
    events,
  );
  money.after = state.cash;
  if (money.cap_overflow > 0) lines.push(`保有上限による計上外：${money.cap_overflow}万円。`);
  state.n = turn;
  for (const parentId of PEOPLE) state.parents[parentId].age_months += 6;
  state.deltas.push(state.child.stress - before.child.stress);
  if (state.deltas.length > 2) state.deltas.shift();
  state.previous_plan = clone(state.plan);
  state.observations = observeChild(state);
  state.history.push({
    index: state.history.length,
    kind: "turn",
    turn: turn,
    adult_step: null,
    ages: {
      child_months: turn * 6,
      A_months: state.parents.A.age_months,
      B_months: state.parents.B.age_months,
    },
    actions: { plan: clone(state.plan), answers: answerList(state.answers) },
    events,
    money: [money],
    observations: clone(state.observations),
    text: lines,
    related,
    adult_result: null,
  });
  state.effects.push({ turn: turn, before, after: numericState(state) });
  if (turn === 40) {
    state.answers = {};
    state.events = [];
    finish(state, draw);
    state.phase = "finished";
  } else openTurn(state);
}
export function numericState(state: State): NumericState {
  return clone({
    cash: state.cash,
    parents: state.parents,
    couple: state.couple,
    child: state.child,
    grandparents: state.grandparents,
  });
}
