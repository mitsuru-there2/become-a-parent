# TanStack公式スキル

2026-09-15にTanStack公式リポジトリから取得。Codexのプロジェクトスキルとして次のターンから利用可能。

- `react-start/`（Reactの入口と付属のserver-components）：`TanStack/router/packages/react-start/skills/react-start`
- `start-core/`（基礎・実行境界・配信・server functions・認証など）：`TanStack/router/packages/start-client-core/skills/start-core`
- 取得元コミット：`8e164d28f9e9eb1a7301109230d7ece9817492a8`
- ライセンス：同コミットのMIT Licenseを`TANSTACK_LICENSE`に同梱。
- ローカル変更：同梱範囲外を指す相対リンクのみ、取得元コミットのGitHub URLへ変更。本文・サブスキル構造は維持。自動整形の対象外。

原典：
- [React Start](https://github.com/TanStack/router/tree/8e164d28f9e9eb1a7301109230d7ece9817492a8/packages/react-start/skills/react-start)
- [Start Core](https://github.com/TanStack/router/tree/8e164d28f9e9eb1a7301109230d7ece9817492a8/packages/start-client-core/skills/start-core)

## Formの確認結果

同日に公式`TanStack/form`のmain（`e066b93afaa49f708843672a54ec1f53ec92490e`）の完全なGitツリーと公式サイトの公開情報を確認したが、`SKILL.md`は見つからなかった。第三者のスキルを公式扱いで導入していない。Form改修時はD-026と[公式Reactガイド](https://tanstack.com/form/latest/docs/framework/react/overview)を参照する。

スキル記載のlibrary_versionと採用パッケージの版は一致するとは限らない。実装時は`package.json`・`bun.lock`と現在の公式ドキュメント/APIを確認する。本作はStartのSPAモード＋IndexedDBであり、スキル内のサーバーDB例を既存ゲーム保存に適用しない。将来のログイン・購入検査はS-014と後続仕様に従う。
