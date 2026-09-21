import lifeGame from "../../config/decisions.json";
import legacyDecisions from "../../config/legacy-decisions.json";
import directoryPacks from "./packs.gen";
import automaticEvents from "../../config/events.json";
import base from "../../config/base.json";
import legacy from "../../config/legacy-data-1.json";
import bundledPacks from "../../config/packs.json";
import type { Content, ContentPack, Settings } from "./types";
import type { State } from "../engine/types";
import { clone, hash, canonical } from "../engine/shared";
import { ContentError, validateContent, validatePack } from "./validation";
export class Catalog {
  private base: Content;
  private packs: ContentPack[];
  constructor(
    data: unknown = {
      ...base,
      decision_game: legacyDecisions,
      life_game: lifeGame,
      automatic_events: automaticEvents,
    },
    packs: unknown = (data as Content).life_game
      ? [...bundledPacks, ...directoryPacks]
      : bundledPacks,
  ) {
    validateContent(data);
    if (!Array.isArray(packs)) throw new ContentError("追加パックは配列で指定してください");
    packs.forEach(validatePack);
    if (new Set(packs.map((p) => p.id)).size !== packs.length)
      throw new ContentError("パックIDが重複しています");
    this.base = clone(data);
    this.packs = clone(packs);
    // 未選択のパックも、依存・参照を含めて起動時に検査する。
    for (const p of this.packs) this.resolve("normal", this.dependencies(p.id));
  }
  private dependencies(id: string, visiting = new Set<string>()): string[] {
    if (visiting.has(id)) throw new ContentError("パックの依存が循環しています");
    const pack = this.packs.find((p) => p.id === id);
    if (!pack) throw new ContentError(`依存パックがありません: ${id}`);
    const next = new Set(visiting).add(id);
    return [...new Set([id, ...pack.dependencies.flatMap((dep) => this.dependencies(dep, next))])];
  }
  list() {
    return {
      scenarios: this.base.scenarios.map(({ id, label, description }) => ({
        id,
        label,
        description,
      })),
      difficulties: Object.entries(this.base.difficulties).map(([id, d]) => ({
        id,
        label: d.label,
        description: d.description,
      })),
      packs: this.packs.map((p) => ({
        id: p.id,
        version: p.version,
        label: p.label,
        dependencies: p.dependencies,
        scenarios: p.scenarios.map(({ id, label, description }) => ({ id, label, description })),
      })),
    };
  }
  resolve(difficulty: unknown = "normal", packIds: unknown = []): Settings {
    if (typeof difficulty !== "string" || !["easy", "normal", "hard"].includes(difficulty))
      throw new ContentError("難易度はeasy / normal / hardです");
    if (
      !Array.isArray(packIds) ||
      !packIds.every((id) => typeof id === "string") ||
      new Set(packIds).size !== packIds.length
    )
      throw new ContentError("packsは重複のないID配列です");
    const content = clone(this.base);
    const selected = [...packIds].sort().map((id) => {
      const pack = this.packs.find((p) => p.id === id);
      if (!pack) throw new ContentError(`不明なパック: ${id}`);
      if (
        content.life_game &&
        (Object.keys(pack.events).length || Object.keys(pack.selections).length)
      )
        throw new ContentError(`旧形式の行動・イベントは新方式へ移してください: ${id}`);
      if (pack.requires_data !== content.data_version)
        throw new ContentError(`パックのデータ版が一致しません: ${id}`);
      if (pack.dependencies.some((d) => !packIds.includes(d)))
        throw new ContentError(`依存パックを選んでください: ${id}`);
      for (const field of ["events", "selections", "visuals"] as const) {
        for (const key of Object.keys(pack[field]))
          if (Object.hasOwn(content[field], key))
            throw new ContentError(`IDが衝突しています: ${field}.${key}`);
        Object.assign(content[field], clone(pack[field]));
      }
      if (pack.automatic_events?.length) {
        content.automatic_events ??= [];
        for (const event of pack.automatic_events) {
          if (content.automatic_events.some((existing) => existing.id === event.id))
            throw new ContentError(`IDが衝突しています: automatic_events.${event.id}`);
          content.automatic_events.push(clone(event));
        }
      }
      if (pack.decisions?.length) {
        if (!content.life_game) throw new ContentError(`生活メニュー非対応の本編です: ${id}`);
        for (const decision of pack.decisions) {
          if (content.life_game.decisions.some((existing) => existing.id === decision.id))
            throw new ContentError(`IDが衝突しています: decisions.${decision.id}`);
          content.life_game.decisions.push(clone(decision));
        }
      }
      content.scenarios.push(...clone(pack.scenarios));
      return { id: pack.id, version: pack.version, label: pack.label };
    });
    validateContent(content);
    const data = {
      difficulty: difficulty as Settings["difficulty"],
      max_automatic_events: 3 as const,
      packs: selected,
      content,
    };
    return { ...data, fingerprint: hash(canonical(data)) };
  }
}
export const catalog = new Catalog();
const currentData: unknown = {
  ...base,
  decision_game: legacyDecisions,
  life_game: lifeGame,
  automatic_events: automaticEvents,
};
const legacyData: unknown = legacy;
validateContent(currentData);
validateContent(legacyData);
export const defaultContent: Content = currentData;
export const contentFor = (state: State): Content =>
  state.settings?.content ?? (legacyData as Content);
export const difficultyFor = (state: State) =>
  contentFor(state).difficulties[state.settings?.difficulty ?? "normal"];
