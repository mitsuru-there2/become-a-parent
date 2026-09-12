# CLI・保存・公開情報の契約

[SPEC索引](../SPEC.md)のS-007・S-008・S-011を担当する規範仕様。状態：実装対象・未実装。記載コマンドは将来実装する契約で、現在は実行できない。

## S-008：技術構成

Python 3.12以上を対象とし、標準ライブラリのargparse/json/sqlite3/hashlib/uuid/pathlibを使用する初版設計。外部依存、外部AI API、ネットワーク接続はゲーム実行に不要。起動形は `python -m kosodate`。macOS/Linuxのローカルファイルで検証する。対応OSの製品保証と配布形式はP-RELEASEで決める。

計算は入出力を持たない状態遷移、イベントはID付きデータ、CLIは入力検査・保存・公開情報の整形を担当する。Python/JSONの辞書順・組込みhash・randomの内部状態にゲームの抽選を依存させない。描画を含めず、後に共通の状態遷移をビジュアル版から呼べる構造にする。

抽選関数は次のバイト列をUTF-8化してSHA-256を計算し、先頭8バイトを符号なしbig-endian整数として100の剰余を取る。

```text
rules-1|data-1|{seed}|{phase}|{index}|{slot}
```

seedは0〜4294967295の十進整数、phase/index/slotは仕様に指定された文字列・十進整数。前後の空白・末尾改行なし。育児のphaseはchild、index=t、slot=oddity。成人のphase=adult、index=0ではcareer/distance、index=kではhealth-A/health-B。読み取りでは抽選関数を呼ばず、保存済みの観察・結果を返す。抽選を使ったキーとRは内部履歴に記録する。抽選は呼出回数に依存せず、編集・イベント分岐が独立した珍事をずらさない。

版は `rules-1`、`data-1`、`cli-1`、`save-1`。初版では未知の版の読込を拒否し、自動移行・古いルールへの黙った読替えはしない。規則を変えたらrules、初期値・係数・イベント文を変えたらdata、公開契約の破壊的変更はcli、保存構造の破壊的変更はsaveを増分する。

## S-011：コマンド

全コマンドは非対話、既定出力はJSON。`--format text` で同じ公開情報を日本語に整形する。標準出力はJSON1個と改行、診断は標準エラー。色・TTY・プロンプト・ページャーは不要。`--help` はテキストの使用方法を返し、終了コード0。

| コマンド | 必須・任意引数 | 効果・返す固有データ |
| --- | --- | --- |
| scenarios | なし | home-01/02のIDと表示名。隠し初期値・BPの推奨手順は出さない |
| new | --run PATH --scenario ID --seed INT --request-id ID | 新規DB作成、t=1の観察と出来事を開く。初期revision=0 |
| observe | --run PATH | 公開状態・観察・現在のplan |
| actions | --run PATH | 編集可能な項目、値域、イベント選択肢、必要引数 |
| forecast | --run PATH | 現在案の収支・時間・確定可否・公開の違反理由 |
| plan | --run PATH --revision INT --request-id ID --input FILE | JSONの部分案をマージ。依存する費用・時間を再計算 |
| choose | 上記のrun/revision/request-id/input | event_instanceとoption_idの回答案を保存。回答変更可 |
| reset-plan | --run PATH --revision INT --request-id ID | planを前期の確定案へ戻す。イベント回答は維持 |
| advance | --run PATH --revision INT --request-id ID | 現在案と全回答を一度確定。40期では成人後と最期まで計算 |
| history | --run PATH [--offset INT] [--limit INT] | 既定offset=0,limit=50、limitは1〜200。公開履歴を昇順で返す |
| result | --run PATH | finishedなら最終結果。途中ならNOT_FINISHED |
| replay | --run SOURCE --out NEW_PATH --request-id ID | 保存された確定操作列を別DBへ再生して照合。元DBは変更しない |
| debug-state | --run PATH | 内部状態・抽選キー・効果差分。通常プレイ用には使わない |

PATHはローカルSQLiteファイル、親ディレクトリは既存でなければならない。FILEはUTF-8 JSONファイル、`-` なら標準入力。入力上限64KiB、未知のキー・重複JSONキー・NaN・小数・boolを整数として渡すことを拒否。IDはASCII英数字と `_-`、1〜64文字（request-id）。イベントID内のコロンは別のID型として許可する。

