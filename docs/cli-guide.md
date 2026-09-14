# テキスト版の遊び方

必要環境はGodot 4.5.1とPython 3.9以上。追加のPythonパッケージは不要。Godotの導入方法は[README](../README.md)。

## 人が遊ぶ

プロジェクトのフォルダで実行する。

```sh
python3 -m kosodate play --run ./my-family.sqlite
```

初回は新しい人生、次からは同じ保存を再開する。別の人生は保存名を変える。

```sh
python3 -m kosodate play --run ./second-family.sqlite --scenario home-02 --seed 1
```

子どもの0歳から20歳まで半年ずつ進み、その後は親それぞれの老後と最期まで自動で振り返る。途中の選択と状態から5種類の結末に分岐する。

| 入力 | 操作 |
| --- | --- |
| 1〜4 | 方針をまとめて変更。内容と費用を確認してから確定できる |
| e | 仕事・関わり・休息・活動・支援などを項目ごとに編集 |
| a | 出来事への回答を変更 |
| c | 今の年代・支援に合わせて世話を均等に配分 |
| r | 方針を前期の確定案へ戻す。出来事の回答は保持 |
| n / Enter | 未回答の出来事を選んでから半年を確定 |
| h | これまでの人生を読む |
| ? | 遊び方を見る |
| q / Ctrl+C | 保存して中断。未確定の案も残る |

時間は親ごとに12単位。余った時間は予備で、休息は明示的に配分する。世話は必要量ちょうどにする。成長して必要量が変わったときは `c` が使える。活動は3歳から。資源が足りない案は保存できるが確定はできず、理由が表示される。

疲労、健康、仕事や趣味の充実、親子の会話、子どもの希望を見ながら選ぶ。子どもの気質や本心は数値で分からず、観察として伝わる。数値は作品内のルールであり、実際の子育てを予測するものではない。

## エージェントが遊ぶ

単発コマンドの標準出力はJSON1個。診断やGodotの起動ログを混ぜない。`--format text` で人向けにも読める。

```sh
python3 -m kosodate new --run ./trial.sqlite --scenario home-01 --seed 0 --request-id start
python3 -m kosodate actions --run ./trial.sqlite
python3 -m kosodate observe --run ./trial.sqlite
```

`actions.payload.plan_fields` と `choices` から入力項目と選択肢を取得する。`choose` の例：

```sh
printf '%s\n' '{"event_instance":"t01:E-01","option_id":"E-01:watch"}' | python3 -m kosodate choose --run ./trial.sqlite --revision 0 --request-id choice-1 --input -
python3 -m kosodate advance --run ./trial.sqlite --revision 1 --request-id turn-1
```

以後は返答の最新 `revision` を使う。`plan` へ部分JSONを渡し、必要な `choose` を行う。`public.forecast.can_advance` がtrueなら `advance`。終了すると `phase=finished` になり、`result` で親子の評価と結末を取得できる。

同じ入力の再送は同じrequest-idとrevisionで行う。入力を変更した再試行には新しいIDを使う。古い成功応答が再送された場合、最新状態は `observe` で取得する。エラーで状態や期数は進まない。

```sh
python3 -m kosodate history --run ./trial.sqlite --offset 0 --limit 10
python3 -m kosodate result --run ./trial.sqlite --format text
python3 -m kosodate replay --run ./trial.sqlite --out ./replayed.sqlite --request-id replay-1
```

## 大量のテストプレイ

```sh
python3 scripts/public_player.py --out ./playtests-local/new-comparison --seeds 3
```

公開CLIだけで5方針×3シードを通し、入力・公開出力・理由・結果・保存・再生結果を指定先へ残す。出力先は空にする。これは決定的な自動方針であり、独立したLLMの自由判断や人の面白さ評価を代替しない。

何度もGodotを起動する負荷を避けたい場合は `python3 -m kosodate serve` を使える。標準入力に1行1要求を送り、1行1応答を受ける。

```json
{"command":"observe","run":"./trial.sqlite"}
```

各応答は `{"response":通常のCLI応答,"exit_code":通常の終了コード}`。更新では `revision`、`request_id`、必要ならオブジェクト形式の `input` を指定する。ファイルパス形式の `--input` とは異なる。EOFで終了。各要求の保存と再送のルールは単発コマンドと同じ。内部snapshotや隠しパラメータを入力する操作はない。

通常プレイでは `debug-state`・DBの内容・ゲームソース・机上計算を判断に使わない。内部状態を確認した検証は、公開プレイのログと別に記録する。詳細な契約とエラーは[S-011](specs/cli.md)。
