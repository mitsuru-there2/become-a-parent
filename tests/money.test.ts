import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog } from "../src/content/catalog";
import { startDecisions, chooseDecision } from "../src/engine/decisions";
import { advance, publicView } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";
import type { State } from "../src/engine/types";
import { Service, replayRun, exportRun, importRun } from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import base from "./fixtures/legacy_content";

const start = (seed = 0) => startDecisions("home-01", seed, new Catalog(base).resolve());
function choose(state: State, index: number, suffix?: string) {
  const theme = publicView(state).choices[index];
  const option = suffix
    ? theme.options.find((o) => o.option_id.endsWith(`:${suffix}`))!
    : theme.options[0];
  chooseDecision(state, theme.instance_id, option.option_id);
}
function chooseAll(state: State, last: string) {
  choose(state, 0);
  choose(state, 1);
  choose(state, 2, last);
}
const incomeSeed = () => {
  for (let seed = 0; seed < 100; seed++) {
    if (publicView(start(seed)).choices[0].options.some((o) => o.income > 0)) return seed;
  }
  throw new Error("収入イベントのシードがありません");
};

describe("S-016 家計の大きな選択差", () => {
  it("家事支援と追加の仕事で同じ期に72万円の差が出て、予測と確定が一致する", () => {
    const spend = start();
    choose(spend, 0);
    const earn = clone(spend);
    const cash = spend.cash;
    chooseAll(spend, "support");
    chooseAll(earn, "work-father");
    const spendForecast = publicView(spend).public.forecast!;
    const earnForecast = publicView(earn).public.forecast!;
    expect(earnForecast.income).toBe(300);
    expect(earnForecast.projected_cash - spendForecast.projected_cash).toBe(72);
    expect(earn.cash).toBe(cash);
    choose(earn, 2, "talk");
    expect(publicView(earn).public.forecast!.income).toBe(260);
    choose(earn, 2, "work-father");
    advance(spend);
    advance(earn);
    expect(spend.cash).toBe(spendForecast.projected_cash);
    expect(earn.cash).toBe(earnForecast.projected_cash);
    expect(earn.cash - spend.cash).toBe(72);
    expect(earn.parents.A.stress).toBeGreaterThan(spend.parents.A.stress);
    expect(earn.history.at(-1)!.text.join("\n")).toContain(`資金 ${cash}→${earn.cash}万円`);
  });

  it("資金不足の回答は拒否し、追加収入に選び直すと確定できる", () => {
    const state = start();
    choose(state, 0);
    state.cash = 0;
    state.decisions!.themes[0].options[0].cost = 70;
    chooseAll(state, "talk");
    const before = clone(state);
    expect(publicView(state).public.forecast!.can_advance).toBe(false);
    expect(() => advance(state)).toThrow();
    expect(state).toEqual(before);
    choose(state, 2, "work-mother");
    const forecast = publicView(state).public.forecast!;
    expect(forecast.can_advance).toBe(true);
    advance(state);
    expect(state.cash).toBe(forecast.projected_cash);
  });

  it("臨時収入は即時入金し、保有上限の超過額も記録する", () => {
    const state = start(incomeSeed());
    state.cash = 99990;
    const event = publicView(state).choices[0];
    const option = event.options.find((o) => o.income > 0)!;
    chooseDecision(state, event.instance_id, option.option_id);
    expect(state.cash).toBe(99999);
    const money = state.history.at(-1)!.money[0];
    expect(money.income).toBe(option.income);
    expect(money.cap_overflow).toBe(option.income - 9);
    expect(money.before + money.income - money.expense - money.cap_overflow).toBe(money.after);
    const monthly = start();
    choose(monthly, 0);
    monthly.cash = 99990;
    chooseAll(monthly, "work-father");
    expect(publicView(monthly).public.forecast!.projected_cash).toBe(99999);
    advance(monthly);
    expect(monthly.cash).toBe(99999);
    const settled = monthly.history.at(-1)!.money[0];
    expect(settled.before + settled.income - settled.expense - settled.cap_overflow).toBe(
      settled.after,
    );
  });

  it("新収入の再送・回答途中の再開・確定後の再生で二重入金しない", async () => {
    const repo = new IndexedRepository(new GameDatabase(`money-${crypto.randomUUID()}`));
    const service = new Service(repo, new Catalog(base));
    try {
      let r = await service.execute({
        command: "new",
        run: "money",
        scenario: "home-01",
        seed: incomeSeed(),
        request_id: "new",
      });
      const cash = r.public!.cash!;
      const event = r.choices[0];
      const option = event.options.find((o) => o.income > 0)!;
      const request = {
        command: "choose" as const,
        run: "money",
        revision: r.revision!,
        request_id: "income",
        input: { event_instance: event.instance_id, option_id: option.option_id },
      };
      r = await service.execute(request);
      expect(r.ok).toBe(true);
      expect(r.public!.cash).toBe(cash + option.income);
      expect((await service.execute(request)).public).toEqual(r.public);
      const savedEvent = (await repo.read("money"))!;
      expect(importRun(exportRun(savedEvent))).toEqual(savedEvent);
      expect(replayRun(savedEvent)).toEqual(savedEvent.state);
      const themes = r.choices;
      for (const [index, theme] of themes.entries()) {
        const selected =
          index === 2
            ? theme.options.find((o) => o.option_id.endsWith(":work-father"))!
            : theme.options[0];
        r = await service.execute({
          command: "choose",
          run: "money",
          revision: r.revision!,
          request_id: `choice-${index}`,
          input: { event_instance: theme.instance_id, option_id: selected.option_id },
        });
        expect(r.ok).toBe(true);
      }
      expect(r.public!.cash).toBe(cash + option.income);
      const saved = (await repo.read("money"))!;
      expect(importRun(exportRun(saved))).toEqual(saved);
      expect(
        (await new Service(repo, new Catalog(base)).execute({ command: "observe", run: "money" }))
          .public,
      ).toEqual(r.public);
      const forecast = r.public!.forecast!;
      const commit = {
        command: "advance" as const,
        run: "money",
        revision: r.revision!,
        request_id: "advance",
      };
      r = await service.execute(commit);
      expect(r.ok).toBe(true);
      expect(r.public!.cash).toBe(forecast.projected_cash);
      expect((await service.execute(commit)).public).toEqual(r.public);
      const finished = (await repo.read("money"))!;
      expect(replayRun(finished)).toEqual(finished.state);
    } finally {
      repo.db.close();
    }
  });

  it("入金額は負数や小数を受け付けず、未指定の旧設定も読み込める", () => {
    for (const value of [-1, 0.5]) {
      const content = clone(base);
      Object.assign(content.decision_game.events[0].options[0], { income: value });
      expect(() => new Catalog(content)).toThrow();
    }
    expect(start().versions.save).toBe("save-6");
  });
});
