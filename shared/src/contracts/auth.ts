import type { BootstrapSnapshot } from "./bootstrap";

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthLoginResult {
  isNewPlayer: boolean;
  tokens: AuthTokens;
  bootstrap: BootstrapSnapshot;
}

export interface RefreshSessionResult {
  tokens: AuthTokens;
  bootstrap: BootstrapSnapshot;
}
