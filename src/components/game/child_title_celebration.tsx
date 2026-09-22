import { useState } from "react";

export function ChildTitleCelebration({
  runId,
  revision,
  titles,
}: {
  runId: string | null;
  revision: number | null;
  titles: { id: string; label: string }[];
}) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const key = `${runId}:${revision}:${titles.map((title) => title.id).join(",")}`;
  if (!titles.length || dismissedKey === key) return null;
  return (
    <aside className="child-award-celebration" role="status" aria-live="polite">
      <span className="child-award-symbol" aria-hidden="true">
        ✦
      </span>
      <div>
        <small>新しい称号を獲得！</small>
        <strong>{titles.map((title) => title.label).join("・")}</strong>
      </div>
      <button aria-label="称号のお祝いを閉じる" onClick={() => setDismissedKey(key)}>
        ×
      </button>
    </aside>
  );
}
