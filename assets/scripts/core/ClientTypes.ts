import type { AuthTokens, BootstrapSnapshot } from "@cultivation-diary/shared";

export type MainTab = "cultivation" | "partner" | "ranking" | "cave";
export type FeaturePanel = "techniques" | "equipment" | "inventory" | "tasks";

export type LoginIntent =
  | { kind: "development"; accountId: string }
  | { kind: "wechat"; code: string };

export interface StoredSession extends AuthTokens {}

export interface AppState {
  phase: "loading" | "ready" | "error";
  loadingMessage: string;
  errorMessage: string | null;
  bootstrap: BootstrapSnapshot | null;
  selectedTab: MainTab;
  activeFeature: FeaturePanel | null;
  featureMessage: string | null;
}

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse<T> {
  statusCode: number;
  data: T;
}
