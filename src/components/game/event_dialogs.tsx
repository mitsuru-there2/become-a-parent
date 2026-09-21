import { useEffect, useState, type RefObject } from "react";
import type { AutomaticEventResult } from "../../engine/types";
import { ContentImage } from "./content_image";
import familyRoom from "../../../assets/scenes/family-room.png";

export function EventDialogs({
  events,
  legacyLines,
  onClose,
  headingRef,
  stagger = false,
}: {
  events: AutomaticEventResult[];
  legacyLines: string[];
  onClose: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  stagger?: boolean;
}) {
  const items: (AutomaticEventResult | null)[] = events.length > 0 ? events : [null];
  const [revealed, setRevealed] = useState(stagger ? 1 : items.length);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const visible = items
    .map((_, index) => index)
    .filter((index) => index < revealed && !dismissed.includes(index))
    .slice(-4);
  const topIndex = visible.at(-1)!;
  const closeCurrent = () => {
    if (visible.length === 1 && revealed === items.length) onClose();
    else {
      setDismissed((previous) => [...previous, topIndex]);
      // 読み終えた時点で次のカードがまだ開いていなければ、待たずに見せる。
      if (visible.length === 1 && revealed < items.length) setRevealed(revealed + 1);
    }
  };

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [topIndex, headingRef]);

  useEffect(() => {
    if (!stagger) {
      if (revealed < items.length) setRevealed(items.length);
      return;
    }
    if (revealed >= items.length) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(items.length);
      return;
    }
    const timer = window.setTimeout(() => setRevealed((count) => count + 1), 300);
    return () => window.clearTimeout(timer);
  }, [stagger, revealed, items.length]);

  return (
    <>
      <div className="event-overlay" aria-hidden="true" />
      {visible.map((itemIndex, index) => {
        const event = items[itemIndex];
        const isTop = index === visible.length - 1;
        const depth = visible.length - index - 1;
        const headingId = `turn-event-title-${event?.event_id ?? "empty"}`;
        return (
          <section
            key={event?.event_id ?? "empty"}
            className="event-dialog turn-event-dialog"
            role={isTop ? "dialog" : undefined}
            aria-modal={isTop ? "true" : undefined}
            aria-labelledby={isTop ? headingId : undefined}
            aria-hidden={isTop ? undefined : true}
            inert={!isTop}
            data-depth={Math.min(depth, 3)}
            data-stacked={items.length > 1 || undefined}
            style={{ zIndex: 101 + index }}
            onKeyDown={(keyEvent) => {
              if (!isTop) return;
              if (keyEvent.key === "Escape") {
                keyEvent.preventDefault();
                closeCurrent();
              }
              if (keyEvent.key === "Tab") {
                const buttons = keyEvent.currentTarget.querySelectorAll("button");
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (
                  keyEvent.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === headingRef.current)
                ) {
                  keyEvent.preventDefault();
                  last?.focus();
                } else if (!keyEvent.shiftKey && document.activeElement === last) {
                  keyEvent.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="turn-event-illustration">
              {event?.visual ? (
                <ContentImage visual={event.visual} priority={isTop} />
              ) : (
                <img src={familyRoom} alt="家族に起きた出来事を表す仮の挿絵" />
              )}
              <span>TURN EVENT</span>
              <button
                className="turn-event-close"
                type="button"
                aria-label="閉じる"
                onClick={closeCurrent}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M5 5 19 19M19 5 5 19" />
                </svg>
              </button>
            </div>
            <div className="turn-event-heading">
              <p>この半年のはじまり</p>
              <h2 id={headingId} ref={isTop ? headingRef : undefined} tabIndex={-1}>
                今期の出来事
              </h2>
              {events.length > 0 && (
                <span>
                  {itemIndex + 1} / {events.length} 件
                </span>
              )}
            </div>
            <div className="turn-event-list">
              {event ? (
                <article className={`turn-event-card turn-event-card--${event.kind}`}>
                  <span className="turn-event-kind">
                    {event.kind === "good" ? "良い出来事" : "困った出来事"}
                  </span>
                  <p>{event.text}</p>
                  {event.changes.length > 0 && (
                    <ul aria-label="パラメータの変更">
                      {event.changes.map((change) => (
                        <li key={change}>{change}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ) : legacyLines.length > 0 ? (
                <div className="turn-event-card turn-event-card--neutral">
                  {legacyLines.map((line, lineIndex) => (
                    <p key={lineIndex}>{line}</p>
                  ))}
                </div>
              ) : (
                <p className="turn-event-empty">今期は特別な出来事はありません。</p>
              )}
            </div>
            <button className="rpg-button" onClick={closeCurrent}>
              閉じる
            </button>
          </section>
        );
      })}
    </>
  );
}
