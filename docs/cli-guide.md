# CLI操作ガイド

Bunで実行する。保存ディレクトリの既定は `.saves`。`--dir PATH` で変更できる。`--run` はファイルパスでなく実行ID。正本は[S-011](specs/cli.md)。

## 新方式の操作（S-016）

```sh
bun run cli new --run trial --scenario home-01 --seed 0 --request-id start
bun run cli actions --run trial
bun run cli observe --run trial
```

応答の`choices`から`instance_id`と`option_id`を取得し、`choose --input '{"event_instance":"取得したID","option_id":"取得したID"}'`へ渡します。更新ごとに最新の`--revision`と未使用の`--request-id`を付けます。

1. 最初の`choices`は特殊イベント1件。`choose`すると効果がその場で確定します。
2. 次の`choices`は通常の判断3件。それぞれ`choose`し、`public.decision_turn.answered`が3になるまで回答します。選び直しは可能です。
3. `public.forecast.can_advance`を確認して`advance`すると半年進みます。

`actions`は新方式では配分用の`plan_fields`を返さず、`plan`・`reset-plan`を拒否します。「何もしない」も明示的に`choose`します。通常の判断は選び直すだけでは費用を消費しません。

`phase`は`childhood`・`finished`・`game_over`。`result`は通常完走なら`payload.result`、途中終了なら`payload.game_over`を返します。`history`は特殊イベント・半年・成人後の記録、`replay`はイベント確定と半年確定の操作列を再生します。途中の未確定回答は保存しますが、確定列の再生には含めません。

同一request-id・同一要求の再送で二重適用しません。旧保存は旧方式の配分操作を維持します。操作の正本は[S-016](specs/decisions.md)と[S-011](specs/cli.md)。

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

旧方式の追加行動は `plan` の `input` に `{"extra_action":"community-workshop"}` を指定します。`none` で解除し、ID・費用・時間・時期の可否は `actions` の `extra_actions` で確認します。選択は毎期引き継がれます。設定方法は[設定ガイド](../config/README.md)。

新方式の追加行動は公開された通常判断の選択肢として選びます。新規保存・書き出しはsave-4 / parent-save-4です。使用した設定を保存し、旧save-2・save-3も旧方式のまま読み込めます。上記以外の公開コマンド・revision・request-id契約はcli-2を維持します。不正な新規設定は `INVALID_CONTENT`（CLI終了コード2）、保存内設定の破損は `CORRUPT_SAVE` です。
