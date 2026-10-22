export type QualityLevel = 0 | 1 | 2;

export interface FrameLoopOptions {
  /** Budget par image ; une fenêtre dont la durée moyenne d'image le dépasse est « lente ». */
  readonly budgetMs?: number;
  readonly windowFrames?: number;
  readonly degradeAfterWindows?: number;
  readonly recoverAfterWindows?: number;
  readonly onQualityChange?: (level: QualityLevel) => void;
  readonly requestFrame?: (callback: (now: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
}

/**
 * Boucle requestAnimationFrame qui s'arrête dès qu'il n'y a plus rien à animer (CPU nul au repos)
 * et dégrade la qualité si le budget d'image est dépassé durablement :
 * 0 = complet, 1 = sans halos, 2 = sans transitions et mises à jour de carte espacées.
 */
export class FrameLoop {
  private handle: number | null = null;
  private lastFrame: number | null = null;
  private windowSumMs = 0;
  private windowCount = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private level: QualityLevel = 0;
  private readonly budgetMs: number;
  private readonly windowFrames: number;
  private readonly degradeAfterWindows: number;
  private readonly recoverAfterWindows: number;
  private readonly requestFrame: (callback: (now: number) => void) => number;
  private readonly cancelFrame: (handle: number) => void;

  constructor(
    private readonly tick: (now: number, quality: QualityLevel) => boolean,
    private readonly options: FrameLoopOptions = {},
  ) {
    this.budgetMs = options.budgetMs ?? 20;
    this.windowFrames = options.windowFrames ?? 30;
    this.degradeAfterWindows = options.degradeAfterWindows ?? 3;
    this.recoverAfterWindows = options.recoverAfterWindows ?? 60;
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? ((handle) => { cancelAnimationFrame(handle); });
  }

  get quality(): QualityLevel {
    return this.level;
  }

  get running(): boolean {
    return this.handle !== null;
  }

  wake(): void {
    if (this.handle === null) {
      this.lastFrame = null;
      this.handle = this.requestFrame(this.frame);
    }
  }

  stop(): void {
    if (this.handle !== null) {
      this.cancelFrame(this.handle);
      this.handle = null;
    }
  }

  private readonly frame = (now: number): void => {
    this.handle = null;
    if (this.lastFrame !== null) {
      this.measure(now - this.lastFrame);
    }
    this.lastFrame = now;
    if (this.tick(now, this.level)) {
      this.handle = this.requestFrame(this.frame);
    }
  };

  /** Moyenne par fenêtres fixes : décision stable, insensible à une image isolée (GC, changement d'onglet). */
  private measure(frameMs: number): void {
    this.windowSumMs += frameMs;
    if (++this.windowCount < this.windowFrames) {
      return;
    }
    const slow = this.windowSumMs / this.windowCount > this.budgetMs;
    this.windowSumMs = 0;
    this.windowCount = 0;
    if (slow) {
      this.fastWindows = 0;
      if (++this.slowWindows >= this.degradeAfterWindows && this.level < 2) {
        this.setLevel((this.level + 1) as QualityLevel);
      }
    } else {
      this.slowWindows = 0;
      if (++this.fastWindows >= this.recoverAfterWindows && this.level > 0) {
        this.setLevel((this.level - 1) as QualityLevel);
      }
    }
  }

  private setLevel(level: QualityLevel): void {
    this.level = level;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.options.onQualityChange?.(level);
  }
}
