import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./route_tree.gen";
import { Loading } from "./components/loading";

export function getRouter() {
  return createRouter({ routeTree, defaultPendingComponent: Loading });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
