import { useForm } from "@tanstack/react-form";
import { useStore } from "@nanostores/react";
import * as v from "valibot";
import { catalog } from "../../content/catalog";
import { difficultyIdSchema } from "../../content/schemas";
import { $busy, createRun } from "../../stores/game";
import { Button } from "../ui/8bit/button";

const difficulties = catalog.list().difficulties;
const startSchema = v.object({ difficulty: difficultyIdSchema });

export function StartForm({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const busy = useStore($busy);
  const form = useForm({
    defaultValues: { difficulty: "normal" },
    validators: { onSubmit: startSchema },
    onSubmit: async ({ value }) => {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const id = await createRun("home-01", seed, value.difficulty);
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
            <form.Subscribe selector={(state) => state.values.difficulty}>
              {(difficulty) => (
                <p className="muted">
                  {difficulties.find((d) => d.id === difficulty)?.description}
                </p>
              )}
            </form.Subscribe>
            <div className="start-fields">
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
                      {difficulties.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </form.Field>
            </div>
            <form.Subscribe selector={(state) => state.errors.length}>
              {(count) => count > 0 && <p role="alert">難易度を選んでください。</p>}
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
