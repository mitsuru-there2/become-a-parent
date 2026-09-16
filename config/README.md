# ゲーム設定の編集

## 自動イベント（rules-6 / S-016）

新規ルールの祖父・祖母は`base.json`の`decision_game.initial_grandparents.grandfather` / `grandmother`で体力・関係・資金・地域のつながりを個別に設定します。初期援助資金は各50万円、援助では本人の資金のみ50万円減ります。`initial_grandparent_funds`は旧rules-6用です。

新規ゲームのイベントは専用の [events.json](events.json) で調整します。各期に全イベントを独立抽選し、0件でも複数件でも通常の3判断に進みます。発生時に効果を自動適用し、回答は求めません。初期設定は善悪13件。本文・数値はゲーム用の調整仮値です。

| 項目                                | 意味                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| `id` / `text` / `kind`              | 一意なID、本文、`good`（うれしい）/ `bad`（困った）の表示分類 |
| `min_age_months` / `max_age_months` | 子どもの対象月齢。両端を含む。6歳なら72、19歳6か月なら234     |
| `probability`                       | 1期あたりの基本確率（整数0〜100%）                            |
| `conditions`                        | 全条件が成立したときだけ抽選。空配列は制約なし                |
| `modifiers`                         | 条件に合う補正の`add`を確率に加算。最終確率は0〜100%          |
| `cooldown` / `once`                 | 再発までの期数（1なら毎期抽選可）、一度限りか                 |
| `effects`                           | 発生時の数値変更。`path`へ`delta`を直接加算                   |

条件は `{ "path": "child.ability.craft", "op": "gte", "value": 30 }` のように記述します。`op`は`eq`（等しい）、`lt`（未満）、`gte`（以上）。父母は`parents.A`（父）/`parents.B`（母）、夫婦関係は`couple`、祖父・祖母は`grandparents.members.grandfather` / `grandparents.members.grandmother`。`grandparents`直下は旧互換の集計値です。能力・疲労は`decisions.skills.A.learning`や`decisions.fatigue.B`等です。許可する全パスは[スキーマ](../src/content/automatic_event_schema.ts)とJSON補完で確認できます。

親・祖父母・夫婦関係は10点、子どもは内部100点、金額は万円、年齢は月です。旧選択肢のような効果量の自動倍率はありません。例えば家計50万円の入金は`{ "path": "cash", "delta": 50 }`、父のストレス1点増加は`{ "path": "parents.A.stress", "delta": 1 }`。効果は上下限で止め、金銭支出は所持金までです。子どもの内部値は公開せず、観察に反映します。

全件を同じ期首状態で判定してからID順に適用するため、定義の配列順は抽選結果に影響しません。設定の変更は新しく開始するゲームに適用されます。保存済みのゲームは設定と抽選結果を保持し、再開時に最新JSONへ置き換えません。`bun run lint:json`で月齢・確率・パス・ID重複などを検査できます。

## 通常判断と旧設定

通常判断は`base.json`の`decision_game.themes`で定義します。`slot`の0・1・2から1件ずつ提示し、`min_turn`〜`max_turn`と`condition`で候補を絞ります。費用・収入・継続契約・効果・能力による成果は[S-016](../docs/specs/decisions.md)と[専用スキーマ](../src/content/decision_schema.ts)を参照してください。

`decision_game.events`はrules-3〜5の回答式イベント用、従来の`events`は旧方式・旧追加パック用です。rules-6ではこれらのイベントを発生させません。旧形式の追加パックの行動は通常判断に取り込みます。旧保存は元のルールで再開します。新規保存の版はrules-6 / data-6 / save-7です。

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

`events.json`は自動イベント用、`base.json` と `legacy-data-1.json` は本編用、`packs.json` は配列用、`examples/*.json` は単体パック用のスキーマを使います。別の場所にパックJSONを置く場合は関連付けの `fileMatch` に追加してください。JSON本体へ `$schema` を加える方式は採用していません。設定本体の型・保存ハッシュをそのまま保ちます。

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

新規のrules-4では、decision_gameと追加パックの旧100点単位の効果値を[S-016](../docs/specs/decisions.md#10点スケールと選択の強化2026-09-17d-032)の式で10点スケールへ変換して適用する。保存済みのrules-3は同じ設定値を従来どおり適用する。金額と年齢は変換しない。

rules-5は同じ10点スケールを維持し、decision_gameの選択肢に任意のincome（万円、省略時0）を追加する。特殊イベントでは即時、通常判断では半年確定時に入金する。既存保存の設定は書き換えない。金額と受け入れ条件は[S-016](../docs/specs/decisions.md#家計の選択を強める2026-09-17d-033)。
