import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { clone } from "../src/engine/shared";
import { startDecisions } from "../src/engine/decisions";
import { advance, publicView } from "../src/engine/simulation";
import { applyAutomaticEvents } from "../src/engine/automatic_events";
import {
  startStage,
  chooseStage,
  satisfyStage,
  until,
  stageOption,
} from "./fixtures/stage_helpers";

describe("ステージ内取得と世代をまたぐ物語", () => {
  it("幼児期の取得履歴を最終ステージの異なる思い出へ接続する", () => {
    for (const [keepsake, reunion, other] of [
      ["capsule", "open", "screen"],
      ["album", "screen", "open"],
    ]) {
      const s = startStage();
      chooseStage(s, "crossroad-home", "memory");
      satisfyStage(s);
      chooseStage(s, "story-keepsake", keepsake);
      expect(stageOption(s, "story-keepsake", keepsake).available).toBe(false);
      until(s, 32);
      satisfyStage(s);
      expect(stageOption(s, "story-reunion", reunion).available).toBe(true);
      expect(stageOption(s, "story-reunion", other).available).toBe(false);
      chooseStage(s, "story-reunion", reunion);
      until(s, 40);
      expect(s.phase).toBe("finished");
    }
  });
  it("同一期に音楽を始め、ステージ終了で専用イベントを止めても後年の大会は履歴から選べる", () => {
    const s = startStage();
    until(s, 8);
    chooseStage(s, "crossroad-afterschool", "music");
    satisfyStage(s);
    chooseStage(s, "story-music-trial", "try");
    expect(stageOption(s, "story-music", "stage").available).toBe(true);
    chooseStage(s, "story-music", "stage");
    advance(s);
    const event = clone(
      defaultContent.automatic_events!.find((e) => e.id === "story-amp-trouble")!,
    );
    event.probability = 100;
    s.settings!.content.automatic_events = [event];
    expect(applyAutomaticEvents(s)?.events[0].event_id).toBe(event.id);
    s.settings!.content.automatic_events = [];
    until(s, 16);
    satisfyStage(s);
    s.settings!.content.automatic_events = [event];
    expect(applyAutomaticEvents(s)).toBeNull();
    expect(stageOption(s, "story-festival", "national").available).toBe(true);
    chooseStage(s, "story-festival", "national");
    expect(stageOption(s, "story-music", "stage").available).toBe(false);
  });
  it("起業の即時費用・継続収支が一致し、次の岐路で継続収支と専用イベントを終了", () => {
    const s = startStage();
    until(s, 8);
    chooseStage(s, "crossroad-work", "venture");
    satisfyStage(s);
    chooseStage(s, "story-market", "sell");
    chooseStage(s, "base-work-consult", "talk");
    const cash = s.cash;
    chooseStage(s, "story-venture", "launch");
    expect(s.cash).toBe(cash - 100);
    const forecast = publicView(s).public.forecast!;
    expect(forecast.income).toBe(355);
    advance(s);
    expect(s.cash).toBe(forecast.projected_cash);
    until(s, 16);
    expect(publicView(s).public.forecast!.income).toBe(280);
    const event = clone(defaultContent.automatic_events!.find((e) => e.id === "story-big-order")!);
    event.probability = 100;
    s.settings!.content.automatic_events = [event];
    expect(applyAutomaticEvents(s)).toBeNull();
  });
  it("現行DLCもルート条件と一度限りの即時取得・永久補正を共有する", () => {
    const s = startDecisions("home-01", 0, new Catalog().resolve("normal", ["community-life"]));
    until(s, 8);
    satisfyStage(s);
    chooseStage(s, "base-craft-trial", "try");
    expect(stageOption(s, "community-life-workshop", "join").available).toBe(true);
    chooseStage(s, "community-life-workshop", "join");
    expect(s.life!.history["community-life-workshop:join"].count).toBe(1);
    expect(stageOption(s, "community-life-workshop", "join").available).toBe(false);
  });
});
