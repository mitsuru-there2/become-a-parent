// scripts/generate-packs.tsで自動生成。config/packs/<id>/の3つのJSONを編集してください。
import manifest0 from "../../config/packs/community-life/manifest.json";
import events0 from "../../config/packs/community-life/events.json";
import decisions0 from "../../config/packs/community-life/decisions.json";
export default [
  {
    ...manifest0,
    automatic_events: events0,
    decisions: decisions0,
  },
];
