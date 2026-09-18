# CLI操作ガイド

Bunで実行する。保存ディレクトリの既定は `.saves`。`--dir PATH` で変更できる。`--run` はファイルパスでなく実行ID。正本は[S-011](specs/cli.md)。

## 生活メニューの操作（S-017）

```sh
bun run cli new --run trial --scenario home-01 --seed 0 --request-id start
bun run cli actions --run trial
bun run cli observe --run trial
```

応答の`choices`から`instance_id`と`option_id`を取得し、`choose --input '{"event_instance":"取得したID","option_id":"取得したID"}'`へ渡します。更新ごとに最新の`--revision`と未使用の`--request-id`を付けます。

1. `public.life.menus`は分類、`choices`は現在の選択肢です。`menu`・`decision_kind`・`reason`・`fresh`で分類・種類・出現理由・新規の機会を確認できます。
2. 通常は回答せず`advance`できます。`choose`は方針変更または今期の行動を予定し、次の`advance`で費用・効果を確定します。
3. `choices`が返す末尾`cancel`の選択肢でその予定を取り消せます。`reset-plan`は今期の予定を全取消します。継続中の方針は解除しません。
4. `public.forecast.can_advance`で合計資金・行動枠を検査します。確定後の次期から、履歴や継続状態に応じた新しい判断が出ます。

`public.life.policies`は現在と予定後の方針・継続費、`action_count`は今期だけの行動数、`max_actions`は上限です。`public.answers`は未確定の予定です。`actions`は`plan_fields`を返さず、`plan`を拒否します。標準生活のために`choose`を呼ぶ必要はありません。

`phase`は`childhood`・`finished`・`game_over`。`result`は通常完走なら`payload.result`、途中終了なら`payload.game_over`を返します。`history`は特殊イベント・半年・成人後の記録、`replay`はイベント確定と半年確定の操作列を再生します。途中の未確定回答は保存しますが、確定列の再生には含めません。

同一request-id・同一要求の再送で二重適用しません。旧保存は旧方式の配分操作を維持します。新規操作の正本は[S-017](specs/life-menus.md)と[S-011](specs/cli.md)。

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

`difficulty` は `easy` / `normal` / `hard`、省略時は `normal`。`packs` はパックIDのJSON配列です（例：`--packs '["community-life"]'`）。登録済みパックのみ選べます。`scenarios` の公開一覧には難易度とパック・追加家庭も含みます。開始後は難易度・パックを変更できません。

旧方式の追加行動は `plan` の `input` に `{"extra_action":"community-workshop"}` を指定します。`none` で解除し、ID・費用・時間・時期の可否は `actions` の `extra_actions` で確認します。選択は毎期引き継がれます。設定方法は[設定ガイド](../config/README.md)。

新方式のDLCは公開された生活メニューへ判断を追加し、自動イベントも拡張します。新規保存・書き出しはsave-9 / parent-save-9です。使用した設定を保存し、旧save-2〜8も当時の方式のまま読み込めます。上記以外の公開コマンド・revision・request-id契約はcli-2を維持します。不正な新規設定は `INVALID_CONTENT`（CLI終了コード2）、保存内設定の破損は `CORRUPT_SAVE` です。
