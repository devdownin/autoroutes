/** Horloge virtuelle : temps historique = ancre + (temps réel écoulé × vitesse) ; pause et changement de vitesse sans saut. */
export class ReplayClock {
  private anchorVirtual: number;
  private anchorReal: number;
  private playing = false;

  constructor(start: number, private speedFactor: number, private readonly now: () => number = () => performance.now()) {
    this.anchorVirtual = start;
    this.anchorReal = now();
  }

  get speed(): number {
    return this.speedFactor;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  time(): number {
    return this.playing ? this.anchorVirtual + (this.now() - this.anchorReal) * this.speedFactor : this.anchorVirtual;
  }

  play(): void {
    if (!this.playing) {
      this.anchorReal = this.now();
      this.playing = true;
    }
  }

  pause(): void {
    this.anchorVirtual = this.time();
    this.playing = false;
  }

  setSpeed(speed: number): void {
    this.anchorVirtual = this.time();
    this.anchorReal = this.now();
    this.speedFactor = speed;
  }

  seek(time: number): void {
    this.anchorVirtual = time;
    this.anchorReal = this.now();
  }
}
