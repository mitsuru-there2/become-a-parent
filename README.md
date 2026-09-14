# 親伝説 — Become a Parent

![親伝説 — Become a Parent HERO](assets/marketing/hero.png)

子育てのあるあると予想外の人生を楽しむ、Godot製のテキストゲーム。0歳から20歳まで半年ずつ選択し、親それぞれの老後と最期まで振り返ります。選択と状態に応じた5種類のエンディングがあります。

現在はテキスト版・CLIを実装済み。正式HEROを採用し、今後のイラスト制作の基準を[アートディレクション](docs/art-direction.md)にまとめています。ゲーム画面のビジュアル化はこれからです。

## 遊ぶ

このフォルダで実行します。

```sh
python3 -m kosodate play --run ./my-family.sqlite
```

macOSでは [play.command](play.command) をターミナルで実行しても起動できます。初回は開始、次回は同じ保存から再開します。`q` で中断できます。

| 操作 | 内容 |
| --- | --- |
| 1〜4 | 方針をまとめて変更 |
| e | 仕事・関わり・休息・活動などを個別編集 |
| c | 年代に合わせて世話を配分 |
| n / Enter | 出来事を選び、半年を確定 |
| h / ? / q | 履歴／遊び方／中断 |

別の人生を始めるときは保存名を変えます。詳細は[遊び方・CLIガイド](docs/cli-guide.md)。

## 必要環境

- Godot 4.5.1（GDScript版、.NET不要）
- Python 3.9以上。追加パッケージ不要
- 動作確認：macOS / Apple Silicon

この作業環境にはGodotを `.tools/Godot.app` に導入済みです。別の環境では[公式アーカイブ](https://godotengine.org/download/archive/4.5.1-stable/)から導入し、`godot` / `godot4` をPATHに置くか、実行ファイルを指定します。

```sh
export GODOT_BIN="/Applications/Godot.app/Contents/MacOS/Godot"
```

`.tools/Godot.app/Contents/MacOS/Godot` も自動検出します。導入後のプレイにネットワーク接続は不要です。

## CLIとテストプレイ

```sh
python3 -m kosodate new --run ./trial.sqlite --scenario home-01 --seed 0 --request-id start
python3 -m kosodate actions --run ./trial.sqlite
python3 -m kosodate observe --run ./trial.sqlite
python3 -m kosodate --help
```

エージェントはJSONの公開状態・選択肢から `plan` / `choose` / `advance` を操作します。保存再開、request-idによる再送、確定操作の `replay` に対応しています。

```sh
python3 -m unittest discover -s tests -v
python3 scripts/public_player.py --out ./playtests-local/my-comparison --seeds 3
```

50プレイ・2,000ターンと全件の再生一致、5種類の結末への到達を検証済み。記録は[検証報告](docs/playtests/2026-09-14.md)。独立LLMや人の面白さ評価はこれから行います。

## 開発文書

- [文書運用](docs/README.md) / [ゲーム企画](docs/game-concept.md)
- [SPECと実装対応表](docs/SPEC.md) / [技術構成](docs/architecture.md)
- [開発計画](docs/development-plan.md) / [仕様策定の記録](docs/specification-plan.md)
- [意思決定](docs/decisions.md) / [未決事項と調整課題](docs/open-questions.md)

実装担当者は最初に [AGENTS.md](AGENTS.md) と文書運用を確認してください。ゲームの数値は作品内のルールであり、現実の育児・寿命・幸福を予測するモデルではありません。
