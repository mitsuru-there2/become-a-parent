# 親伝説 — Become a Parent

0歳から20歳まで半年ずつ選択し、親ごとの老後と最期まで振り返る、Reactのブラウザゲーム。毎期の特殊イベントと3つの判断を選び、家族の暮らしを作ります。5種類の通常結末に加え、離婚・一家離散でのゲームオーバーがあります。

## 起動

Bun 1.3.14以上とNode.js 22.12以上を用意します。

```sh
bun install --frozen-lockfile
bun run dev
```

表示されたローカルURLをブラウザで開きます。React / TanStack Start（SPAモード、内部でTanStack Routerを使用）/ TanStack Form / 8bitcn / Motion / Nano Stores / Dexie / IndexedDBを使用。VitePlusが開発・ビルド・静的検査を担当します。Godot・Pythonは不要です。

保存はブラウザごとに保持されます。別の端末への移動は、画面の「書き出し」と「保存ファイルを取り込む」を使います。旧SQLite保存の取り込みには対応していません。

## 検証とデプロイ

```sh
bun run check
bun run test
bun run build
bun run deploy:check
```

### コミット前の検査

`bun install`でLefthookのGitフックを自動設定します。手動で再設定する場合は`bun run hooks:install`を実行します。

コミット時は、ステージ済みの対象ファイルを整形して再ステージし、続けて`bun run lint`を実行します。JSON違反・lintのエラーや警告があればコミットを中止します。部分ステージの未選択変更は保持します。formatの対象外は`docs/`・`assets/`・取得した公式スキル・自動生成ルートです。

| コマンド               | 内容                                                 |
| ---------------------- | ---------------------------------------------------- |
| `bun run lint`         | JSON検査とコードのlint・型検査                       |
| `bun run check`        | JSON検査と書式・lint・型検査                         |
| `bun run lint:json`    | 生成スキーマの同期、JSON本体、設定の整合性・画像参照 |
| `bun run format`       | 書式の自動修正                                       |
| `bun run format:check` | 書式の検査のみ                                       |

JSONの検査対象は[エディタの関連付け](.vscode/settings.json)に従います。スキーマ変更後は`bun run schema:generate`を実行してください。検証結果は[開発計画](docs/development-plan.md#コミット前の検査2026-09-15)を参照。

`bun run build`はStartのSPAシェルを`dist/client/index.html`へ生成します。`bun run preview`で確認できます。ビルド時のシェル生成にはローカルポートの待受が必要です。Cloudflareへは`dist/client`のみを配信します。

Cloudflare Workers Static Assetsの設定は `wrangler.jsonc`。公開先は `become-a-parent` です。認証後にデプロイできます。

```sh
bunx wrangler login
bun run deploy
```

2026-09-15の作業ではdry-runまで確認済み。Cloudflareの既存認証が期限切れのため、公開URLは未作成です。

CLIは `bun run cli --help`。[操作例](docs/cli-guide.md)、[ゲーム画面の使い方](docs/gui-guide.md)、[構成](docs/architecture.md)、[移植の検証記録](docs/playtests/2026-09-15-web.md)、[仕様](docs/SPEC.md)を参照してください。

## ゲーム設定・難易度・追加パック

イベント、本文、画像参照、確率、主な費用と3段階の難易度はJSONで調整できます。追加家庭・行動・イベントのパックも登録できます。[編集・登録ガイド](config/README.md)と[仕様 S-015](docs/specs/content.md)を参照してください。購入機能は将来の実装対象です。

## TanStack公式スキル

Startの`react-start`と`start-core`を[プロジェクトスキル](.agents/skills/README.md)に導入しました。取得元と固定コミットを記録しています。Formの公式スキルは2026-09-15の確認範囲では見つからず、導入していません。
