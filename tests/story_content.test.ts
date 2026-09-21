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

describe("850判断の物語と期限", () => {
  it("幼児期の宝箱だけが最後のステージで開封を解放する", () => {
    for (const keepsake of [true, false]) {
      const s = startStage();
      chooseStage(s, "crossroad-home", "memory");
      satisfyStage(s);
      if (keepsake) chooseStage(s, "home-memory-0-01", "take");
      until(s, 32);
      expect(stageOption(s, "home-memory-4-03", "take").available).toBe(keepsake);
      if (keepsake) chooseStage(s, "home-memory-4-03", "take");
      until(s, 40);
      expect(s.phase).toBe("finished");
    }
  });
  it("音楽教室のイベントは期間内だけ発生し、次のステージは独自の大会を選べる", () => {
    const s = startStage();
    until(s, 8);
    chooseStage(s, "crossroad-afterschool", "music");
    chooseStage(s, "afterschool-music-1-01", "take");
    chooseStage(s, "afterschool-music-1-04", "take");
    advance(s);
    const event = clone(
      defaultContent.automatic_events!.find((e) => e.id === "story-amp-trouble")!,
    );
    event.probability = 100;
    s.settings!.content.automatic_events = [event];
    expect(applyAutomaticEvents(s)?.events[0].event_id).toBe(event.id);
    s.settings!.content.automatic_events = [];
    until(s, 16);
    s.settings!.content.automatic_events = [event];
    expect(applyAutomaticEvents(s)).toBeNull();
    expect(stageOption(s, "afterschool-music-2-01", "take").available).toBe(true);
    chooseStage(s, "afterschool-music-2-01", "take");
    expect(stageOption(s, "afterschool-music-1-04", "take").available).toBe(false);
  });
  it("起業は大幅な収入と負担を生み、次の岐路で収支と専用イベントが終了する", () => {
    const s = startStage();
    until(s, 8);
    chooseStage(s, "crossroad-work", "venture");
    chooseStage(s, "work-venture-1-01", "take");
    const cash = s.cash;
    chooseStage(s, "work-venture-1-04", "take");
    expect(s.cash).toBe(cash - 65);
    const forecast = publicView(s).public.forecast!;
    expect(forecast.income).toBe(460);
    advance(s);
    expect(s.cash).toBe(forecast.projected_cash);
    // 継続負担を家族の回復で受け止めて境界まで進める。
    chooseStage(s, "home-daily-1-01", "take");
    chooseStage(s, "home-daily-1-04", "take");
    until(s, 16);
    expect(publicView(s).public.forecast!.income).toBe(280);
    const event = clone(defaultContent.automatic_events!.find((e) => e.id === "story-big-order")!);
    event.probability = 100;
    s.settings!.content.automatic_events = [event];
    expect(applyAutomaticEvents(s)).toBeNull();
  });
  it("DLCは本編850判断へ追加し、工作の履歴から取得できる", () => {
    const s = startDecisions("home-01", 0, new Catalog().resolve("normal", ["community-life"]));
    until(s, 8);
    chooseStage(s, "afterschool-maker-1-01", "take");
    expect(stageOption(s, "community-life-workshop", "join").available).toBe(true);
    chooseStage(s, "community-life-workshop", "join");
    expect(s.life!.history["community-life-workshop:join"].count).toBe(1);
    expect(stageOption(s, "community-life-workshop", "join").available).toBe(false);
  });
});
