import { existsSync } from "node:fs";
import { catalog } from "../src/content/catalog";
import judgments from "../config/decisions.json";

// 本編の件数契約を検査し、追加パックの自由な拡張とは分ける。
const baseJudgments = judgments.decisions;
if (baseJudgments.length !== 850 || new Set(baseJudgments.map((n) => n.title)).size !== 850)
  throw new Error("本編は名称の異なる850判断が必要です");
for (const group of judgments.route_groups)
  for (const route of group.routes)
    for (let stage = 0; stage < 5; stage++) {
      const nodes = baseJudgments.filter(
        (node) =>
          node.menu === group.menu &&
          node.stages.length === 1 &&
          node.stages[0] === stage &&
          node.options.length === 1 &&
          node.options[0].routes.length === 1 &&
          node.options[0].routes[0] === route.id,
      );
      if (nodes.length !== 10)
        throw new Error(`${group.menu}/${route.id}/${stage}: 固有の10判断が必要です`);
    }
const listing = catalog.list();
for (const ids of [[], listing.packs.map((p) => p.id)]) {
  const content = catalog.resolve("normal", ids).content;
  for (const [id, visual] of Object.entries(content.visuals)) {
    const path =
      visual.src === "/assets/marketing/hero.png" ? "." + visual.src : "public" + visual.src;
    if (!existsSync(path)) throw new Error(`画像がありません: ${id} → ${path}`);
  }
}
console.log(
  JSON.stringify({
    ok: true,
    difficulties: listing.difficulties.length,
    packs: listing.packs.length,
  }),
);
