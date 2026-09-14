# 技術構成

2026-09-15。D-023で採用したReactブラウザ版。仕様の正本は[S-014](specs/web.md)、操作は[S-011](specs/cli.md)。

```text
React + TanStack Router（SPA）+ 8bitcn + Motion
                 ↓ Nano Stores / 公開応答
              Service.execute
              ↙             ↘
TypeScriptエンジン       Repository
育児・イベント・老後      ├ Dexie → IndexedDB（ブラウザ）
                      └ JSONファイル（Bun CLI）
```

- `src/engine/`：入出力を持たない計算・観察・イベント。SHA-256の抽選と整数除算を維持。Reactや保存に依存しない。
- `src/service/`：公開操作、入力検査、revision、request-id、確定列の再生、保存ファイルの検証。UI・CLIで共有。
- `src/storage/indexeddb.ts`：Dexieのreadwriteトランザクション内で読み取り・計算・保存。計算・ハッシュは同期処理で、IndexedDB以外の非同期処理をトランザクション中に挟まない。
- `src/storage/file.ts`：CLI用JSON保存。実行単位のロックディレクトリと一時ファイルからのrenameで、競合と部分書き込みを防ぐ。プロセスの強制終了で残るロックは、実行中プロセスがないことを確認後に手動除去する。
- `src/stores/game.ts`：画面用の公開応答、編集案、保存処理中・エラー。通常UIには隠しsnapshotを渡さない。
- `src/main.tsx`：ホームとゲーム画面、TanStack RouterのURL。方針・選択・予測は共通サービスの契約を利用。`src/lib/scene.ts` は年代・季節だけで情景文を表示。
- `src/components/ui/8bit/`：公式レジストリから取り込んだ8bitcnコンポーネント。出典・変更点・ライセンスは[外部ライセンス](../THIRD_PARTY_NOTICES.md)。
- `scripts/cli.ts`：Bunで動く単発JSON / JSON LinesのCLI。UIと同じサービスを呼ぶ。

VitePlusとbun.lockでツール・依存を固定する。`bun run check` は書式・lint・TypeScript検査。CloudflareへはVitePlusの `dist` をWorkers Static Assetsとして配信する。サーバーのゲームAPIやCloudflare DBは不要。SPAの直リンクは `assets.not_found_handling = single-page-application` で処理する。[公式Static Assets資料](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

旧Godot・Python・ローカルHTTP・SQLiteの実装は削除した。旧検証記録と調整仮値は歴史的資料として保持し、今回の検証とは分ける。IndexedDBはオリジン単位なのでlocalhostと公開サイトで別保存になる。JSONの書き出し・取り込みで移動できる。ブラウザ内のゲームであり、開発者ツールから隠し状態を見られない仕組みや改ざん防止は提供しない。
