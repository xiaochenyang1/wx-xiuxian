export const CLIENT_CONFIG = {
  apiBaseUrl: "http://127.0.0.1:3000",
  sessionStorageKey: "cultivation-diary.session.v1",
  developmentAccountStorageKey: "cultivation-diary.dev-account.v1",
  bootstrapCacheStorageKey: "cultivation-diary.bootstrap-cache.v2",
  heartbeatIntervalSeconds: 30,
  requestTimeoutMilliseconds: 10_000,
} as const;