`plan --input` のルートは `{"parents":...,"activity":...,"style":...,"help":...}`。いずれも省略可だが最低1フィールド必須。parentsにはA/Bを部分指定でき、work/care/bond/rest/selfも部分指定。activityはdomain/level/sponsorの部分指定。マージ後の整合性（noneとlevel等）は必須。nullでの削除は不可。全enumと値域は[S-004](core.md)を正本とする。

`choose --input` は `{"event_instance":"t01:E-01","option_id":"E-01:watch"}` の2文字列のみ。現在提示されたinstanceと、そのinstanceに属するoptionのみ受理する。

## 公開JSONの共通形

全コマンド・成功失敗とも、以下の10キーを必ず返す。該当しない値はnullまたは指定の空配列で、キーを黙って省略しない。数値は特記したもの以外すべて整数。

```json
{
  "api_version": "cli-1",
  "ok": true,
  "command": "observe",
  "run_id": "UUID文字列",
  "revision": 0,
  "phase": "childhood",
  "public": {},
  "choices": [],
  "payload": {},
  "error": null
}
```

- commandは上表のコマンド名。構文解析前の不明コマンドは渡された文字列、コマンド自体なしは空文字。
- run_idはnewでUUID4を生成。ゲームの結果には使わない。runを読めない場合null。
- revisionは0以上、保存された更新成功ごとに+1。読めなければnull。phaseはchildhood/finished、読めなければnull。成人の中間状態を入力待ち状態として保存しない。
- publicは下記の完全な公開状態、runがなければnull。replayの応答は新しい実行のrun_id/revision/phase/publicを使う。エラーでもrunが正常なら最新の公開状態を返す。内部情報は含めない。
- choicesは現在のイベント配列。各要素は `{instance_id,event_id,text,options}`。optionsは `{option_id,label,cost,income,available,reasons}` の配列。cost/incomeは万円、availableは今期案にその回答を置いた場合の公開資源による可否。reasonsは `{code,path,message}` の配列。余裕不足でもchooseで案として選べるが、確定はできない。
- payloadはコマンド固有データ。エラーならnull。
- errorは成功ならnull、失敗なら `{code,message,details}`。detailsは `{path,reason}` の配列。例外スタックや保存内容は含めない。

publicの型は次で固定する。

| キー | 型・内容 |
| --- | --- |
| versions | `{rules:string,data:string,save:string}` |
| time | `{completed_turns:int,next_turn:intまたはnull,child_months:int,season:stringまたはnull,stage:stringまたはnull,school_label:stringまたはnull}`。finishedではnext_turn/season/stage/school_label=null、child_months=240（育児の到達点） |
| cash | 育児中はM、finishedではnull。最終の口座はresultに示す |
| parents | A/Bそれぞれ `{age_months,stress,health,fulfillment,social,regret}`。finishedでは各最期の値 |
| couple | K |
| grandparents | `{health,relation,funds,network}`。finishedでは20歳時点の記録 |
| observations | `{code,subject,text}` の配列。subjectはchild/A/B/study/craft、codeはS-003の名前。finishedでは20歳時点の最後の公開観察 |
| plan | S-004の全項目を持つ現在案。finishedではnull |
| answers | `{event_instance,option_id}` の配列、instance順。finishedでは[] |
| forecast | 下記、finishedではnull |

forecastは `{income,cost,projected_cash,time_used:{A,B},time_limit:12,care_required,care_allocated,can_advance,reasons,uncertain_expense_cap:8,fallback_plan}`。incomeは既知の援助込み。未回答のイベントの費用・収入は0として暫定表示し、未回答を理由にcan_advance=false。負のprojected_cashも表示する。fallback_planは世話をceil/floorで分けたS-004の無料修正案で、他の選択肢の指定はせず、未回答イベントには費用0の選択が必要と理由を出す。forecastを読むだけでは適用しない。

payloadの型：

