import { existsSync } from "node:fs";
import { catalog } from "../src/content/catalog";
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
