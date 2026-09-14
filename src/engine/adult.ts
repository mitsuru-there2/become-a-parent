import type { State, ChildResult, ParentResult, Person, Result, History, Money } from "./types";
import { c, div, clone, PEOPLE } from "./shared";
type Career = Omit<ChildResult, "age" | "happiness" | "autonomy">;
function childResult(s: State, age: number, career: Career): ChildResult {
  const ch = s.child;
  return {
    ...career,
    age,
    happiness: c(
      div(100 - ch.stress + ch.autonomy + Math.max(ch.interest.study, ch.interest.craft), 3),
    ),
    autonomy: ch.autonomy,
  };
}
function parentResult(
  s: State,
  p: Person,
  money: number,
  spouseAlive: boolean,
  child: ChildResult,
): ParentResult {
  const v = s.parents[p];
  const axes = {
    relationship: div(
      2 * s.child.trust[p] + v.social + (spouseAlive ? s.couple : 0),
      spouseAlive ? 4 : 3,
    ),
    security: div(Math.min(100, div(money, 5)) + v.health, 2),
    fulfillment: v.fulfillment,
    child_assurance: div(child.happiness + child.social_success, 2),
    regret: v.regret,
  };
  const happiness = div(
    25 * axes.relationship +
      25 * axes.security +
      25 * axes.fulfillment +
      15 * axes.child_assurance +
      10 * (100 - axes.regret),
    100,
  );
  return {
    death_age: div(v.age_months, 12),
    happiness,
    axes,
    cash: money,
    health: v.health,
    label:
      happiness >= 75
        ? "満ち足りた振り返り"
        : happiness >= 45
          ? "喜びと心残りのある振り返り"
          : "心残りの大きい振り返り",
  };
}
export function ending(s: State, child: ChildResult): Result["ending"] {
  const trust = div(s.child.trust.A + s.child.trust.B, 2),
    fulfillment = div(s.parents.A.fulfillment + s.parents.B.fulfillment, 2),
    social = div(s.parents.A.social + s.parents.B.social, 2);
  let id = "EN-05",
    title = "小さな靴、大きな予定",
    text =
      "靴箱を片づけると、小さな靴が出てきた。予定通りのことも、そうでないこともあった。家族の歩みは、この一足には収まりきらない。";
  if (child.social_success >= 70 && trust < 40) {
    id = "EN-01";
    title = "立派な額縁、静かな食卓";
    text =
      "壁には立派な額縁が並んだ。食卓には、聞きそびれた話が残った。大きな成果と、親子それぞれの実感を振り返る。";
  } else if (s.repaired && trust >= 60) {
    id = "EN-02";
    title = "「あのとき、ごめん」の続き";
    text =
      "昔の言い争いを話せる日が来た。謝罪の名文句は忘れたが、そのあとに続いた会話は覚えている。";
  } else if (fulfillment >= 70 && social >= 50) {
    id = "EN-03";
    title = "それぞれの予定表";
    text =
      "親の予定表にも、子どもの予定表にも、別々の用事がある。家族の予定を合わせる係は、最後までなかなか忙しかった。";
  } else if (child.residence === "far" && trust >= 60) {
    id = "EN-04";
    title = "遠くの街から、いつもの声";
    text =
      "遠くの街から電話が鳴る。最初の話題はいつも天気。大事な話は、だいたいそのあとにやってきた。";
  }
  return { version: "ending-1", id, title, text };
}
export function finish(
  s: State,
  draw: (s: State, phase: string, index: number, slot: string) => number,
) {
  const ch = s.child,
    domain = ch.interest.craft > ch.interest.study ? "craft" : "study";
  const route =
    ch.ability[domain] >= 60 ? "specialist" : ch.autonomy >= 50 ? "explorer" : "supported";
  const r = draw(s, "adult", 0, "career"),
    success = c(div(ch.ability[domain] + ch.autonomy, 2) + (r < 20 ? -10 : r >= 80 ? 10 : 0));
  const distance = draw(s, "adult", 0, "distance");
  const career: Career = {
    domain,
    route,
    social_success: success,
    residence: distance < (success >= 60 ? 60 : 30) ? "far" : "near",
  };
  const accounts = { A: div(s.cash + 1, 2), B: div(s.cash, 2) },
    alive = { A: true, B: true };
  const results = {} as Record<Person, ParentResult>;
  let child = childResult(s, 20, career);
  for (let k = 1; k <= 8; k++) {
    const old = clone({ parents: s.parents, child: s.child }),
      wasAlive = { ...alive };
    const money: Money[] = [],
      lines: string[] = [],
      events: History["events"] = [];
    const event = (id: string, p: string, text: string) =>
      events.push({
        instance_id: `a${String(k).padStart(2, "0")}:${id}:${p}`,
        event_id: id,
        option_id: null,
        text,
      });
    for (const p of PEOPLE) {
      if (!alive[p]) continue;
      const before = accounts[p],
        income =
          5 *
          (k <= 3
            ? { reduced: 90, normal: 130, heavy: 180 }[s.previous_plan.parents[p].work] * 2
            : 200),
        wanted = 5 * (k <= 3 ? 240 : 220),
        shortfall = before + income < wanted,
        expense = Math.min(wanted, before + income),
        overflow = Math.max(0, before + income - expense - 99999);
      accounts[p] = before + income - expense - overflow;
      money.push({ scope: p, before, income, expense, cap_overflow: overflow, after: accounts[p] });
      if (shortfall) lines.push(`親${p}：暮らしを${wanted - expense}万円縮小して調整した。`);
      if (overflow) lines.push(`親${p}：保有上限による計上外${overflow}万円。`);
      const v = old.parents[p],
        t = old.child.trust[p];
      Object.assign(s.parents[p], {
        stress: c(v.stress - 8 + 4 * Number(shortfall)),
        health: Math.max(
          0,
          v.health - (k <= 3 ? 5 : 10) - 3 * Number(v.stress >= 60) - 2 * Number(shortfall),
        ),
        fulfillment: c(v.fulfillment + (v.social >= 50 ? 3 : -3) - 3 * Number(v.health < 30)),
        social: c(v.social - 2),
        regret: c(
          v.regret + Number(t < 30 || v.fulfillment < 25) - Number(t >= 60 && v.fulfillment >= 50),
        ),
        age_months: (50 + 5 * k) * 12,
      });
      ch.trust[p] = c(t + (t >= 50 ? 2 : -1));
    }
    ch.stress = c(old.child.stress - 5 + 5 * Number(success < 40));
    ch.autonomy = c(old.child.autonomy + Number(route !== "supported"));
    for (const p of PEOPLE) {
      if (!alive[p]) continue;
      if (k === 1) {
        if (ch.trust[p] >= 50) s.parents[p].fulfillment = c(s.parents[p].fulfillment + 2);
        event(
          "A-01",
          p,
          `親${p}：${ch.trust[p] >= 50 ? "近況の連絡が届いた。" : "連絡は用件が中心だった。"}`,
        );
      }
      if (k === 3) {
        if (s.parents[p].social >= 50) s.parents[p].fulfillment = c(s.parents[p].fulfillment + 3);
        event(
          "A-02",
          p,
          `親${p}：${s.parents[p].social >= 50 ? "退職後にも会う人と予定がある。" : "仕事の外の過ごし方を探し始めた。"}`,
        );
      }
      if (k >= 4 && draw(s, "adult", k, `health-${p}`) < 20) {
        s.parents[p].health = Math.max(0, s.parents[p].health - 5);
        event("A-03", p, `親${p}：体調を崩し、しばらく休んだ。`);
      }
      if (k === 5 && s.repaired && ch.trust[p] >= 60) {
        s.parents[p].regret = c(s.parents[p].regret - 3);
        event("A-04", p, `親${p}：昔の言い争いを、今は一緒に振り返れた。`);
      }
    }
    if (k === 6 && s.oddity_count > 0) event("A-05", "family", "妙な作品が、まだ家に残っている。");
    child = childResult(s, 20 + 5 * k, career);
    const deaths = PEOPLE.filter(
      (p) => alive[p] && (k === 8 || (k >= 3 && s.parents[p].health === 0)),
    );
    const thisResults: Record<Person, ParentResult | null> = { A: null, B: null };
    for (const p of deaths) {
      const result = parentResult(s, p, accounts[p], wasAlive[p === "A" ? "B" : "A"], child);
      results[p] = result;
      thisResults[p] = clone(result);
      alive[p] = false;
      const a = result.axes;
      lines.push(
        `親${p}は${result.death_age}歳で最期を迎えた。幸福${result.happiness}。関係${a.relationship}／安心${a.security}／充実${a.fulfillment}／子への安心${a.child_assurance}／後悔${a.regret}。`,
      );
    }
    if (deaths.length === 1) {
      const survivor = deaths[0] === "A" ? "B" : "A";
      if (alive[survivor]) {
        s.parents[survivor].stress = c(s.parents[survivor].stress + 10);
        lines.push(`親${survivor}は伴侶を見送った。残る日々をたどる。`);
      }
    }
    events.sort((a, b) => (a.instance_id < b.instance_id ? -1 : 1));
    lines.push(
      ...events.map((e) => e.text),
      `子ども${child.age}歳：幸福${child.happiness}、主体性${child.autonomy}。`,
    );
    s.history.push({
      index: s.history.length,
      kind: "adult",
      turn: null,
      adult_step: k,
      ages: {
        child_months: child.age * 12,
        A_months: s.parents.A.age_months,
        B_months: s.parents.B.age_months,
      },
      actions: null,
      events,
      money,
      observations: [],
      text: lines,
      related: [],
      adult_result: { alive: { ...alive }, parents: thisResults, child: clone(child) },
    });
    if (!alive.A && !alive.B) break;
  }
  const story = PEOPLE.map((p) => `親${p}：幸福${results[p].happiness}／${results[p].label}。`);
  const routes = {
    specialist: domain === "study" ? "学びを生かす専門の道" : "作ることを仕事にする道",
    explorer: "試しながら自分の道を探す",
    supported: "相談しながら足場を作る",
  };
  story.push(
    `子どもは${routes[route]}へ。社会的成果${success}。`,
    career.residence === "far" ? "遠方で暮らす。" : "近くで暮らす。",
    `子どもの幸福${child.happiness}／主体性${child.autonomy}。`,
  );
  for (const p of PEOPLE) {
    if (s.repaired && ch.trust[p] >= 60) story.push(`親${p}：関係を修復したあとの会話が続いた。`);
    if (success >= 70 && ch.trust[p] < 40)
      story.push(`親${p}：成果は大きかったが、会話は少なかった。`);
    if (career.residence === "far" && ch.trust[p] >= 60)
      story.push(`親${p}：距離があっても連絡が続いた。`);
    if (s.parents[p].social >= 60) story.push(`親${p}：家族以外とのつながりも支えになった。`);
  }
  if (s.oddity_count > 0) story.push("回覧板を飾った作品は、家族の思い出になった。");
  for (const p of PEOPLE) story.push(`親${p}の最期は${results[p].death_age}歳。`);
  s.result = { parents: results, child, ending: ending(s, child), story };
}
