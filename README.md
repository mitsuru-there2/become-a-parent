# 親伝説 — Become a Parent

0歳から20歳まで半年ずつ選択し、親ごとの老後と最期まで振り返る、Reactのブラウザゲーム。5種類の結末があります。

## 起動

Bun 1.3.14以上とNode.js 22.12以上を用意します。

```sh
bun install --frozen-lockfile
bun run dev
```

表示されたローカルURLをブラウザで開きます。React / TanStack Router（SPA）/ 8bitcn / Motion / Nano Stores / Dexie / IndexedDBを使用。VitePlusが開発・ビルド・静的検査を担当します。Godot・Pythonは不要です。

保存はブラウザごとに保持されます。別の端末への移動は、画面の「書き出し」と「保存ファイルを取り込む」を使います。旧SQLite保存の取り込みには対応していません。

## 検証とデプロイ

```sh
bun run check
bun run test
bun run build
bun run deploy:check
```

Cloudflare Workers Static Assetsの設定は `wrangler.jsonc`。公開先は `become-a-parent` です。認証後にデプロイできます。

```sh
bunx wrangler login
bun run deploy
```

2026-09-15の作業ではdry-runまで確認済み。Cloudflareの既存認証が期限切れのため、公開URLは未作成です。

CLIは `bun run cli --help`。[操作例](docs/cli-guide.md)、[ゲーム画面の使い方](docs/gui-guide.md)、[構成](docs/architecture.md)、[移植の検証記録](docs/playtests/2026-09-15-web.md)、[仕様](docs/SPEC.md)を参照してください。
