# 技術構成

2026-09-15。D-023で採用し、D-027でTanStack Startへ移行したReactブラウザ版。仕様の正本は[S-014](specs/web.md)、操作は[S-011](specs/cli.md)。

```text
React + TanStack Start（SPAモード / Router）+ TanStack Form + 8bitcn + Motion
                 ↓ Nano Stores / 公開応答
              Service.execute
              ↙             ↘
TypeScriptエンジン       Repository
育児・イベント・老後      ├ Dexie → IndexedDB（ブラウザ）
                      └ JSONファイル（Bun CLI）
```

- `config/`・`src/content/`：本編設定、追加パック、Valibotによる構造検査・合成。型はスキーマから導出し、ゲーム固有の参照整合性検査も行う。開始時に合成した設定を保存に固定する。[S-015](specs/content.md)、[設定ガイド](../config/README.md)を参照。
- `src/engine/`：入出力を持たない計算・観察・イベント。SHA-256の抽選と整数除算を維持。Reactや保存に依存しない。
- `src/service/`：公開操作、Valibotの入力スキーマ、revision、request-id、確定列の再生、保存ファイルの検証。UI・CLIで共有。
- `src/validation/`：ID・整数・辞書の共通Valibotスキーマ。D-025を参照。
- `src/storage/indexeddb.ts`：Dexieのreadwriteトランザクション内で読み取り・計算・保存。計算・ハッシュは同期処理で、IndexedDB以外の非同期処理をトランザクション中に挟まない。
- `src/storage/file.ts`：CLI用JSON保存。実行単位のロックディレクトリと一時ファイルからのrenameで、競合と部分書き込みを防ぐ。プロセスの強制終了で残るロックは、実行中プロセスがないことを確認後に手動除去する。
- `src/stores/game.ts`：画面用の公開応答、方針の保存基準、未保存フラグ、保存処理中・エラー。通常UIには隠しsnapshotを渡さない。
- `src/router.ts`・`src/routes/`：Startのルーターファクトリ、HTMLシェル、ホーム・プレイのURL。`vite.config.ts`のvirtual routesから`src/route_tree.gen.ts`を生成し、版管理する（手編集・整形対象外）。クリーンチェックアウト直後も型検査できる。
- `src/components/game/screens.tsx`：ホームとゲーム画面、未保存の離脱ガード。方針・選択・予測は共通サービスの契約を利用。ルートのシェルはゲーム状態に依存せず、IndexedDBアクセスは各画面のeffect・操作から行う。
- フォームの入力値はTanStack Formが保持する。新規開始は`start_form.tsx`、方針編集は`plan_editor.tsx`、取り込みは`import_form.tsx`。入力・説明・送信状態を限定して購読する。方針エディタはタブ変更でもマウントを維持する。原則と受け入れ条件は[D-026](decisions.md#d-026フォームにtanstack-formを原則使用する)、[S-013](specs/gui.md)。
- `src/components/game/`：方針編集（PlanEditor）、家族の状態（Family）、履歴（Timeline）、結末（Ending）。公開応答の表示と操作を担当する。`src/lib/labels.ts` は共通の表示名、`src/lib/scene.ts` は共通サービスが公開した情景文と季節を表示。画像は公開された設定参照から表示する。
- `src/components/ui/8bit/`：公式レジストリから取り込んだ8bitcnコンポーネント。出典・変更点・ライセンスは[外部ライセンス](../THIRD_PARTY_NOTICES.md)。
- `scripts/cli.ts`：Bunで動く単発JSON / JSON LinesのCLI。UIと同じサービスを呼ぶ。

VitePlusとbun.lockでツール・依存を固定する。`bun run lint`・`bun run check` はJSON Schema同期・JSON本体・コンテンツ整合性の検査を含む。`check`はさらに書式・lint・TypeScriptを検査する。Lefthookのpre-commitでステージ済みファイルの整形とlintを実行する。コマンドと導入手順は[README](../README.md#コミット前の検査)。StartのSPAモードはビルド時にHTMLシェルを生成する。Cloudflareへは `dist/client` のみをWorkers Static Assetsとして配信する。`dist/server`はシェル生成用で、現在の公開物には含めない。サーバーのゲームAPIやCloudflare DBは今回追加しない。SPAの直リンクは `assets.not_found_handling = single-page-application` で処理する。[公式Static Assets資料](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

旧Godot・Python・ローカルHTTP・SQLiteの実装は削除した。旧検証記録と調整仮値は歴史的資料として保持し、今回の検証とは分ける。IndexedDBはオリジン単位なのでlocalhostと公開サイトで別保存になる。JSONの書き出し・取り込みで移動できる。ブラウザ内のゲームであり、開発者ツールから隠し状態を見られない仕組みや改ざん防止は提供しない。

将来の部分SSRへの移行条件は[S-014](specs/web.md#startのspaモードd-0272026-09-15)、認証・購入検査の未決事項は[Q-017](open-questions.md#q-017ログイン購入検査と部分ssr)を参照。Startの公式スキルと取得元は[スキル一覧](../.agents/skills/README.md)。
