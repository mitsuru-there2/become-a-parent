import { memo, useEffect } from "react";
import * as v from "valibot";
import { useForm } from "@tanstack/react-form";
import { ContentImage } from "./content_image";
import { FormInput } from "./form_input";
import { useStore } from "@nanostores/react";
import { Button } from "../ui/8bit/button";
import { $savedPlan, $busy, $dirty, update } from "../../stores/game";
import { actions } from "../../service/contract";
import { planPatchSchema } from "../../service/schemas";
import { preset, PRESETS } from "../../service/presets";
import type { PublicState, Plan, Person, Allocation } from "../../engine/types";
import { clone, PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";

type PlanPath =
  | `parents.${Person}.${keyof Allocation}`
  | `activity.${keyof Plan["activity"]}`
  | "style"
  | "help";
const fields = actions([]).plan_fields;

export const PlanEditor = memo(function PlanEditor({ publicState }: { publicState: PublicState }) {
  const savedPlan = useStore($savedPlan);
  const busy = useStore($busy);
  const form = useForm({
    defaultValues: savedPlan ?? publicState.plan!,
    validators: {
      onSubmit: ({ value }) =>
        v.is(planPatchSchema(publicState.extra_actions.map((action) => action.id)), value)
          ? undefined
          : "方針の入力内容を確認してください",
    },
    onSubmit: async ({ value }) => {
      await update("plan", value);
    },
  });
  // サービスで確定した値だけを基準にする。chooseでは$savedPlanは更新されない。
  useEffect(() => {
    if (savedPlan) form.reset(clone(savedPlan));
  }, [form, savedPlan]);
  useEffect(() => {
    const sync = () => $dirty.set(!form.state.isDefaultValue);
    sync();
    const subscription = form.store.subscribe(sync);
    return () => {
      subscription.unsubscribe();
      $dirty.set(false);
    };
  }, [form]);
  const replaceDraft = (plan: Plan) => form.reset(clone(plan), { keepDefaultValues: true });
  const renderField = (config: (typeof fields)[number]) => {
    const name = config.path as PlanPath;
    return (
      <form.Field
        key={name}
        name={name}
        listeners={{
          onChange: ({ value }) => {
            if (name === "activity.domain") {
              const current = form.getFieldValue("activity.level");
              const next = value === "none" ? 0 : Math.max(1, current);
              if (current !== next) form.setFieldValue("activity.level", next);
            }
            if (name === "activity.level") {
              const current = form.getFieldValue("activity.domain");
              if (value === 0 && current !== "none") form.setFieldValue("activity.domain", "none");
              else if (value !== 0 && current === "none")
                form.setFieldValue("activity.domain", "craft");
            }
          },
        }}
      >
        {(field) => (
          <FormInput
            name={field.name}
            label={labels[name.split(".").at(-1)!]}
            value={field.state.value}
            min={config.min ?? undefined}
            max={config.max ?? undefined}
            options={
              config.enum
                ? config.enum.map((value) => ({ value, label: labels[value] ?? value }))
                : name === "activity.level"
                  ? [
                      { value: 0, label: "なし" },
                      { value: 1, label: "ゆるやかに" },
                      { value: 2, label: "しっかり" },
                    ]
                  : undefined
            }
            onBlur={field.handleBlur}
            onChange={(event) =>
              field.handleChange(
                (config.enum
                  ? event.target.value
                  : event.target.value === ""
                    ? NaN
                    : Number(event.target.value)) as typeof field.state.value,
              )
            }
          />
        )}
      </form.Field>
    );
  };
  return (
    <section className="plan-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLAN THE NEXT SIX MONTHS</span>
          <h2>今期の方針</h2>
        </div>
        <form.Subscribe selector={(state) => state.isDefaultValue}>
          {(unchanged) => (
            <span className="muted">
              {unchanged ? "保存済みの方針で進めます" : "未保存の編集があります"}
            </span>
          )}
        </form.Subscribe>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <fieldset disabled={busy || submitting}>
              <legend className="sr-only">方針を編集</legend>
              <div className="presets">
                {Object.entries(PRESETS).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => replaceDraft(preset(publicState, id as keyof typeof PRESETS))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="allocations">
                {PEOPLE.map((id) => (
                  <div key={id}>
                    <h3>
                      {labels[id]}
                      <span>使える時間：12単位</span>
                    </h3>
                    <div className="fields">
                      {fields
                        .filter((field) => field.path.startsWith(`parents.${id}`))
                        .map(renderField)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="activity-fields">
                {fields.filter((field) => !field.path.startsWith("parents")).map(renderField)}
              </div>
              {publicState.extra_actions.length > 0 && (
                <form.Field name="extra_action">
                  {(field) => (
                    <div className="extra-actions">
                      <FormInput
                        name={field.name}
                        label="追加行動"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        options={[
                          { value: "none", label: "なし" },
                          ...publicState.extra_actions.map((action) => ({
                            value: action.id,
                            disabled: !action.available,
                            label: `${action.label}（${action.cost}万円・${labels[action.parent]} ${action.time}単位）${!action.available ? "：今の年齢では選べません" : ""}`,
                          })),
                        ]}
                      />
                      {publicState.extra_actions
                        .filter((action) => action.id === field.state.value)
                        .map((action) => (
                          <div key={action.id}>
                            <p className="muted">{action.description}</p>
                            {action.visual && <ContentImage visual={action.visual} />}
                          </div>
                        ))}
                    </div>
                  )}
                </form.Field>
              )}
              <div className="plan-tools">
                <button
                  type="button"
                  onClick={() => {
                    const care = publicState.forecast!.care_required;
                    form.setFieldValue("parents.A.care", Math.ceil(care / 2));
                    form.setFieldValue("parents.B.care", Math.floor(care / 2));
                  }}
                >
                  世話を必要な分だけ振り分ける
                </button>
                <button
                  type="button"
                  onClick={() => replaceDraft(publicState.forecast!.fallback_plan)}
                >
                  無理のない方針にする
                </button>
                <button type="button" onClick={() => void update("reset-plan")}>
                  前期の方針に戻す
                </button>
              </div>
              <form.Subscribe selector={(state) => state.errors.length}>
                {(count) =>
                  count > 0 && (
                    <p role="alert">
                      方針の入力を確認してください。数値は各項目の範囲内の整数で指定してください。
                    </p>
                  )
                }
              </form.Subscribe>
              <form.Subscribe selector={(state) => state.isDefaultValue}>
                {(unchanged) => (
                  <div className="plan-save">
                    <Button type="submit" disabled={unchanged}>
                      方針を保存
                    </Button>
                    {!unchanged && (
                      <button type="button" onClick={() => form.reset()}>
                        編集を取り消す
                      </button>
                    )}
                  </div>
                )}
              </form.Subscribe>
            </fieldset>
          )}
        </form.Subscribe>
      </form>
    </section>
  );
});