| コマンド | payload |
| --- | --- |
| scenarios | `{scenarios:[{id,label,description}]}`。home-01「基本の家庭」、home-02「もう一つの家庭」。両方とも「子ども1人の人生を通す」。気質の数値やhome-02の攻略は非公開 |
| new / plan / choose / reset-plan / advance | `{receipt:{request_id,applied_revision,duplicate:falseまたはtrue},history_added:[公開履歴要素]}`。編集ではhistory_added=[] |
| observe / forecast | `{}`。必要情報はpublic |
| actions | `{commands:[{id,required_args}],plan_fields:[{path,type,enum,min,max,required_with}],input_examples:{plan,choose}}`。該当しないenum/min/max/required_withはnull。公開の値域のみ。全編集フィールドとchooseの形式を発見できること |
| history | `{items:[公開履歴要素],next_offset:intまたはnull,total:int}` |
| result | `{parents:{A:親の結果,B:親の結果},child:子の結果,story:[string]}` |
| replay | `{source_run_id,new_run_id,matched:bool,compared_turns:int,compared_adult_steps:int}`。不一致はREPLAY_MISMATCHのエラーで内部差分はdebugのみ |
| debug-state | `{debug_only:true,state:内部snapshot,draws:[{phase,index,slot,value}],effects:[内部差分]}`。このコマンドだけは非公開項目を許可 |

親の結果は `{death_age,happiness,axes:{relationship,security,fulfillment,child_assurance,regret},cash,health,label}`。子の結果は `{age,domain,route,social_success,residence,happiness,autonomy}`。子の最終年齢は最後の節目。各親死亡時の子の評価は対応する履歴にも残す。

## S-007：履歴

公開履歴の各要素は `{index,kind,turn,adult_step,ages,actions,events,money,observations,text,related}`。indexは0始まり連番、kindはturn/adult、turnは育児なら1〜40で成人ならnull、adult_stepは育児ならnullで成人なら1〜8。agesは `{child_months:int,A_months:int,B_months:int}` の月齢。亡くなった親の月齢は最期で固定。

actionsは育児では `{plan,answers}`、成人ではnull。eventsは `{instance_id,event_id,option_idまたはnull,text}` の配列。moneyは育児 `{scope:"household",before,income,expense,cap_overflow,after}` を1要素、成人は生存親ごとの同形（scope=A/B）を持つ配列。before+income−expense−cap_overflow=afterを満たす。成人の不足分はexpenseを実際の口座支出に制限し、縮小額はtextに書く。observationsは公開観察配列、textは文字列配列、relatedは過去のinstance IDの配列。

成人のtextにはS-009の節目結果と死亡した親の点・内訳を含む。JSONで数値を再解析しなくてよいよう、成人要素に `adult_result`（育児はnull）を追加し、`{alive:{A:bool,B:bool},parents:{A:親の結果またはnull,B:親の結果またはnull},child:子の結果}` を持たせる。parentsは今期死亡した親だけ非null。

子どもの変化は観察として示し、内部式や真値の差を説明文に混ぜない。遅延効果はrelatedで過去の選択を参照し、「ゲーム内でのつながり」として示す。historyの再読・ページ切替は状態を進めない。

## 保存・排他・再送

一実行一SQLiteファイル。保存形式save-1は次の3テーブル。JSONは `ensure_ascii=false,sort_keys=true,separators=(',',':'),allow_nan=false` 相当の正規化UTF-8文字列で保持する。

- `run(id TEXT PRIMARY KEY, save_version TEXT, revision INTEGER, snapshot_json TEXT)`：1行。snapshotに全状態辞書、seed、各版、phase、初期scenario、前期案、編集案、未回答・回答、観察、予約、内部抽選記録・差分、公開履歴、成人中間計算・最終結果を含む。外部キャッシュを再開の前提にしない。
- `receipts(request_id TEXT PRIMARY KEY, request_json TEXT, response_json TEXT)`：成功更新の入力と出力。newとreplayも含む。
- `commits(turn INTEGER PRIMARY KEY, plan_json TEXT, answers_json TEXT, digest TEXT)`：確定済みの育児期1〜40。snapshotの当期ゲーム状態を正規化してSHA-256。含む状態は辞書のゲーム値、前期案、予約、出来事履歴、成人結果。run_id/revision/編集操作台帳/時刻/ファイルパスは除外する。

