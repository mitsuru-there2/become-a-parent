# ゲーム設定の編集

## 選択中心の新方式（S-016）

新規ゲームの特殊イベント・通常判断は`base.json`の`decision_game`で定義します。従来の`events`等は旧方式と追加パックの互換用にも維持します。外側の設定構造はdata-2のまま拡張し、新方式の保存にはrules-3 / data-3 / save-4を記録します。

- `events`：毎期1件の特殊イベント候補。`slot`は−1。
- `themes`：通常判断。`slot`の0・1・2からそれぞれ1件。年齢範囲は`min_turn`〜`max_turn`。
- `condition`：always / tired / strained / crisis。状況に合う条件付きの題材を優先します。
- `options`：本文、即時費用、対象の父母、使う能力、成果、各状態への効果、継続契約、明示的な終了理由。
- `income`と各`*_per_turn`：半年の基礎収入と自然な変化。

全40期で各枠の候補があり、無料で継続できる選択を持つことを検査します。正本は[専用Valibotスキーマ](../src/content/decision_schema.ts)。計算式は[S-016](../docs/specs/decisions.md)です。

旧形式の追加パックの行動は通常判断の追加選択肢へ変換し、時間消費は担当親の疲労として扱います。追加イベントの`probability`は候補へ入る確率です。候補になっても特殊イベント1枠の抽選で選ばれるとは限りません。新方式では`group`・`priority`による複数イベント提示はしません。

以下は従来の設定フィールド・追加パックの説明です。

仕様の正本：[S-015](../docs/specs/content.md)。通常の調整は `base.json`、追加パックの登録は `packs.json` を編集します。`legacy-data-1.json` は旧保存の再生用に凍結したデータです。変更しないでください。

## JSONの補完・型チェック

このプロジェクトをVS Codeなど `.vscode/settings.json` のJSON Schema設定に対応するエディタで開くと、本編設定・パック登録一覧・サンプルのJSONで項目名と列挙値の補完、型違い・必須項目・未知キー・数値範囲の診断が利用できます。JSONファイルに型注釈を書く必要はありません。

- 関連付け：[.vscode/settings.json](../.vscode/settings.json)
- 生成元：[Valibotスキーマ](../src/content/schemas.ts)
- 生成物：[config/schemas](schemas/)
- スキーマ変更後：`bun run schema:generate`
- JSON本体のスキーマ検査：`bun run check:json`（関連付けの全ファイル、行・列付き診断）
- JSON関連の全検査：`bun run lint:json`（lint・check・コミット時にも実行）
- 更新漏れの検出：`bun run schema:check`（`bun run lint`・`bun run check`にも組み込み済み）

`base.json` と `legacy-data-1.json` は本編用、`packs.json` は配列用、`examples/*.json` は単体パック用のスキーマを使います。別の場所にパックJSONを置く場合は関連付けの `fileMatch` に追加してください。JSON本体へ `$schema` を加える方式は採用していません。設定本体の型・保存ハッシュをそのまま保ちます。

独自の `check` 関数（効果キーの制約、確率の合計、IDの重複等）や、画像・行動・依存パックの実在はJSON Schemaだけでは検査しません。最終確認は `bun run check:content` で行います。生成物は手で編集せず、Valibotから再生成してください。

## どこを変更するか

| 項目                                     | `base.json` のキー                  |
| ---------------------------------------- | ----------------------------------- |
| イベントの本文・選択肢・費用・効果・画像 | `events.<ID>`                       |
| 発生期・条件・再発間隔・確率             | `events.<ID>.trigger`               |
| 難易度の名前・説明・初期資金・毎期生活費 | `difficulties.easy / normal / hard` |
| 仕事の収入・時間・疲れ・充実             | `work`                              |
| 年代ごとの世話・費用・学年表示           | `stages`                            |
| 活動・有料支援・自分の時間の費用         | `balance`                           |
| 珍事の確率・収支・効果・本文             | `oddities`                          |
| 成人後の進路・距離・健康イベントの確率   | `adult`                             |
| 年代ごとの情景文・画像ID                 | `scenes`                            |
| 観察文・結末・その他の固定文言           | `text`（キーを保持して値を編集）    |
| 画像パス・代替テキスト                   | `visuals`                           |
| 家庭の名称・説明・適応の差               | `scenarios`                         |
| 毎期選べる追加行動                       | `actions`                           |

設定はビルド時に取り込みます。開発サーバーではファイル変更が反映されます。保存済みの人生には開始時の設定が残るので、調整の確認には新しい人生を開始します。同じ `data_version` 内の数値・本文調整は設定ハッシュで識別されます。未知のデータ版は拒否するため、版を任意の文字列に変えないでください。構造変更時はエンジンと互換処理も更新します。

難易度は初期資金と生活費で変わります。既定の「ふつう」は従来と同じ収支です。ゲームの計算方式、状態変数、成人後の進行・結末の判定式はTypeScript側です。新しい能力・効果の種類・時間軸・判定方式を作るときはSPECとエンジンも変更します。画面の操作案内や数値を組み立てる文までJSONへ移したものではありません。

## イベント

`trigger.turns` が空なら対象期間の各期で条件を調べ、値があれば列挙した期だけが対象です。`min_turn` / `max_turn` は1〜40。`cooldown` は前回提示からの最短間隔、`once` は一度だけ提示する指定です。選択しなかった場合ではなく、提示時に記録します。

`all` は全条件一致、`any` は一つ以上一致（空なら制限なし）。条件は `{ "path": "child.stress", "op": "gte", "value": 60 }` の形です。数値の演算子は `eq`（一致）、`lt`（未満）、`gte`（以上）。使用可能なパスは[検査処理](../src/content/validation.ts)の `numericConditionPaths` と `condition` に列挙しています。子どもの内部値の条件はプレイヤーには公開しません。

