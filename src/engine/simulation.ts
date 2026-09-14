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
import { matches, findEventOption } from "./events";
import { catalog, contentFor, difficultyFor, defaultContent } from "../content/catalog";
import type { Settings } from "../content/types";
import { finish } from "./adult";
export function initialPlan(): Plan {
  const parentAllocation = { work: "normal" as const, care: 3, bond: 1, rest: 2, self: 0 };
  return {
    parents: { A: { ...parentAllocation }, B: { ...parentAllocation } },
    activity: { domain: "none", level: 0, sponsor: "A" },
    style: "respect",
    help: "none",
  };
}
export function start(
  scenario: string,
  seed: number,
  settings: Settings | null = catalog.resolve(),
): State {
  const parentStats = {
    age_months: 360,
    stress: 30,
    health: 80,
    fulfillment: 50,
    social: 50,
    regret: 10,
  };
  const state: State = {
    versions: settings
      ? { rules: "rules-2", data: "data-2", save: "save-3" }
      : { rules: "rules-1", data: "data-1", save: "save-2" },
    ...(settings ? { settings: clone(settings) } : {}),
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
  const family = contentFor(state).scenarios.find((s) => s.id === scenario);
  if (!family) throw new Error("不明な家庭です");
  state.child.adaptation = family.adaptation;
  state.cash = difficultyFor(state).initial_cash;
  openTurn(state);
  return state;
}
export function stage(completedTurns: number, state?: State) {
  const content = state ? contentFor(state) : defaultContent;
  const age = integerDivide(completedTurns, 2);
  const stage = content.stages.find((s) => age < s.until_age)!;
  const year = stage.id === "primary" ? age - 5 : stage.id === "junior" ? age - 11 : age - 14;
  return { ...stage, school: stage.school.replace("{year}", String(year)) };
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
  const isBaby = stage(Math.min(state.n, 39), state).id === "baby";
  const addObservation = (code: string, subject: string, text: string) =>
    observations.push({ code, subject, text });
  addObservation(
    "energy",
    "child",
    child.stress < 40
      ? contentFor(state).text.simulation_000
      : child.stress < 70
        ? contentFor(state).text.simulation_001
        : contentFor(state).text.simulation_002,
  );
  for (const parentId of PEOPLE) {
    const texts = isBaby
      ? [
          contentFor(state).text.simulation_003,
          contentFor(state).text.simulation_004,
          contentFor(state).text.simulation_005,
        ]
      : [
          contentFor(state).text.simulation_006,
          contentFor(state).text.simulation_007,
          contentFor(state).text.simulation_008,
        ];
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
        ? contentFor(state).text.simulation_009
        : child.autonomy < 60
          ? contentFor(state).text.simulation_010
          : contentFor(state).text.simulation_011,
    );
  for (const domain of DOMAINS) {
    const prefix = isBaby
      ? domain === "study"
        ? contentFor(state).text.simulation_012
        : contentFor(state).text.simulation_013
      : domain === "study"
        ? contentFor(state).text.simulation_014
        : contentFor(state).text.simulation_015;
    addObservation(
      "interest." + domain,
      domain,
      prefix +
        (child.interest[domain] < 40
          ? contentFor(state).text.simulation_016
          : child.interest[domain] < 60
            ? contentFor(state).text.simulation_017
            : contentFor(state).text.simulation_018),
    );
    addObservation(
      "progress." + domain,
      domain,
      prefix +
        (child.ability[domain] < 30
          ? contentFor(state).text.simulation_019
          : child.ability[domain] < 60
            ? contentFor(state).text.simulation_020
            : contentFor(state).text.simulation_021),
    );
  }
  const latestStressDelta = state.deltas.at(-1) ?? 0;
  if (state.deltas.length) {
    if (state.changed && latestStressDelta >= 5)
      addObservation("settling", "child", contentFor(state).text.simulation_022);
    if ((state.paused || state.last_repair) && latestStressDelta < 0)
      addObservation("recovery", "child", contentFor(state).text.simulation_023);
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
        ? contentFor(state).text.simulation_024
        : latestStressDelta < 0 && previousStressDelta < 0
          ? contentFor(state).text.simulation_025
          : contentFor(state).text.simulation_026,
    );
  }
  return observations;
}
export function openTurn(state: State) {
  state.observations = observeChild(state);
  state.events = [];
  state.answers = {};
  const turn = state.n + 1;
  const content = contentFor(state);
  const groups = new Set<string>();
  const selected: string[] = [];
  const candidates = Object.entries(content.events).sort(
    ([a, x], [b, y]) => x.trigger.priority - y.trigger.priority || (a < b ? -1 : 1),
  );
  for (const [id, event] of candidates) {
    const t = event.trigger;
    if (
      turn < t.min_turn ||
      turn > t.max_turn ||
      (t.turns.length && !t.turns.includes(turn)) ||
      (t.once && state.seen[id] !== undefined) ||
      turn - (state.seen[id] ?? -100) < t.cooldown ||
      (t.group && groups.has(t.group)) ||
      !t.all.every((c) => matches(state, c)) ||
      (t.any.length && !t.any.some((c) => matches(state, c))) ||
      t.probability === 0
    )
      continue;
    if (t.probability < 100 && draw(state, "child", turn, "event-" + id) >= t.probability) continue;
    selected.push(id);
    if (t.group) groups.add(t.group);
  }
  for (const eventId of selected.sort()) {
    const event = content.events[eventId];
    const target: Domain =
      event.target === "previous_activity"
        ? state.previous_plan.activity.domain === "none"
          ? "study"
          : state.previous_plan.activity.domain
        : event.target === "interest"
          ? state.child.interest.craft > state.child.interest.study
            ? "craft"
            : "study"
          : event.target;
    state.events.push({
      instance_id: `t${String(turn).padStart(2, "0")}:${eventId}`,
      event_id: eventId,
      text:
        event.text + event.target_suffix.replace("{domain}", target === "study" ? "学習" : "創作"),
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
  const content = contentFor(state);
  const plan = state.plan;
  const lifeStage = stage(state.n, state);
  const reasons: Reason[] = [];
  const timeUsed = { A: 0, B: 0 };
  let income = 0;
  let cost =
    difficultyFor(state).living_cost +
    lifeStage.cost +
    content.balance.activity_cost[plan.activity.level] +
    (plan.help === "paid" ? content.balance.paid_help_cost : 0);
  let allocatedCare = 0;
  const addReason = (code: string, path: string, message: string) =>
    reasons.push({ code, path, message });
  const extraId = plan.extra_action ?? "none";
  const extra = content.actions[extraId];
  if (
    extraId !== "none" &&
    (!Object.hasOwn(content.actions, extraId) ||
      state.n + 1 < extra.min_turn ||
      state.n + 1 > extra.max_turn)
  )
    addReason("ACTION_UNAVAILABLE", "extra_action", "この期には選べない追加行動です");
  if (extra) cost += extra.cost;
  for (const parentId of PEOPLE) {
    const allocation = plan.parents[parentId];
    income += content.work[allocation.work].income;
    cost += content.balance.self_cost * allocation.self;
    timeUsed[parentId] =
      content.work[allocation.work].time +
      (extra?.parent === parentId ? extra.time : 0) +
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
  const requiredCare = Math.max(
    0,
    lifeStage.care - (plan.help !== "none" ? content.balance.help_care : 0),
  );
  if (allocatedCare !== requiredCare)
    addReason("CARE_MISMATCH", "parents", `今期の世話は合計${requiredCare}単位に配分してください`);
  if (plan.help === "grand" && (state.grandparents.health < 40 || state.grandparents.relation < 30))
    addReason("HELP_UNAVAILABLE", "help", contentFor(state).text.simulation_029);
  if (lifeStage.id === "baby" && plan.activity.domain !== "none")
    addReason("ACTIVITY_AGE", "activity.domain", contentFor(state).text.simulation_030);
  for (const event of state.events) {
    if (!answers[event.instance_id]) {
      addReason("ANSWER_REQUIRED", event.instance_id, contentFor(state).text.simulation_031);
      continue;
    }
    const { cost: optionCost, effects } = findEventOption(
      state,
      event.event_id,
      answers[event.instance_id],
    );
    cost += optionCost;
    const aid = Number(effects.income ?? 0);
    income += aid;
    if (aid > state.grandparents.funds)
      addReason("FUNDS_UNAVAILABLE", event.instance_id, contentFor(state).text.simulation_032);
  }
  if (state.cash + income - cost < 0)
    addReason("CASH_LIMIT", "cash", contentFor(state).text.simulation_033);
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
    uncertain_expense_cap: Math.max(0, ...content.oddities.map((o) => o.cost)),
    fallback_plan: fallbackPlan,
  };
}
export function publicView(state: State): { public: PublicState; choices: Choice[] } {
  // 公開項目を列挙する境界。Stateを展開すると、子どもの隠し数値がUIへ漏れる。
  const finished = state.phase === "finished";
  const lifeStage = stage(state.n, state);
  const content = contentFor(state);
  const scene = content.scenes[lifeStage.id];
  const publicState: PublicState = {
    content: {
      difficulty: state.settings?.difficulty ?? "normal",
      difficulty_label: difficultyFor(state).label,
      packs: state.settings?.packs ?? [],
      fingerprint: state.settings?.fingerprint ?? null,
    },
    extra_actions: Object.entries(content.actions).map(([id, a]) => ({
      id,
      label: a.label,
      description: a.description,
      cost: a.cost,
      time: a.time,
      parent: a.parent,
      available: !finished && state.n + 1 >= a.min_turn && state.n + 1 <= a.max_turn,
      visual: a.visual ? content.visuals[a.visual] : null,
    })),
    scene: finished
      ? null
      : {
          title: scene.title,
          text: scene.text,
          visual: scene.visual ? content.visuals[scene.visual] : null,
        },
    versions: state.versions,
    time: {
      completed_turns: state.n,
      next_turn: finished ? null : state.n + 1,
      child_months: state.n * 6,
      season: finished
        ? null
        : state.n % 2 === 0
          ? contentFor(state).text.simulation_034
          : contentFor(state).text.simulation_035,
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
        visual: content.events[event.event_id].visual
          ? content.visuals[content.events[event.event_id].visual!]
          : null,
        instance_id: event.instance_id,
        event_id: event.event_id,
        text: event.text,
        options: content.events[event.event_id].options.map(({ id, label, cost, effects }) => {
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
  const content = contentFor(state);
  const plan = state.plan;
  const child = state.child;
  const styleIntensity =
    stage(state.n, state).id === "baby" ? 0 : ["respect", "coach", "push"].indexOf(plan.style);
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
    const workload = content.work[allocation.work];
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
      Number(stage(state.n, state).id !== "baby") *
        (2 * Number(styleIntensity === 0) +
          Number(styleIntensity === 1) -
          2 * Number(styleIntensity === 2)),
  );
  for (const domain of DOMAINS) {
    const schoolGain = Number(["primary", "junior", "senior"].includes(stage(state.n, state).id));
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
      case "N":
      case "F":
      case "G": {
        const field = ({ S: "stress", N: "social", F: "fulfillment", G: "regret" } as const)[key];
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
  let threshold = 0;
  const oddity = contentFor(state).oddities.find((o) => {
    threshold += o.probability;
    return value < threshold;
  });
  if (!oddity) return;
  const expense = Math.min(state.cash, oddity.cost);
  if (expense < oddity.cost) lines.push("残金の範囲に修理を縮小した。負債はない。");
  money.expense += expense;
  money.income += oddity.income;
  money.cap_overflow += Math.max(0, state.cash - expense + oddity.income - 99999);
  state.cash = Math.min(99999, state.cash - expense + oddity.income);
  applyEffect(state, oddity.effects, "study");
  if (oddity.memory) state.oddity_count++;
  lines.push(oddity.text);
  events.push({
    instance_id: `t${String(state.n + 1).padStart(2, "0")}:${oddity.id}`,
    event_id: oddity.id,
    option_id: null,
    text: oddity.text,
  });
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
  const extra = contentFor(state).actions[state.plan.extra_action ?? "none"];
  if (extra) {
    applyEffect(state, extra.effects, extra.target);
    lines.push(`『${extra.label}』に取り組んだ。`);
  }
  state.last_repair = false;
  for (const event of state.events) {
    const optionId = state.answers[event.instance_id];
    const { label, effects } = findEventOption(state, event.event_id, optionId);
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
      lines.push(
        canResume ? contentFor(state).text.simulation_040 : contentFor(state).text.simulation_041,
      );
    } else {
      if (canResume) applyEffect(state, { X: -4, T: 2, G: -1 }, delayed.target);
      lines.push(
        canResume ? contentFor(state).text.simulation_042 : contentFor(state).text.simulation_043,
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
