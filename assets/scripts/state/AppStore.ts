import type { BootstrapSnapshot } from "@cultivation-diary/shared";
import type { AppState, FeaturePanel, MainTab } from "../core/ClientTypes";

type StateListener = (state: Readonly<AppState>) => void;

export class AppStore {
  private state: AppState = {
    phase: "loading",
    storageStatus: "saved",
    lastSavedAt: null,
    loadingMessage: "正在展开本地仙卷",
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
      loadingMessage: message,
      errorMessage: null,
      activeFeature: null,
      featureMessage: null,
    });
  }

  setReady(
    bootstrap: BootstrapSnapshot,
    lastSavedAt: string,
    storageStatus: AppState["storageStatus"] = "saved",
  ): void {
    const identityChanged =
      this.state.bootstrap !== null &&
      this.state.bootstrap.player.id !== bootstrap.player.id;
    this.update({
      phase: "ready",
      storageStatus,
      lastSavedAt,
      bootstrap,
      errorMessage: null,
      ...(identityChanged
        ? {
            selectedTab: "cultivation" as const,
            activeFeature: null,
            featureMessage: null,
          }
        : {}),
    });
  }

  replaceSnapshot(
    bootstrap: BootstrapSnapshot,
    lastSavedAt = this.state.lastSavedAt,
    storageStatus = this.state.storageStatus,
  ): void {
    this.update({
      phase: "ready",
      bootstrap,
      lastSavedAt,
      storageStatus,
      errorMessage: null,
    });
  }

  setStorageStatus(
    storageStatus: AppState["storageStatus"],
    lastSavedAt = this.state.lastSavedAt,
  ): void {
    this.update({ storageStatus, lastSavedAt });
  }

  setError(message: string): void {
    this.update({ phase: "error", errorMessage: message });
  }

  selectTab(tab: MainTab): void {
    if (this.state.selectedTab !== tab) this.update({ selectedTab: tab });
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
}
