import { useState } from "react";
import type { PublicState } from "../../engine/types";
import { StatusDetail } from "./status_detail";

const groups = [
  { label: "疲れ", codes: ["energy"] },
  { label: "父との関係", codes: ["relationship.A"] },
  { label: "母との関係", codes: ["relationship.B"] },
  { label: "興味", codes: ["interest.study", "interest.craft"] },
];

export function ChildStatus({ state }: { state: PublicState }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="child-status" aria-label="子どもの様子">
      <div className="child-status-heading">
        子どもの様子 <span>タップで詳しく</span>
      </div>
      <div className="child-status-grid">
        {groups.map(({ label, codes }) => (
          <button key={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <span>{label}</span>
            <strong>
              {codes.map((code) => {
                const observation = state.observations.find((item) => item.code === code);
                return (
                  <span key={code}>
                    {observation
                      ? (observation.short_text ?? observation.text)
                      : "まだ様子がわかりません"}
                  </span>
                );
              })}
            </strong>
          </button>
        ))}
      </div>
      {open && (
        <StatusDetail title="子どもの様子" onClose={() => setOpen(false)}>
          <p className="muted">いま見えている様子です。</p>
          {state.observations.map((item) => (
            <p key={item.code}>
              {item.subject === "A" ? "父との関係：" : item.subject === "B" ? "母との関係：" : ""}
              {item.text}
            </p>
          ))}
        </StatusDetail>
      )}
    </section>
  );
}
