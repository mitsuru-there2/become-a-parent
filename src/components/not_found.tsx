import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <main id="main" className="loading">
      <h1>ページが見つかりません。</h1>
      <Link to="/">保存一覧へ</Link>
    </main>
  );
}
