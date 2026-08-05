export type LifecycleSyncReason = "periodic" | "hide" | "show";

export interface LifecycleRenderToken {
  readonly revision: number;
}

export interface LifecycleSyncCallbacks<T> {
  readonly intervalSeconds: number;
  schedule(callback: () => void, intervalSeconds: number): void;
  unschedule(callback: () => void): void;
  persistCurrentSnapshot(): void;
  canStartSync(): boolean;
  setSyncInFlight(inFlight: boolean): void;
  started?(reason: LifecycleSyncReason, allowRender: boolean): void;
  sync(reason: LifecycleSyncReason): Promise<T>;
  recover(error: unknown): Promise<T | null>;
  accept(result: T, allowRender: boolean): void;
  reject?(error: unknown, allowRender: boolean): void;
}

export class LifecycleSyncCoordinator<T> {
  private started = false;
  private foreground = true;
  private scheduled = false;
  private destroyed = false;
  private syncInFlight = false;
  private foregroundRetryRequested = false;
  private lifecycleRevision = 0;
  private foregroundSyncPending = false;
  private backgroundSyncPending = false;

  readonly periodicTick = (): void => {
    if (
      !this.started ||
      this.destroyed ||
      !this.foreground ||
      this.syncInFlight ||
      !this.callbacks.canStartSync()
    ) {
      return;
    }
    void this.runSync("periodic");
  };

  constructor(private readonly callbacks: LifecycleSyncCallbacks<T>) {}

  start(): void {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.startSchedule();
  }

  handleHide(): void {
    if (!this.started || this.destroyed || !this.foreground) return;

    this.foreground = false;
    this.lifecycleRevision += 1;
    this.foregroundSyncPending = false;
    this.backgroundSyncPending = true;
    this.stopSchedule();
    this.callbacks.persistCurrentSnapshot();
    this.drainPendingSync();
  }

  handleShow(): void {
    if (!this.started || this.destroyed || this.foreground) return;

    this.foreground = true;
    this.lifecycleRevision += 1;
    this.backgroundSyncPending = false;
    this.foregroundSyncPending = true;
    this.startSchedule();
    this.drainPendingSync();
  }

  notifySyncAvailable(): void {
    if (!this.destroyed) this.drainPendingSync();
  }

  requestForegroundSync(): void {
    if (this.destroyed || !this.started || !this.foreground) return;
    if (this.syncInFlight) {
      this.foregroundRetryRequested = true;
      return;
    }
    if (this.foregroundSyncPending) return;
    this.foregroundSyncPending = true;
    this.drainPendingSync();
  }

  captureRenderToken(): LifecycleRenderToken | null {
    return this.destroyed || !this.foreground
      ? null
      : { revision: this.lifecycleRevision };
  }

  canRender(token: LifecycleRenderToken | null): boolean {
    return (
      token !== null &&
      !this.destroyed &&
      this.foreground &&
      token.revision === this.lifecycleRevision
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.foregroundSyncPending = false;
    this.backgroundSyncPending = false;
    this.foregroundRetryRequested = false;
    this.stopSchedule();
  }

  private startSchedule(): void {
    if (this.scheduled || this.destroyed) return;
    this.callbacks.schedule(this.periodicTick, this.callbacks.intervalSeconds);
    this.scheduled = true;
  }

  private stopSchedule(): void {
    if (!this.scheduled) return;
    this.callbacks.unschedule(this.periodicTick);
    this.scheduled = false;
  }

  private drainPendingSync(): void {
    if (this.syncInFlight || !this.callbacks.canStartSync()) return;

    if (this.foreground && this.foregroundSyncPending) {
      this.foregroundSyncPending = false;
      void this.runSync("show");
      return;
    }
    if (!this.foreground && this.backgroundSyncPending) {
      this.backgroundSyncPending = false;
      void this.runSync("hide");
    }
  }

  private async runSync(reason: LifecycleSyncReason): Promise<void> {
    const startedInForeground = this.foreground;
    const startedAtRevision = this.lifecycleRevision;
    this.syncInFlight = true;
    this.callbacks.setSyncInFlight(true);
    this.callbacks.started?.(reason, startedInForeground);
    let completedSuccessfully = false;

    try {
      let result: T | null = null;
      let failure: unknown;
      try {
        result = await this.callbacks.sync(reason);
      } catch (error) {
        failure = error;
        if (!this.destroyed) {
          try {
            result = await this.callbacks.recover(error);
          } catch (recoveryError) {
            failure = recoveryError;
            result = null;
          }
        }
      }

      if (!this.destroyed) {
        const allowRender =
          startedInForeground && this.foreground && startedAtRevision === this.lifecycleRevision;
        if (result !== null) {
          completedSuccessfully = true;
          this.callbacks.accept(result, allowRender);
        } else if (failure !== undefined) {
          this.callbacks.reject?.(failure, allowRender);
        }
      }
    } finally {
      this.syncInFlight = false;
      if (this.foregroundRetryRequested) {
        if (!completedSuccessfully && this.foreground) this.foregroundSyncPending = true;
        this.foregroundRetryRequested = false;
      }
      this.callbacks.setSyncInFlight(false);
      if (!this.destroyed) this.drainPendingSync();
    }
  }
}
