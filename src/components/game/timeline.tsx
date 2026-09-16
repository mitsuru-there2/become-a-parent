import type { History } from "../../engine/types";
import { PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";

export function Timeline({ items }: { items: History[] }) {
  return (
    <section className="timeline">
      <span className="eyebrow">FAMILY ARCHIVE</span>
      <h1>家族の記録</h1>
      {!items.length && <p>最初の半年を終えると、ここに記録が残ります。</p>}
      {items.map((entry) => (
        <article key={entry.index}>
          <div className="date">
            {Math.floor(entry.ages.child_months / 12)}歳
            {entry.ages.child_months % 12 ? "6か月" : ""}
            <small>
              {entry.kind === "adult"
                ? "成人後の節目"
                : `第${entry.turn}期${entry.kind === "special" ? "・特殊イベント" : ""}`}
            </small>
          </div>
          <div>
            {entry.events.map((event) => (
              <p key={event.instance_id}>{event.text}</p>
            ))}
            {entry.text.map((text, index) => (
              <p key={index} className="muted">
                {text}
              </p>
            ))}
            {entry.money.map((transaction, index) => (
              <p className="ledger" key={`${transaction.scope}-${index}`}>
                {transaction.scope === "household" ? "家計" : labels[transaction.scope]}：
                {transaction.before} ＋ {transaction.income} − {transaction.expense}
                {transaction.cap_overflow
                  ? ` − 保有上限を超えた分 ${transaction.cap_overflow}`
                  : ""}{" "}
                ＝ {transaction.after}万円
              </p>
            ))}
            {entry.observations.length > 0 && (
              <details>
                <summary>この頃のようすと方針</summary>
                {entry.observations.map((observation) => (
                  <p key={observation.code}>{observation.text}</p>
                ))}
                {entry.actions &&
                  PEOPLE.map((parentId) => (
                    <p key={parentId}>
                      {labels[parentId]}：
                      {Object.entries(entry.actions!.plan.parents[parentId])
                        .map(([axis, score]) => `${labels[axis]} ${labels[String(score)] ?? score}`)
                        .join(" ／ ")}
                    </p>
                  ))}
              </details>
            )}
            {entry.related.length > 0 && (
              <p className="fine">以前の選択とのつながり：{entry.related.join("、")}</p>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
