import { useStore } from "@nanostores/react";
import { Button } from "../ui/8bit/button";
import { $draft, $busy, $dirty, update } from "../../stores/game";
import { actions } from "../../service/contract";
import { preset, PRESETS } from "../../service/presets";
import type { PublicState } from "../../engine/types";
import { clone, PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";

export function PlanEditor({ publicState }: { publicState: PublicState }) {
  const draft = useStore($draft);
  const busy = useStore($busy);
  const dirty = useStore($dirty);
  if (!draft) return null;
  const fields = actions([]).plan_fields;
  const getFieldValue = (path: string) =>
    path
      .split(".")
      .reduce((value, key) => (value as Record<string, unknown>)[key], draft as unknown);
  function setFieldValue(path: string, value: string | number) {
    const next = clone(draft!);
    const keys = path.split(".");
    let target = next as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
    target[keys.at(-1)!] = value;
    // 関連する入力欄を一緒に補完する。保存時の最終検証は共通サービスが行う。
    switch (path) {
      case "activity.domain":
        next.activity.level = value === "none" ? 0 : Math.max(1, next.activity.level);
        break;
      case "activity.level":
        if (value === 0) next.activity.domain = "none";
        else if (next.activity.domain === "none") next.activity.domain = "craft";
        break;
    }
    $draft.set(next);
  }
  return (
    <section className="plan-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLAN THE NEXT SIX MONTHS</span>
          <h2>今期の方針</h2>
        </div>
        <span className="muted">
          {dirty ? "未保存の編集があります" : "前期の方針を引き継ぎます"}
        </span>
      </div>
      <fieldset disabled={busy}>
        <legend className="sr-only">方針を編集</legend>
        <div className="presets">
          {Object.entries(PRESETS).map(([id, label]) => (
            <button
              key={id}
              onClick={() => $draft.set(preset(publicState, id as keyof typeof PRESETS))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="allocations">
          {PEOPLE.map((parentId) => (
            <div key={parentId}>
              <h3>
                親{parentId}
                <span>使える時間：12単位</span>
              </h3>
              <div className="fields">
                {fields
                  .filter((field) => field.path.startsWith(`parents.${parentId}`))
                  .map((field) => (
                    <label key={field.path}>
                      {labels[field.path.split(".").at(-1)!]}
                      {field.enum ? (
                        <select
                          value={String(getFieldValue(field.path))}
                          onChange={(event) => setFieldValue(field.path, event.target.value)}
                        >
                          {field.enum.map((enumValue) => (
                            <option key={enumValue} value={enumValue}>
                              {labels[enumValue]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={field.min!}
                          max={field.max!}
                          step="1"
                          value={
                            Number.isFinite(Number(getFieldValue(field.path)))
                              ? Number(getFieldValue(field.path))
                              : ""
                          }
                          onChange={(event) =>
                            setFieldValue(
                              field.path,
                              event.target.value === "" ? NaN : Number(event.target.value),
                            )
                          }
                        />
                      )}
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="activity-fields">
          {fields
            .filter((field) => !field.path.startsWith("parents"))
            .map((field) => (
              <label key={field.path}>
                {labels[field.path.split(".").at(-1)!]}
                {field.enum ? (
                  <select
                    value={String(getFieldValue(field.path))}
                    onChange={(event) => setFieldValue(field.path, event.target.value)}
                  >
                    {field.enum.map((enumValue) => (
                      <option key={enumValue} value={enumValue}>
                        {labels[enumValue] ?? enumValue}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={Number(getFieldValue(field.path))}
                    onChange={(event) => setFieldValue(field.path, Number(event.target.value))}
                  >
                    {[0, 1, 2].map((enumValue) => (
                      <option key={enumValue} value={enumValue}>
                        {enumValue === 0 ? "なし" : enumValue === 1 ? "ゆるやかに" : "しっかり"}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}
        </div>
        <div className="plan-tools">
          <button
            onClick={() => {
              const next = clone(draft);
              const care = publicState.forecast!.care_required;
              next.parents.A.care = Math.ceil(care / 2);
              next.parents.B.care = Math.floor(care / 2);
              $draft.set(next);
            }}
          >
            世話の配分を合わせる
          </button>
          <button onClick={() => $draft.set(clone(publicState.forecast!.fallback_plan))}>
            無理のない案
          </button>
          <button onClick={() => void update("reset-plan")}>前期の方針に戻す</button>
        </div>
        <div className="plan-save">
          <Button disabled={!dirty || busy} onClick={() => void update("plan", draft)}>
            方針を保存
          </Button>
          {dirty && (
            <button onClick={() => $draft.set(clone(publicState.plan))}>編集を取り消す</button>
          )}
        </div>
      </fieldset>
    </section>
  );
}
