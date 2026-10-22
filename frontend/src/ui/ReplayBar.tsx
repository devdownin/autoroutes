import { useState } from 'react';
import { replayProgress } from '../replay/progress';
import { useUiStore } from '../state/uiStore';
import { formatTime } from './format';

export const SPEEDS = [1, 10, 60, 300] as const;
const DURATIONS = [30, 60, 180, 360] as const;

/** Valeur par défaut du champ datetime-local : il y a deux heures, à la minute, dans le fuseau du poste. */
function defaultStart(): string {
  const date = new Date(Date.now() - 2 * 3_600_000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export interface ReplayControls {
  readonly start: (from: Date, durationMinutes: number, speed: number) => void;
  readonly playPause: () => void;
  readonly setSpeed: (speed: number) => void;
  readonly backToLive: () => void;
}

/**
 * Relecture en barre de lecture au pied de la carte (comme un lecteur vidéo) : le panneau latéral reste réservé aux filtres.
 * En direct : un bouton qui déploie le choix de la période ; en relecture : lecture, vitesse, avancement, retour au direct.
 */
export function ReplayBar({ controls }: { readonly controls: ReplayControls }) {
  const mode = useUiStore((s) => s.mode);
  const replay = useUiStore((s) => s.replay);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(defaultStart);
  const [duration, setDuration] = useState<number>(60);
  const [speed, setSpeed] = useState<number>(60);

  if (mode === 'live') {
    return (
      <section className="replay-bar" aria-label="Relecture de l'historique" data-tour="replay">
        {!open
          ? <button type="button" className="icon-button" aria-expanded="false" onClick={() => { setOpen(true); }}>⏪ Relecture</button>
          : (
            <div className="replay-form">
              <label>Début <input type="datetime-local" aria-label="Début de relecture" value={start} onChange={(e) => { setStart(e.target.value); }} /></label>
              <label>Durée
                <select aria-label="Durée de relecture" value={duration} onChange={(e) => { setDuration(Number(e.target.value)); }}>
                  {DURATIONS.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>)}
                </select>
              </label>
              <label>Vitesse
                <select aria-label="Vitesse de relecture" value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); }}>
                  {SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}
                </select>
              </label>
              <button type="button" className="icon-button primary" onClick={() => { controls.start(new Date(start), duration, speed); }}>
                Lancer la relecture
              </button>
              <button type="button" className="icon-button" aria-expanded="true" aria-label="Replier la relecture" onClick={() => { setOpen(false); }}>✕</button>
              {replay.status === 'error' && replay.error !== null && <span className="status-danger" role="alert">{replay.error}</span>}
              <span className="note">7 derniers jours, données observées minute par minute.</span>
            </div>
          )}
      </section>
    );
  }
  const progress = replayProgress(replay.time, replay.from, replay.to);
  return (
    <section className="replay-bar replay-active" aria-label="Relecture de l'historique">
      <button type="button" className="icon-button" onClick={controls.playPause} disabled={replay.status === 'loading'}>
        {replay.status === 'playing' ? '⏸ Pause' : '▶ Lecture'}
      </button>
      <select aria-label="Vitesse de relecture" value={replay.speed} onChange={(e) => { controls.setSpeed(Number(e.target.value)); }}>
        {SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}
      </select>
      <progress className="replay-progress" max={1} value={progress} aria-label="Avancement de la relecture" />
      <span className="replay-time">{formatTime(replay.time)}</span>
      <button type="button" className="icon-button" onClick={controls.backToLive}>Retour au direct</button>
      <span className="note" aria-live="polite">
        {replay.status === 'loading' ? 'Chargement de l’historique…' : replay.status === 'ended' ? 'Fin de la période' : null}
      </span>
    </section>
  );
}
