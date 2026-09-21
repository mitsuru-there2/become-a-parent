# CLI・保存・公開情報の契約

## 現行ステージ方式の操作（D-068）

rules-13 / data-13 / save-14では[S-018](selection-tree.md)を優先します。`choose` は `choices` に公開された `crossroad-<group>` のルート、または通常の選択を即時確定し、その操作自体を保存・再生ログへ記録します。初回の `advance` は全カテゴリ確定後に利用できます。後続の岐路は前ステージのルートを自動継承し、追加の `choose` は不要です。`life.crossroad.changeable` はその岐路で任意に変更できるカテゴリを返します。`life.stage` / `stages` / `route_groups` / `crossroad` と各選択の `stages` / `routes` / `effect_details` で条件・対象期間・効果を発見できます。現行のコマンド一覧から`reset-plan`を除き、直接送信されても拒否します。旧保存の移行処理は追加しません。


[SPEC索引](../SPEC.md)のS-007・S-008・S-011を担当する。2026-09-15、cli-2 / save-2。D-023・[S-014](web.md)により旧Godot・Python・SQLiteの実装契約を置き換える。育児規則は[core](core.md)、成人後は[ending](ending.md)。

## S-008：技術構成と抽選

計算はTypeScriptの同期状態遷移。サービスが検査・保存・公開情報の整形を担う。ReactとCLIが同じサービスを呼ぶ。[構成](../architecture.md)を参照。

版はrules-1 / data-1 / ending-1を維持し、cli-2 / save-2へ更新。旧SQLiteと未知版は自動で読み替えない。

抽選は下記文字列のUTF-8 SHA-256の先頭8バイトを符号なしbig-endian整数として100の剰余を取る。末尾改行なし。数値計算では旧整数除算を `Math.trunc(a/b)` で再現する。

```text
rules-1|data-1|{seed}|{phase}|{index}|{slot}
```

seedは0〜4294967295。育児はphase=child、index=期、slot=oddity。成人はphase=adult、index=0のcareer/distance、index=節目のhealth-A/health-B。読み取りや編集で抽選を呼ばない。抽選キー・結果は内部履歴に記録し、通常の公開応答に含めない。

## S-011：操作

`bun run cli COMMAND --run ID`。保存ディレクトリは `--dir PATH`（既定 `.saves`）。標準出力にJSON1個を返す。`--help` は日本語の説明。人向けの対話端末はReact画面で置き換える。

| command            | 引数                             | 効果                                                                  |
| ------------------ | -------------------------------- | --------------------------------------------------------------------- |
| scenarios          | なし                             | 家庭のID・表示名・説明                                                |
| new                | run, scenario, seed, request_id  | 初期revision=0で開始。既存保存を上書きしない                          |
| observe / forecast | run                              | 公開状態と確定可否                                                    |
| selections            | run                              | payload.selectionsに全編集パス・値域・操作・入力例                       |
| plan               | run, revision, request_id, input | 部分編集を現在案にマージ                                              |
| choose             | 同上                             | 現在の出来事に対する回答案を保存                                      |
| reset-plan         | run, revision, request_id        | 前期の確定案へ戻す。回答は維持                                        |
| advance            | 同上                             | 全回答・資源条件を検査して半年を確定。40期で成人後まで一括計算        |
| history            | run, offset=0, limit=50          | 公開履歴を昇順に返す。limitは1〜200                                   |
| result             | run                              | finishedのみpayload.resultに最終結果                                  |
| replay             | run                              | 確定列をメモリで再計算しdigestを照合。元保存を変更しない              |
| debug-state        | run                              | 内部検証専用。snapshotをpayload.stateへ返す。通常プレイ・UIで呼ばない |

`input` はCLIではJSON文字列、JSON Linesではオブジェクト。planは空でない部分オブジェクト、chooseは `{event_instance,option_id}` の2文字列。値域・enumは[S-004](core.md)。小数、bool、NaN、範囲外、未知の編集項目を拒否する。活動なしはlevel=0、活動ありは1か2。資源不足の編集案も保存でき、確定時に止める。run/request_idはASCII英数字・ハイフン・下線の1〜64文字。

`serve` は1行1要求のJSON Lines。各要求は上表のオブジェクトとcommand。各出力は `{response,exit_code}`。1要求64KiBまで。EOFで終了する。JSONの重複キーはJavaScript標準パーサーに従い最後の値となるため、クライアントは重複キーを送らない。

