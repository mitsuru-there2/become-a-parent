# 技術構成

2026-09-14。Godotをエンジンとするテキスト版と、CLIに接続するGUI。技術選定の理由は[D-017・D-021](decisions.md)、操作と保存の正本は[S-008・S-011](specs/cli.md)、GUIは[S-013](specs/gui.md)。

```text
ブラウザGUI（HTML/CSS/JS → ローカルHTTP）
                  ↓
日本語の対話プレイ / 単発JSON CLI / JSON Lines
                  ↓
kosodate（Python標準ライブラリ）
  入力検査・公開表示・SQLiteトランザクション
                  ↓ ローカルの標準入出力
Godot 4.5.1 / game/bridge.gd
  simulation.gd → events.gd / adult.gd
  育児・観察・費用予測・抽選・出来事・老後・評価
```

GUI、対話プレイ、JSON CLI、JSON Linesは、いずれも `Service.execute` のクライアント。ゲームの計算はすべてGDScript。Pythonの方針プリセットは入力補助で、GUIも同じ関数を共有する。GUIの情景文は公開情報に基づく表示専用の文章。外部サービスは使わず、Godotの導入後はインターネット接続不要。

## ファイル

- [simulation.gd](../game/simulation.gd)：初期化、観察、出来事提示、資源予測、育児の確定。
- [events.gd](../game/events.gd)：安定IDを持つイベント本文、選択肢、即時・遅延効果。
- [adult.gd](../game/adult.gd)：進路、5年ごとの老後、各親の最期、5軸評価、結末。
- [bridge.gd](../game/bridge.gd)：ヘッドレス実行用の非公開通信。
- [service.py](../kosodate/service.py)：SQLite、原子的更新、再送、再生、公開応答。
- [contract.py](../kosodate/contract.py)：入力スキーマ、値域、エラー、actions。
- [play.py](../kosodate/play.py) / [text.py](../kosodate/text.py)：日本語の対話操作と公開情報の表示。
- [gui.py](../kosodate/gui.py)：ローカルHTTP、公開コマンドの許可リスト、起動時の保存先、CLIサービスへの接続。
- [web/app.js](../kosodate/web/app.js)：公開応答の画面化、フォーム、選択、再送と競合の表示。
- [web/scene.js](../kosodate/web/scene.js)：公開される年代・季節から情景文を選ぶ表示モジュール。
- [public_player.py](../scripts/public_player.py)：公開CLIだけを使う自動プレイヤー。

## 境界

Godotに渡す内部snapshotは非公開。返ってきた状態を保存し、公開CLIには明示的に組み立てた `view` だけを返す。`debug-state` だけは内部情報を返す。テスト用のfixture操作は非公開ブリッジにあり、公開CLIからは呼べない。

通信は要求のUTF-8バイト長を12桁のASCIIで送ってから本文を送る。Godotの標準入力は読み取りが分割され得るため、指定長まで連結する。返答はJSON1行。日本語や長い履歴を読み取りサイズで切らない。[Godotの標準入力仕様](https://docs.godotengine.org/en/4.5/classes/class_os.html#class-os-method-read-buffer-from-stdin)を参照。

GodotはJSONの数値をfloatとして読むため、非公開の入力を受けた段階で整数へ復元する。公開入力の小数・boolを整数として受け入れることはPython側で拒否する。乱数はSHA-256の先頭8バイトを剰余計算し、符号付き64bitのオーバーフローを避ける。

SQLiteの更新ロック取得から、検査・Godotの計算・履歴・receipt・snapshot保存まで一つのトランザクション。Godotが途中で止まった場合はCOMMITされない。40期目の老後も同じトランザクションに含む。snapshotにSHA-256整合性情報を付け、破損を計算へ渡す前に検出する（改ざん防止の署名ではない）。

## GUIの境界と今後の追加

`python3 -m kosodate gui --run 保存先` で、ブラウザのゲーム画面を起動する。GUIから渡せる操作・引数を許可リストで絞り、指定保存以外のファイル操作とdebug-stateは公開しない。ループバックへのバインド、Host・Origin・セッショントークンの確認を行う。HTTP要求は複数接続に対応し、共通サービスとGodotへの呼び出しはロックで直列化する。

更新は既存revision・request-idで実行する。フロントエンドは処理中の更新を止め、不明な通信結果は同一IDで再試行する。未確認の要求はタブのsessionStorageにも残す。SQLiteの保存・復元・再生はすべて既存CLIの処理を通す。

新しいゲーム機能は仕様 → CLI実装 → CLI検証 → UI対応の順に進める。フォームの値域はactions、予測・制限はforecast、出来事の本文・選択肢はchoicesを利用し、フロントエンドへ条件式を転記しない。UIの日本語ラベルが必要な新フィールドは、CLIの追加後に対応する。

画像は情景領域の `data-scene-media` へ表示を追加できる。情景文は `scene.js`、画面配置はHTML/CSSに分離してあり、描画追加でゲーム処理を変更する必要はない。Godotネイティブシーンと配布用アプリ化は未実装。イベントの追加時は安定ID、仕様、データ版と影響するテストを同時に更新する。

製品版の公開先・販売方針は[D-022](decisions.md#d-022steamモバイルと無料本編追加セットの販売方針を採用する)で更新した。ここに記したPython・ローカルHTTP・ブラウザの構成は現行GUIの実装であり、製品版への採用を確定したものではない。移植の技術構成と現行GUIの扱いは[Q-016](open-questions.md#q-016steamモバイルへの提供方法)で検討する。