更新は `BEGIN IMMEDIATE`、busy_timeout=5000ms、synchronous=FULL、journal_mode=DELETE。検査・履歴・台帳・snapshot更新を一トランザクションでCOMMIT。中断前にCOMMITしなければ再開時に前の状態、していれば新しい状態。readは読取専用接続でスナップショットを得て、保存や新規ファイル作成をしない。

同じrequest-idの検索をrevision検査より先に行う。正規化入力（command・期待revision・入力JSON・newのscenario/seed、replayの元run_idを含む。出力formatとパス表記は除く）が同じなら、保存済み応答をreceipt.duplicate=trueに変えて返す。古い応答のrevision/publicを最新と偽らない。異なる入力で同じIDならREQUEST_ID_CONFLICT。未知IDでrevisionが古ければSTALE_REVISION。失敗は台帳に成功として保存しない。内容を修正する再試行は新しいIDを使う。

new/replayは新規ファイルを排他的に作成し、既存DBを上書きしない。同じ保存先で同じ成功request-id・同じ入力の再送だけ例外として元の応答を返す。DB作成途中に中断され、有効なrun行もreceiptもないファイルはINCOMPLETE_RUNとして拒否。自動削除せず新しい保存先を使える。ゲーム状態があるDBを壊して作り直す操作は設けない。

replayは元DBを一貫した読取スナップショットとして読み、初期条件とcommitsを新しい実行へ順に適用する。tごとにdigest一致を検査し、40まであれば成人結果も含める。途中のSOURCEならその確定期までを再生し、未確定の編集案は再生しない。元のid/revisionと一致することを要求しない。保存形式・版の不一致は計算前に拒否。不一致の新DBは診断用として残すが、matched=trueにはしない。

## エラーと終了コード

| 終了コード | error.code | 条件 |
| ---: | --- | --- |
| 0 | null | 成功・同一再送 |
| 2 | INVALID_INPUT / UNKNOWN_COMMAND / UNKNOWN_ACTION | JSON、型、値域、未提示instance、知らない選択肢 |
| 3 | RESOURCE_LIMIT / ANSWER_REQUIRED / FINISHED / NOT_FINISHED | 確定時の資源不足、未回答、終了後更新、未終了result |
| 4 | STALE_REVISION / REQUEST_ID_CONFLICT / RUN_EXISTS / RUN_LOCKED | 競合・既存保存先・ロックタイムアウト |
| 5 | RUN_NOT_FOUND / INCOMPLETE_RUN / CORRUPT_SAVE / VERSION_MISMATCH / IO_ERROR | 保存・版・読書き失敗 |
| 6 | REPLAY_MISMATCH / INTERNAL_ERROR | 再生差異・内部不整合 |

複数エラー時は、構文→保存・版→request-id再送→revision→phase→回答→資源の順。資源の理由はすべて返し、pathで特定する。low幸福や親の死亡は正常終了0。

## 操作例と受け入れ条件

```text
python -m kosodate new --run ./trial.sqlite --scenario home-01 --seed 0 --request-id start-01
python -m kosodate actions --run ./trial.sqlite
python -m kosodate choose --run ./trial.sqlite --revision 0 --request-id choose-01 --input choice.json
python -m kosodate advance --run ./trial.sqlite --revision 1 --request-id advance-01
python -m kosodate observe --run ./trial.sqlite
```

choice.jsonは先述のE-01:watch。choose後revision=1、advance後=2。次のobserveのrevisionを使って編集する。同じadvance-01/revision1を再送してもrevision=2の元応答を返し、2期目には進まない。3期目などに進んでから同じ再送をしても元応答を返すので、最新値が必要ならobserveする。

AC-007：履歴の金額恒等式、操作・instance・遅延参照を追える。textとJSONで公開情報が一致し、JSON文字列からパラメータを推測する必要がない。

AC-008：同一条件・確定操作列の再生digest一致。読み取り10回、再送、中断の前後で変わらない。新ID・古いrevisionは失敗。保存不完全・不明版の読込で元DBを変更しない。

AC-011：new→actions→plan/choose→advance→resultまでJSONだけで完走。2つの更新が同revisionで競合した場合、一方だけ受理。40期確定中に中断しても育児完了だけが保存された中間状態を作らない。終了後のplan/choose/reset-plan/advanceはFINISHED（既に成功した同一ID再送を除く）。
