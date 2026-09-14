import { useForm } from "@tanstack/react-form";
import { $error, repository } from "../../stores/game";

export function ImportForm({ onImported }: { onImported: (id: string) => Promise<void> }) {
  const form = useForm({
    defaultValues: { file: null as File | null },
    onSubmit: async ({ value }) => {
      if (!value.file) return;
      $error.set("");
      try {
        if (value.file.size > 25_000_000) throw new Error("保存ファイルは25MBまでです。");
        const id = await repository.restore(await value.file.text());
        await onImported(id);
      } catch (error) {
        $error.set(error instanceof Error ? error.message : "読み込めませんでした");
      }
    },
  });
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <form.Field name="file">
            {(field) => (
              <label className="import">
                保存ファイルを取り込む
                <input
                  type="file"
                  name={field.name}
                  accept="application/json,.json"
                  disabled={submitting}
                  onBlur={field.handleBlur}
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    if (!file || form.state.isSubmitting) return;
                    field.handleChange(file);
                    await form.handleSubmit();
                    form.reset();
                    input.value = "";
                  }}
                />
              </label>
            )}
          </form.Field>
        )}
      </form.Subscribe>
    </form>
  );
}
