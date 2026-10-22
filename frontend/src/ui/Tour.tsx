import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUiStore } from '../state/uiStore';
import { TOUR_STEPS } from './tourSteps';
import { markTourSeen } from './tourStorage';
import { placeCard } from './tourPlacement';
import type { Placement, Rect } from './tourPlacement';
import { useCompact } from './useCompact';

const CARD_WIDTH = 320;

function targetOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${id}"]`);
}

/**
 * Visite guidée de première visite : une carte par étape, ancrée à l'élément décrit, qui reste mise en évidence.
 * Échap ou « Passer » l'interrompt ; elle n'est plus proposée ensuite (réactivable depuis l'aide).
 */
export function Tour() {
  const active = useUiStore((s) => s.tourActive);
  const setActive = useUiStore((s) => s.setTourActive);
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen);
  const compact = useCompact();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  // Les étapes dont la cible n'existe pas (relecture masquée en démonstration, par exemple) sont sautées.
  const steps = useMemo(() => (active ? TOUR_STEPS.filter((s) => targetOf(s.target) !== null) : []), [active]);
  const step = steps[index];

  const finish = useCallback(() => {
    markTourSeen();
    setActive(false);
    setDrawerOpen(false);
    setIndex(0);
  }, [setActive, setDrawerOpen]);

  // Cible mesurée à chaque étape et à chaque redimensionnement ; le tiroir a le temps de glisser avant la mesure.
  useEffect(() => {
    if (step === undefined) {
      return undefined;
    }
    if (step.opensDrawer === true && compact) {
      setDrawerOpen(true);
    }
    const measure = () => {
      const element = targetOf(step.target);
      const box = element?.getBoundingClientRect();
      setRect(box === undefined ? null : { left: box.left, top: box.top, width: box.width, height: box.height });
    };
    const timer = setTimeout(measure, step.opensDrawer === true && compact ? 300 : 0);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure); };
  }, [step, compact, setDrawerOpen]);

  useLayoutEffect(() => {
    if (card.current !== null && step !== undefined) {
      setPlacement(placeCard(rect, { width: window.innerWidth, height: window.innerHeight },
        { width: Math.min(CARD_WIDTH, window.innerWidth - 24), height: card.current.offsetHeight }));
    }
  }, [rect, step, index]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    next.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); };
  }, [active, index, finish]);

  if (!active || step === undefined) {
    return null;
  }
  const last = index === steps.length - 1;
  return (
    <div className="tour" data-testid="tour">
      <div className="tour-shield" aria-hidden="true" />
      {rect !== null && (
        <div className="tour-ring" aria-hidden="true"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />
      )}
      <div ref={card} className="tour-card" role="dialog" aria-label="Visite guidée" aria-describedby="tour-body"
        style={{ left: placement?.left ?? 0, top: placement?.top ?? 0, width: Math.min(CARD_WIDTH, window.innerWidth - 24), visibility: placement === null ? 'hidden' : 'visible' }}>
        <p className="tour-step">Étape {index + 1} sur {steps.length}</p>
        <h2>{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="icon-button" onClick={finish}>Passer</button>
          <span className="tour-spacer" />
          {index > 0 && <button type="button" className="icon-button" onClick={() => { setIndex(index - 1); }}>Précédent</button>}
          <button ref={next} type="button" className="icon-button primary" onClick={() => { if (last) finish(); else setIndex(index + 1); }}>
            {last ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
}
