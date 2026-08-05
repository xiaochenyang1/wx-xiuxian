import type { BootstrapSnapshot } from "@cultivation-diary/shared";
import { hasSameBootstrapIdentity } from "../core/ClientTypes";
import type { AppState, FeaturePanel, MainTab } from "../core/ClientTypes";

type StateListener = (state: Readonly<AppState>) => void;

export class AppStore {
  private state: AppState = {
    phase: "loading",
    syncStatus: "reconnecting",
    lastSuccessfulSyncAt: null,
    loadingMessage: "正在叩问仙门",
    errorMessage: null,
    bootstrap: null,
    selectedTab: "cultivation",
    activeFeature: null,
    featureMessage: null,
  };

  private readonly listeners = new Set<StateListener>();

  get snapshot(): Readonly<AppState> {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setLoading(message: string): void {
    this.update({
      phase: "loading",
      syncStatus: "reconnecting",
      loadingMessage: message,
      errorMessage: null,
    });
  }

  setCachedPreview(
    bootstrap: BootstrapSnapshot,
    lastSuccessfulSyncAt: string,
  ): void {
    this.update({
      phase: "ready",
      syncStatus: "reconnecting",
      lastSuccessfulSyncAt,
      bootstrap,
      errorMessage: null,
      selectedTab: "cultivation",
      activeFeature: null,
      featureMessage: null,
    });
  }

  setReady(bootstrap: BootstrapSnapshot, lastSuccessfulSyncAt?: string): void {
    const sameIdentity = hasSameBootstrapIdentity(this.state.bootstrap, bootstrap);
    this.update({
      phase: "ready",
      syncStatus: "online",
      ...(lastSuccessfulSyncAt === undefined
        ? sameIdentity
          ? {}
          : { lastSuccessfulSyncAt: null }
        : { lastSuccessfulSyncAt }),
      bootstrap: sameIdentity
        ? this.mergePendingOfflineSettlement(bootstrap)
        : bootstrap,
      errorMessage: null,
      ...(sameIdentity
        ? {}
        : {
            selectedTab: "cultivation" as const,
            activeFeature: null,
            featureMessage: null,
          }),
    });
  }

  replaceSnapshot(bootstrap: BootstrapSnapshot): void {
    const sameIdentity = hasSameBootstrapIdentity(this.state.bootstrap, bootstrap);
    this.update({
      phase: "ready",
      bootstrap: sameIdentity
        ? this.mergePendingOfflineSettlement(bootstrap)
        : bootstrap,
      errorMessage: null,
      ...(sameIdentity
        ? {}
        : {
            selectedTab: "cultivation" as const,
            activeFeature: null,
            featureMessage: null,
          }),
    });
  }

  markReconnecting(): void {
    if (!this.state.bootstrap) return;
    if (this.state.phase === "ready" && this.state.syncStatus === "reconnecting") return;
    this.update({
      phase: "ready",
      syncStatus: "reconnecting",
      errorMessage: null,
      featureMessage: null,
    });
  }

  markOffline(lastSuccessfulSyncAt?: string): void {
    if (!this.state.bootstrap) return;
    if (
      this.state.syncStatus === "offline" &&
      (lastSuccessfulSyncAt === undefined ||
        lastSuccessfulSyncAt === this.state.lastSuccessfulSyncAt)
    ) {
      return;
    }
    this.update({
      phase: "ready",
      syncStatus: "offline",
      ...(lastSuccessfulSyncAt === undefined ? {} : { lastSuccessfulSyncAt }),
      errorMessage: null,
      featureMessage: null,
    });
  }

  markOnline(lastSuccessfulSyncAt?: string): void {
    if (!this.state.bootstrap) return;
    this.update({
      phase: "ready",
      syncStatus: "online",
      ...(lastSuccessfulSyncAt === undefined ? {} : { lastSuccessfulSyncAt }),
      errorMessage: null,
    });
  }

  setError(message: string): void {
    this.update({ phase: "error", errorMessage: message });
  }

  setAuthenticationError(message: string): void {
    this.update({
      phase: "error",
      syncStatus: "reconnecting",
      lastSuccessfulSyncAt: null,
      bootstrap: null,
      errorMessage: message,
      selectedTab: "cultivation",
      activeFeature: null,
      featureMessage: null,
    });
  }

  selectTab(tab: MainTab): void {
    if (this.state.selectedTab !== tab) {
      this.update({ selectedTab: tab });
    }
  }

  openFeature(feature: FeaturePanel): void {
    this.update({ activeFeature: feature, featureMessage: null });
  }

  closeFeature(): void {
    this.update({ activeFeature: null, featureMessage: null });
  }

  setFeatureMessage(message: string | null): void {
    this.update({ featureMessage: message });
  }

  dismissOfflineSettlement(): void {
    if (!this.state.bootstrap?.offlineSettlement) return;
    this.update({
      bootstrap: { ...this.state.bootstrap, offlineSettlement: null },
    });
  }

  private update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private mergePendingOfflineSettlement(bootstrap: BootstrapSnapshot): BootstrapSnapshot {
    const pendingOfflineSettlement =
      bootstrap.offlineSettlement ?? this.state.bootstrap?.offlineSettlement ?? null;
    return pendingOfflineSettlement === bootstrap.offlineSettlement
      ? bootstrap
      : { ...bootstrap, offlineSettlement: pendingOfflineSettlement };
  }
}
