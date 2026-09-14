import { contentFor } from "../content/catalog";
import type { State, ChildResult, ParentResult, Person, Result, History, Money } from "./types";
import { clampStat, integerDivide, clone, PEOPLE } from "./shared";
type Career = Omit<ChildResult, "age" | "happiness" | "autonomy">;
function childResult(state: State, age: number, career: Career): ChildResult {
  const child = state.child;
  return {
    ...career,
    age,
    happiness: clampStat(
      integerDivide(
        100 - child.stress + child.autonomy + Math.max(child.interest.study, child.interest.craft),
        3,
      ),
    ),
    autonomy: child.autonomy,
  };
}
function parentResult(
  state: State,
  parentId: Person,
  money: number,
  spouseAlive: boolean,
  childOutcome: ChildResult,
): ParentResult {
  const parentStats = state.parents[parentId];
  const axes = {
    relationship: integerDivide(
      2 * state.child.trust[parentId] + parentStats.social + (spouseAlive ? state.couple : 0),
      spouseAlive ? 4 : 3,
    ),
    security: integerDivide(Math.min(100, integerDivide(money, 5)) + parentStats.health, 2),
    fulfillment: parentStats.fulfillment,
    child_assurance: integerDivide(childOutcome.happiness + childOutcome.social_success, 2),
    regret: parentStats.regret,
  };
  const happiness = integerDivide(
    25 * axes.relationship +
      25 * axes.security +
      25 * axes.fulfillment +
      15 * axes.child_assurance +
      10 * (100 - axes.regret),
    100,
  );
  return {
    death_age: integerDivide(parentStats.age_months, 12),
    happiness,
    axes,
    cash: money,
    health: parentStats.health,
    label:
      happiness >= 75
        ? contentFor(state).text.adult_044
        : happiness >= 45
          ? contentFor(state).text.adult_045
          : contentFor(state).text.adult_046,
  };
}
export function ending(state: State, childOutcome: ChildResult): Result["ending"] {
  const trust = integerDivide(state.child.trust.A + state.child.trust.B, 2);
  const fulfillment = integerDivide(state.parents.A.fulfillment + state.parents.B.fulfillment, 2);
  const social = integerDivide(state.parents.A.social + state.parents.B.social, 2);
  let id = "EN-05";
  let title = contentFor(state).text.adult_047;
  let text = contentFor(state).text.adult_048;
  // 複数条件が成立する場合も上から優先する（ending-1）。独立した判定に分けない。
  if (childOutcome.social_success >= 70 && trust < 40) {
    id = "EN-01";
    title = contentFor(state).text.adult_049;
    text = contentFor(state).text.adult_050;
  } else if (state.repaired && trust >= 60) {
    id = "EN-02";
    title = contentFor(state).text.adult_051;
    text = contentFor(state).text.adult_052;
  } else if (fulfillment >= 70 && social >= 50) {
    id = "EN-03";
    title = contentFor(state).text.adult_053;
    text = contentFor(state).text.adult_054;
  } else if (childOutcome.residence === "far" && trust >= 60) {
    id = "EN-04";
    title = contentFor(state).text.adult_055;
    text = contentFor(state).text.adult_056;
  }
  return { version: "ending-1", id, title, text };
}
export function finish(
  state: State,
  draw: (state: State, phase: string, index: number, slot: string) => number,
) {
  const child = state.child;
  const domain = child.interest.craft > child.interest.study ? "craft" : "study";
  const route =
    child.ability[domain] >= 60 ? "specialist" : child.autonomy >= 50 ? "explorer" : "supported";
  const careerDraw = draw(state, "adult", 0, "career");
  const success = clampStat(
    integerDivide(child.ability[domain] + child.autonomy, 2) +
      (careerDraw < contentFor(state).adult.career_low_probability
        ? -10
        : careerDraw >= 100 - contentFor(state).adult.career_high_probability
          ? 10
          : 0),
  );
  const distance = draw(state, "adult", 0, "distance");
  const career: Career = {
    domain,
    route,
    social_success: success,
    residence:
      distance <
      (success >= 60
        ? contentFor(state).adult.distance_success_probability
        : contentFor(state).adult.distance_other_probability)
        ? "far"
        : "near",
  };
  const accounts = { A: integerDivide(state.cash + 1, 2), B: integerDivide(state.cash, 2) };
  const alive = { A: true, B: true };
  const results = {} as Record<Person, ParentResult>;
  let childOutcome = childResult(state, 20, career);
  for (let adultStep = 1; adultStep <= 8; adultStep++) {
    const previousState = clone({ parents: state.parents, child: state.child });
    // 同じ期間に二人とも亡くなる場合も、互いの配偶者を期首の生存状態で評価する。
    const wasAlive = { ...alive };
    const money: Money[] = [];
    const lines: string[] = [];
    const events: History["events"] = [];
    const addEvent = (id: string, subject: string, text: string) =>
      events.push({
        instance_id: `a${String(adultStep).padStart(2, "0")}:${id}:${subject}`,
        event_id: id,
        option_id: null,
        text,
      });
    for (const parentId of PEOPLE) {
      if (!alive[parentId]) continue;
      const before = accounts[parentId];
      const income =
        5 *
        (adultStep <= 3
          ? contentFor(state).work[state.previous_plan.parents[parentId].work].income * 2
          : 200);
      const plannedExpense = 5 * (adultStep <= 3 ? 240 : 220);
      const shortfall = before + income < plannedExpense;
      const expense = Math.min(plannedExpense, before + income);
      const overflow = Math.max(0, before + income - expense - 99999);
      accounts[parentId] = before + income - expense - overflow;
      money.push({
        scope: parentId,
        before,
        income,
        expense,
        cap_overflow: overflow,
        after: accounts[parentId],
      });
      if (shortfall)
        lines.push(`親${parentId}：暮らしを${plannedExpense - expense}万円縮小して調整した。`);
      if (overflow) lines.push(`親${parentId}：保有上限による計上外${overflow}万円。`);
      const previousParent = previousState.parents[parentId];
      const previousTrust = previousState.child.trust[parentId];
      Object.assign(state.parents[parentId], {
        stress: clampStat(previousParent.stress - 8 + 4 * Number(shortfall)),
        health: Math.max(
          0,
          previousParent.health -
            (adultStep <= 3 ? 5 : 10) -
            3 * Number(previousParent.stress >= 60) -
            2 * Number(shortfall),
        ),
        fulfillment: clampStat(
          previousParent.fulfillment +
            (previousParent.social >= 50 ? 3 : -3) -
            3 * Number(previousParent.health < 30),
        ),
        social: clampStat(previousParent.social - 2),
        regret: clampStat(
          previousParent.regret +
            Number(previousTrust < 30 || previousParent.fulfillment < 25) -
            Number(previousTrust >= 60 && previousParent.fulfillment >= 50),
        ),
        age_months: (50 + 5 * adultStep) * 12,
      });
      child.trust[parentId] = clampStat(previousTrust + (previousTrust >= 50 ? 2 : -1));
    }
    child.stress = clampStat(previousState.child.stress - 5 + 5 * Number(success < 40));
    child.autonomy = clampStat(previousState.child.autonomy + Number(route !== "supported"));
    for (const parentId of PEOPLE) {
      if (!alive[parentId]) continue;
      if (adultStep === 1) {
        if (child.trust[parentId] >= 50)
          state.parents[parentId].fulfillment = clampStat(state.parents[parentId].fulfillment + 2);
        addEvent(
          "A-01",
          parentId,
          `親${parentId}：${child.trust[parentId] >= 50 ? contentFor(state).text.adult_057 : contentFor(state).text.adult_058}`,
        );
      }
      if (adultStep === 3) {
        if (state.parents[parentId].social >= 50)
          state.parents[parentId].fulfillment = clampStat(state.parents[parentId].fulfillment + 3);
        addEvent(
          "A-02",
          parentId,
          `親${parentId}：${state.parents[parentId].social >= 50 ? contentFor(state).text.adult_059 : contentFor(state).text.adult_060}`,
        );
      }
      if (
        adultStep >= 4 &&
        draw(state, "adult", adultStep, `health-${parentId}`) <
          contentFor(state).adult.health_probability
      ) {
        state.parents[parentId].health = Math.max(0, state.parents[parentId].health - 5);
        addEvent("A-03", parentId, `親${parentId}：体調を崩し、しばらく休んだ。`);
      }
      if (adultStep === 5 && state.repaired && child.trust[parentId] >= 60) {
        state.parents[parentId].regret = clampStat(state.parents[parentId].regret - 3);
        addEvent("A-04", parentId, `親${parentId}：昔の言い争いを、今は一緒に振り返れた。`);
      }
    }
    if (adultStep === 6 && state.oddity_count > 0)
      addEvent("A-05", "family", contentFor(state).text.adult_061);
    childOutcome = childResult(state, 20 + 5 * adultStep, career);
    const deaths = PEOPLE.filter(
      (parentId) =>
        alive[parentId] &&
        (adultStep === 8 || (adultStep >= 3 && state.parents[parentId].health === 0)),
    );
    const stepResults: Record<Person, ParentResult | null> = { A: null, B: null };
    for (const parentId of deaths) {
      const result = parentResult(
        state,
        parentId,
        accounts[parentId],
        wasAlive[parentId === "A" ? "B" : "A"],
        childOutcome,
      );
      results[parentId] = result;
      stepResults[parentId] = clone(result);
      alive[parentId] = false;
      const axes = result.axes;
      lines.push(
        `親${parentId}は${result.death_age}歳で最期を迎えた。幸福${result.happiness}。関係${axes.relationship}／安心${axes.security}／充実${axes.fulfillment}／子への安心${axes.child_assurance}／後悔${axes.regret}。`,
      );
    }
    if (deaths.length === 1) {
      const survivor = deaths[0] === "A" ? "B" : "A";
      if (alive[survivor]) {
        state.parents[survivor].stress = clampStat(state.parents[survivor].stress + 10);
        lines.push(`親${survivor}は伴侶を見送った。残る日々をたどる。`);
      }
    }
    events.sort((leftEvent, rightEvent) =>
      leftEvent.instance_id < rightEvent.instance_id ? -1 : 1,
    );
    lines.push(
      ...events.map((event) => event.text),
      `子ども${childOutcome.age}歳：幸福${childOutcome.happiness}、主体性${childOutcome.autonomy}。`,
    );
    state.history.push({
      index: state.history.length,
      kind: "adult",
      turn: null,
      adult_step: adultStep,
      ages: {
        child_months: childOutcome.age * 12,
        A_months: state.parents.A.age_months,
        B_months: state.parents.B.age_months,
      },
      actions: null,
      events,
      money,
      observations: [],
      text: lines,
      related: [],
      adult_result: { alive: { ...alive }, parents: stepResults, child: clone(childOutcome) },
    });
    if (!alive.A && !alive.B) break;
  }
  const story = PEOPLE.map(
    (parentId) => `親${parentId}：幸福${results[parentId].happiness}／${results[parentId].label}。`,
  );
  const routes = {
    specialist:
      domain === "study" ? contentFor(state).text.adult_062 : contentFor(state).text.adult_063,
    explorer: contentFor(state).text.adult_064,
    supported: contentFor(state).text.adult_065,
  };
  story.push(
    `子どもは${routes[route]}へ。社会的成果${success}。`,
    career.residence === "far"
      ? contentFor(state).text.adult_066
      : contentFor(state).text.adult_067,
    `子どもの幸福${childOutcome.happiness}／主体性${childOutcome.autonomy}。`,
  );
  for (const parentId of PEOPLE) {
    if (state.repaired && child.trust[parentId] >= 60)
      story.push(`親${parentId}：関係を修復したあとの会話が続いた。`);
    if (success >= 70 && child.trust[parentId] < 40)
      story.push(`親${parentId}：成果は大きかったが、会話は少なかった。`);
    if (career.residence === "far" && child.trust[parentId] >= 60)
      story.push(`親${parentId}：距離があっても連絡が続いた。`);
    if (state.parents[parentId].social >= 60)
      story.push(`親${parentId}：家族以外とのつながりも支えになった。`);
  }
  if (state.oddity_count > 0) story.push(contentFor(state).text.adult_068);
  for (const parentId of PEOPLE)
    story.push(`親${parentId}の最期は${results[parentId].death_age}歳。`);
  state.result = {
    parents: results,
    child: childOutcome,
    ending: ending(state, childOutcome),
    story,
  };
}
