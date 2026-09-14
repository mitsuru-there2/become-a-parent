import { useForm } from "@tanstack/react-form";
import { useStore } from "@nanostores/react";
import * as v from "valibot";
import { catalog } from "../../content/catalog";
import { difficultyIdSchema } from "../../content/schemas";
import { integer } from "../../validation/primitives";
import { $busy, createRun } from "../../stores/game";
import { Button } from "../ui/8bit/button";

const content = catalog.list();
const startSchema = v.object({
  scenario: v.string(),
  seed: integer(0, 4294967295),
  difficulty: difficultyIdSchema,
  packs: v.array(v.string()),
});

export function StartForm({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const busy = useStore($busy);
  const form = useForm({
    defaultValues: { scenario: "home-01", seed: 0, difficulty: "normal", packs: [] as string[] },
    validators: { onSubmit: startSchema },
    onSubmit: async ({ value }) => {
      const id = await createRun(value.scenario, value.seed, value.difficulty, value.packs);
      if (id) await onCreated(id);
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <fieldset disabled={busy || submitting} className="form-fields">
            {content.packs.length > 0 && (
              <form.Field
                name="packs"
                listeners={{ onChange: () => form.setFieldValue("scenario", "home-01") }}
              >
                {(field) => (
                  <fieldset>
                    <legend>追加シナリオ</legend>
                    {content.packs.map((pack) => (
                      <label key={pack.id}>
                        <input
                          type="checkbox"
                          name={field.name}
                          checked={field.state.value.includes(pack.id)}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(
                              event.target.checked
                                ? [...field.state.value, pack.id]
                                : field.state.value.filter((id) => id !== pack.id),
                            )
                          }
                        />
                        {pack.label}
                        {pack.dependencies.length > 0 && (
                          <small>必要なパック：{pack.dependencies.join("、")}</small>
                        )}
                      </label>
                    ))}
                  </fieldset>
                )}
              </form.Field>
            )}
            <form.Subscribe selector={(state) => state.values.difficulty}>
              {(difficulty) => (
                <p className="muted">
                  {content.difficulties.find((d) => d.id === difficulty)?.description}
                </p>
              )}
            </form.Subscribe>
            <div className="start-fields">
              <form.Subscribe selector={(state) => state.values.packs}>
                {(packs) => (
                  <form.Field name="scenario">
                    {(field) => (
                      <label>
                        家庭
                        <select
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                        >
                          {[
                            ...content.scenarios,
                            ...content.packs
                              .filter((p) => packs.includes(p.id))
                              .flatMap((p) => p.scenarios),
                          ].map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>
                              {scenario.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </form.Field>
                )}
              </form.Subscribe>
              <form.Field name="difficulty">
                {(field) => (
                  <label>
                    難易度
                    <select
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    >
                      {content.difficulties.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </form.Field>
              <form.Field name="seed">
                {(field) => (
                  <label>
                    人生のシード
                    <input
                      name={field.name}
                      type="number"
                      min="0"
                      max="4294967295"
                      step="1"
                      required
                      value={Number.isFinite(field.state.value) ? field.state.value : ""}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.valueAsNumber)}
                    />
                  </label>
                )}
              </form.Field>
            </div>
            <form.Subscribe selector={(state) => state.errors.length}>
              {(count) =>
                count > 0 && (
                  <p role="alert">
                    家庭・難易度と、0〜4294967295の整数のシードを指定してください。
                  </p>
                )
              }
            </form.Subscribe>
            <Button type="submit" size="lg">
              新しい人生をはじめる <span aria-hidden="true">↗</span>
            </Button>
          </fieldset>
        )}
      </form.Subscribe>
    </form>
  );
}