`probability` は整数の0〜100%。0は発生なし、100は条件成立時に必ず発生。抽選はシード・期・イベントIDから決まり、表示を開き直す操作で引き直しません。`group` が同じイベントは優先順位の小さいものから判定して最大1件、空文字なら独立。優先順位が同じ場合はID順です。追加パックで既存グループ名を使うと本編の発生枠に参加するため、通常はパック専用名か空文字を使います。

`options` は選択ID・表示名・費用・効果。必ず費用0の選択肢を1つ以上含めます。本文の `target_suffix` では `{domain}` を置換できます。`target` は `study` / `craft` / `previous_activity` / `interest`。

### 効果キー

| キー                         | 効果                                             |
| ---------------------------- | ------------------------------------------------ |
| S / F / G / N                | 両親の疲れ / 充実 / 後悔 / 交流                  |
| T                            | 両親それぞれへの子の信頼                         |
| X / U                        | 子の疲れ / 主体性                                |
| adapt                        | 適応値を掛けて子の疲れを変更                     |
| GM / GR                      | 祖父母の資金 / 関係                              |
| B_study / B_craft / B_target | 学習 / 創作 / 対象分野の能力                     |
| I_study / I_craft / I_target | 学習 / 創作 / 対象分野の興味                     |
| income                       | イベント選択の援助収入。祖父母の資金チェック対象 |
| delay                        | イベント選択の既存遅延効果 `L-01` / `L-02`       |

通常効果は整数−100〜100。`income` は非負整数で、祖父母からの援助には `GM` の減額も指定します。`income` / `delay` はイベント選択専用です。遅延効果を持つイベントは38期までに限定します。新しい遅延効果の種類はエンジン追加が必要です。

珍事は配列順に確率区間を割り当て、残りは何も起きません。合計100%以下で指定します。例：10%、8%、7%ならR=0〜9 / 10〜17 / 18〜24、25〜99は発生なし。

## 追加シナリオの登録

`examples/community.json` は「地域の工房」の開発用サンプルです。販売商品ではなく、既定では未登録です。家庭1件、追加行動1件、行動を続けると発生し得るイベント1件を含みます。

1. サンプルを複製し、パックID・版・名称と内容を編集する。
2. `packs.json` の配列へ、そのJSONオブジェクトを追加する。ファイル名だけの登録ではありません。
3. `bun run check:content` で設定・参照画像を確認する。
4. `bun run test` で本編と追加パックの回帰を確認する。新作パック固有の受け入れ条件もテストに加える。
5. `bun run cli scenarios` で公開一覧を確認し、新規開始時に選ぶ。ブラウザにも登録したパックが表示される。

サンプルを開発中だけ登録する例（現在の登録配列に追記します。重複時は検査が失敗します）：

```sh
bun -e 'const path="config/packs.json"; const packs=await Bun.file(path).json(); packs.push(await Bun.file("config/examples/community.json").json()); await Bun.write(path,JSON.stringify(packs,null,2)+"\n");'
bun run check:content
bun run cli new --run workshop --scenario community-home --seed 0 --difficulty normal --packs '["community"]' --request-id start
```

`requires_data` は対応データ版、`dependencies` は一緒に選択する必要があるパックIDです。自動選択はしません。依存不足・循環・ID衝突は拒否します。パック内のIDは `community-workshop` のようにパック名を含めると衝突を防げます。

追加行動は `plan.extra_action` にIDを指定し、`none` で解除します。毎期の費用と指定親の時間を消費します。対象外の時期への持越しは予測で拒否されるため、解除か別の行動を選びます。`actions` と公開状態の `extra_actions` から、ID・表示名・費用・時間・対象時期の可否を取得できます。

## 画像

`visuals` にIDと `{ "src": "/assets/community/workshop.webp", "alt": "地域の工房で作品を作る家族" }` を登録し、イベント・行動・情景の `visual` にそのIDを指定します。不要なら `null`。画像ファイルは `public/assets/community/workshop.webp` に置きます。正式HEROだけは既存の `assets/marketing/hero.png` をビルドして使います。追加画像のパスは変更せず版を含む新しいファイル名にすると、過去の保存の参照を保持できます。画像バイナリは保存ファイルには埋め込みません。画像がなくても本文と操作は残ります。

画像を新規制作する際は[アートディレクション](../docs/art-direction.md)に従います。

## DLC購入の将来接続

`Catalog` は本編と利用可能なパックを受け取り、`Service` はそのカタログを使って開始条件を検査します。将来の購入・配信層で権利を確認したパックを渡せます。ただし現在はローカルに登録されたパックの選択機能です。ブラウザ設定・保存内のパックIDやハッシュを購入証明に使ってはいけません。決済、権利の再確認、返金時の扱い、有料データ配信は別途実装します。

## スキーマと検査の実装

Valibot 1.5.0を利用します。[スキーマ](../src/content/schemas.ts)で構造・必須項目・値域・未知キーを検査し、[型定義](../src/content/types.ts)はスキーマから導出します。画像IDや行動IDの実在、必要な文言、設定ハッシュ等は[整合性検査](../src/content/validation.ts)で確認します。文字列の数値変換や、不正な入力の自動補正は行いません。

設定項目を追加する場合はスキーマを変更し、必要な整合性検査と受け入れ条件を加えます。型を別途手書きで同期する必要はありません。CLI入力のスキーマは[service/schemas.ts](../src/service/schemas.ts)、ID・整数・辞書の共通処理は[validation/primitives.ts](../src/validation/primitives.ts)です。
