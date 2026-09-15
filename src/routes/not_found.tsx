import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "../components/not_found";

// 未知URLもSPAシェルからhydrateするため、クライアントルートとして扱う。
export const Route = createFileRoute("/$")({
  ssr: false,
  component: NotFound,
});
