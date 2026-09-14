# CLI操作ガイド

Bunで実行する。保存ディレクトリの既定は `.saves`。`--dir PATH` で変更できる。`--run` はファイルパスでなく実行ID。正本は[S-011](specs/cli.md)。

```sh
bun run cli new --run trial --scenario home-01 --seed 0 --request-id start
bun run cli actions --run trial
bun run cli choose --run trial --revision 0 --request-id choice-1 --input '{"event_instance":"t01:E-01","option_id":"E-01:watch"}'
bun run cli advance --run trial --revision 1 --request-id turn-1
bun run cli observe --run trial
bun run cli history --run trial --offset 0 --limit 50
bun run cli replay --run trial
```

更新は最新のrevisionと未使用のrequest-idを渡す。同一ID・同一要求は二重適用しない。`actions` の `payload.actions.plan_fields` から全編集項目と値域を取得できる。`plan` は部分編集、`choose` は回答の保存、`advance` だけが半年を確定する。必要な世話の量は年代によって変わるため、公開forecastを読んで配分する。

`result` は終了後に `payload.result` へ親・子・結末を返す。`replay` は保存された確定列をメモリで再計算し、一致を返す読み取り操作。未確定の編集は再生しない。

```sh
bun run cli export --run trial --file /tmp/trial-export.json
bun run cli import --dir /tmp/another-saves --file /tmp/trial-export.json
```

同形式をブラウザでも取り込める。同IDの既存保存は上書きしない。旧SQLite保存の変換は行わない。

大量操作は `bun run cli serve --dir /tmp/playtest-saves`。標準入力に1行1要求を送り、出力は `{response,exit_code}`。例：

```json
{"command":"new","run":"agent-01","scenario":"home-01","seed":0,"request_id":"start"}
{"command":"observe","run":"agent-01"}
```

通常プレイではobserve/actions/forecast/history/resultの公開情報だけを使い、ソース・保存ファイル・debug-state・参照数値を判断に使わない。内部検証は別記録とする。

## 難易度と追加シナリオ（S-015）

```sh
bun run cli scenarios
bun run cli new --run my-family --scenario home-01 --seed 0 --difficulty hard --request-id start
```

`difficulty` は `easy` / `normal` / `hard`、省略時は `normal`。`packs` はパックIDのJSON配列です（例：`--packs '["community"]'`）。登録済みパックのみ選べます。`scenarios` の公開一覧には難易度とパック・追加家庭も含みます。開始後は難易度・パックを変更できません。

追加行動は `plan` の `input` に `{"extra_action":"community-workshop"}` を指定します。`none` で解除し、ID・費用・時間・時期の可否は `actions` の `extra_actions` で確認します。選択は毎期引き継がれます。設定方法は[設定ガイド](../config/README.md)。

新規保存・書き出しはsave-3 / parent-save-3です。使用した設定を保存し、旧save-2も読み込めます。上記以外の公開コマンド・revision・request-id契約はcli-2を維持します。不正な新規設定は `INVALID_CONTENT`（CLI終了コード2）、保存内設定の破損は `CORRUPT_SAVE` です。
