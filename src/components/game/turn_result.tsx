import type { LifeState } from "../../engine/types";
import { StatusDetail } from "./status_detail";

const labels: Record<string, string> = {
  "child.study": "学びの力",
  "child.craft": "創作の力",
  "parent.A.health": "健康",
  "parent.A.stress": "ストレス",
  "parent.A.fatigue": "疲労",
  "parent.B.health": "健康",
  "parent.B.stress": "ストレス",
  "parent.B.fatigue": "疲労",
  couple: "夫婦の関係",
  "grandparents.relation": "関係",
};

export function TurnResult({
  result,
  onClose,
}: {
  result: NonNullable<LifeState["turn_result"]>;
  onClose: () => void;
}) {
  const groups = [
    { title: "子ども", keys: ["child.study", "child.craft"] },
    { title: "父", keys: ["parent.A.health", "parent.A.stress", "parent.A.fatigue"] },
    { title: "母", keys: ["parent.B.health", "parent.B.stress", "parent.B.fatigue"] },
    { title: "家族・実家", keys: ["couple", "grandparents.relation"] },
  ];
  const money = result.after.cash - result.before.cash;
  return (
    <StatusDetail title={`第${result.turn}期の結果`} onClose={onClose}>
      <div className="turn-result-money">
        <span>資金</span>
        <strong>
          {result.before.cash} → {result.after.cash}万円
        </strong>
        <em data-negative={money < 0 || undefined}>
          {money >= 0 ? "+" : ""}
          {money}万円
        </em>
      </div>
      <p className="turn-result-caption">今期の判断と普段の暮らしを反映しました。</p>
      <div className="turn-result-groups">
        {groups.map((group) => {
          const changed = group.keys.filter((key) => result.before[key] !== result.after[key]);
          if (!changed.length) return null;
          return (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {changed.map((key) => {
                const before = result.before[key];
                const after = result.after[key];
                const delta = after - before;
                const burden = key.endsWith("stress") || key.endsWith("fatigue");
                return (
                  <div className="turn-result-stat" key={key}>
                    <span>{labels[key]}</span>
                    <div className="turn-result-track" aria-hidden="true">
                      <i style={{ width: `${Math.max(0, Math.min(100, before))}%` }} />
                      <b style={{ width: `${Math.max(0, Math.min(100, after))}%` }} />
                    </div>
                    <strong>
                      {before} → {after}
                    </strong>
                    <em data-negative={(burden ? delta > 0 : delta < 0) || undefined}>
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </em>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {result.after.cash < 0 && (
        <p className="warning">資金がマイナスです。次の期末までに回復してください。</p>
      )}
    </StatusDetail>
  );
}
