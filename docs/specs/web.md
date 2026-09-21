# S-014：TypeScriptブラウザ版への移行

2026-09-15追記：設定化後の保存・データ版は[S-015](content.md)が更新する。新規save-3に設定を保持し、従来のsave-2も読み込む。

2026-09-15。ユーザー指定の実装対象。D-023に基づき、S-008・S-011・S-013の技術構成・保存・起動方法をこの仕様で置き換える。育児・成人後の規則と公開情報は維持する。

- React / TanStack StartのSPAモード（内部のTanStack Routerを継続利用、D-027）。8bitcnのコンポーネント、Motion、Nano Storesを利用する。
- 入出力を持たないTypeScriptエンジンを共通サービスから呼ぶ。CLI・Reactは同じ公開操作を使い、UIにゲームルールを複製しない。
- ブラウザはDexie / IndexedDBに実行・更新台帳・確定記録を保存。更新時のrevision比較、同一request-idの再送、状態・履歴・成人後の一括確定を維持する。CLIは同じサービスに原子的JSONファイル保存アダプタを接続する。
- rules-1/data-1/ending-1とSHA-256の抽選を維持。新しい保存はsave-2、操作契約はcli-2。旧SQLiteの自動移行は行わない。書き出し・取り込みは新形式のJSONで行い、ブラウザとCLIで交換できる。未知の版・破損は拒否する。
- 新規・保存一覧・再開・全方針編集・回答・確定・履歴・結果・書き出し／取り込みを画面から操作できる。編集は明示的に保存するまで確定不可。隠し内部状態を通常画面へ渡さない。
- VitePlusとStartプラグインでdev/build、VitePlusでlint/format/type check、bunで依存管理。Cloudflare Workers Static Assetsへ`dist/client`のみを配信し、SPAの直リンクを生成した`index.html`へ解決する。
- Godot・Python・旧HTML/JS GUI・旧起動スクリプト・不要なツール実体を削除する。仕様・検証履歴・採用済み画像は保持する。

## 受け入れ条件

2026-09-21（D-071）：Cloudflareの公開先を`https://become-a-parent-beta-8kua.therethere.studio`に固定する。Worker名は`become-a-parent`を継続し、WranglerのCustom Domainで指定する。`workers.dev`とバージョンプレビューURLは無効化し、`dist/client`だけを静的配信する。`bun run deploy`はビルドから公開まで、`bun run deploy:check`はビルドと公開なしのdry-run、`bun run deploy:login`と`bun run deploy:whoami`は認証と認証先確認を行う。

2026-09-16：ChatGPT Sitesにも同じ`dist/client`を静的配信する。設定は`.openai/hosting.json`で管理し、SPAの直リンクは`index.html`へ解決する。初回は本人限定のアクセスで配置する。保存は引き続きブラウザのIndexedDBを使用し、別オリジンの保存は書き出し／取り込みで移す。

- AC-014-A：既存5パターン200期と成人後の値が参照データに一致する。5結末、遅延、資源境界、公開情報の隔離を検証する。
- AC-014-B：CLIで開始から40期・老後・結末まで進み、確定列の再生が一致する。
- AC-014-C：IndexedDB再開・同一再送・古いrevision・保存失敗・破損／未知版拒否を検証する。失敗は状態を確定しない。
- AC-014-D：ブラウザで開始・選択・方針編集・確定・再読込・履歴・結果まで操作でき、狭い画面とキーボードに対応する。
- AC-014-E：VitePlusの静的検査・テスト・ビルドとWranglerのdry-runを通す。公開デプロイは認証先を確認できた場合に実施し、未実施なら明記する。
- AC-014-G：指定Custom Domainを含む設定でdry-runが成功する。公開時は指定HTTPS URLのホーム、JavaScript・CSS・画像、プレイURLへの直接アクセスと再読込を確認する。公開できない場合は認証・ドメインなど未確認の前提を検証記録へ残す。

## StartのSPAモード（D-027、2026-09-15）

- Startの`spa.enabled: true`を使用する。ビルド時にルートのHTMLシェルを生成し、ゲーム画面と保存へのアクセスはブラウザで実行する。リクエストごとのSSR・ログイン・購入検査は今回の実装範囲に含めない。
- ホーム`/`とプレイ`/play/$runId`のURLを維持する。各画面ルートを`ssr: false`とし、ルートのdocument shellにはIndexedDBやゲーム状態を読み込む処理を置かない。生成ルートを利用し、virtual routesでURLとlower_snake_caseのファイル名を分離する。
- 未知URLは`/$`のクライアントルートで案内を表示し、保存一覧へ戻れる。静的SPAのHTTP応答は200。シェルからのhydrationで、ルートの即時not-found描画との不一致が起きないようにする。
- ブラウザの保存先名・スキーマ・データ版を維持し、同一オリジンの既存保存を引き続き開く。CLI・共通サービスの規則と保存処理は変更しない。
- 将来の部分SSRではSPA配信設定とサーバー実行環境を追加変更する。ログイン・DLC権利はサーバーで検証する設計とし、ブラウザの保存やルート遷移ガードだけを権限判定の根拠にしない。詳細方式は後続の仕様化対象。
- AC-014-F：Startのビルドでシェルとclient assetsを生成できる。静的配信でホーム・プレイURLの直接アクセス、再読込・保存再開・未知URLの案内を確認し、画面のconsoleにエラーがない。公開UIで40期・結末・書き出し／取り込みの回帰検証と既存CLIテストを通す。