CLI補助 `export --run ID --file PATH` と `import --file PATH` はブラウザと同じsave-2交換形式を扱う。importはファイル中のIDを使い、既存IDは拒否する。CLI補助の出力は `{ok,file}` または `{ok,run_id}`。

## 公開JSONの共通形

```json
{
  "api_version": "cli-2",
  "ok": true,
  "command": "observe",
  "run_id": "ID",
  "revision": 0,
  "phase": "childhood",
  "public": {},
  "choices": [],
  "payload": {},
  "error": null
}
```

正常・ゲーム操作の失敗とも10キーを持つ。保存を開けない場合はrun_id/revision/phase/public=null、choices=[]。errorは `{code,message,details:[{path,reason}]}`、失敗時のpayloadはnull。

publicはversions、time、cash、parents、couple、grandparents、observations、plan、answers、forecast。timeはcompleted_turns / next_turn / child_months / season / stage / school_label。finishedではcash/plan/forecastと次期情報がnull、answers=[]。育児の到達月齢は240で、親の年齢は最期の値。

観察は `{code,subject,text}`。子の適性・能力・信頼の真値・疲れの真値・抽選結果は公開しない。親はage_months/stress/health/fulfillment/social/regretを公開する。祖父母はhealth/relation/funds/networkを公開する。

choicesは `{instance_id,event_id,text,options}`。optionsは `{option_id,label,cost,income,available,reasons}`。availableは現在の案でその回答を置いたときの資源制限を表し、他イベントの未回答は除外する。配分調整が必要でも回答案として保存できる。

forecastはincome / cost / projected_cash / time_used（A/B）/ time_limit=12 / care_required / care_allocated / can_advance / reasons / uncertain_expense_cap=8 / fallback_plan。reasonsは `{code,path,message}`。未回答費用は0の暫定予測、未回答なら確定不可。fallback_planは読むだけでは適用されない。

更新のpayloadはreceiptとhistory_added。receiptはrequest_id / applied_revision / duplicate。resultはpayload.resultに[親別・子・結末・story](ending.md)を返す。historyはitems / next_offset / total。replayはmatched / compared_turns。

## S-007：履歴

履歴はindex / kind（turnまたはadult）/ turn / adult_step / ages / selections / events / money / observations / text / related / adult_result。

- 育児selectionsはplanとanswers（event_instance順）。成人はnull。
- agesはchild_months/A_months/B_months。親は最期で固定。
- moneyはscope / before / income / expense / cap_overflow / after。before + income − expense − cap_overflow = after。成人は生存親別の口座。
- eventsはinstance_id/event_id/option_id/text。relatedは遅延効果の元のinstance ID。
- adult_resultはalive / 今期最期を迎えた親の結果 / 子の結果。育児はnull。

## 保存・排他・再送

Runはid / revision / state / digest / commits / receipts / updated_at。stateに種・版・未確定案・前期案・回答・出来事・観察・予約・公開履歴・内部抽選・効果差分・最終結果を保持する。digestはstateをキー順に正規化したJSONのSHA-256。改ざん防止署名ではなく破損検出。

commitsはturn / plan / answers / 確定直後のstateのdigest。再生では新規初期状態へ確定列を適用し、各期のdigestを検査する。40期では老後・最期を含む。途中の編集案は再生対象外。

receiptsはrequest_idをキーに正規化要求と元応答を保存。同ID・同入力なら元応答のduplicateだけtrueにする。同ID・異入力はREQUEST_ID_CONFLICT。新ID・古いrevisionはSTALE_REVISION。失敗は成功台帳に残さない。

ブラウザはDexieのreadwriteトランザクションでRunを読み、検査・計算・台帳を1レコードとして書き込む。複数タブの更新はトランザクションとrevisionで排他。保存失敗・中断では中間状態を確定しない。CLIはファイルロックと原子的rename。ブラウザとCLIは同じsave-2書き出しを交換できるが、保存領域を直接共有しない。

## エラーと受け入れ

終了コード：0=成功、2=入力・未知操作、3=資源・未回答・finished/not-finished、4=revision/ID/既存保存/ロック競合、5=保存・版・IO、6=再生不一致。終了後の更新はFINISHED（既成功の同一再送を除く）。

AC-007：履歴の金額恒等式と操作・遅延元を追える。AC-008：同じ確定列の再生一致、再送と読み取りで進行が変わらない。AC-011：公開CLIで40期と成人後まで完走、競合は一方だけ成功、40期の途中状態を残さない。移植の追加条件は[S-014](web.md)。
