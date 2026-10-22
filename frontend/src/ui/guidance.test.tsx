import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { AboutDialog } from './AboutDialog';
import { TopBar } from './TopBar';
import { Tour } from './Tour';
import { TOUR_STEPS } from './tourSteps';
import { TOUR_KEY } from './tourStorage';

function stubMedia(compact: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: compact, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
}

/** Éléments ciblés par la visite, comme dans l'application. */
function Targets({ without = [] }: { readonly without?: readonly string[] }) {
  return <>{TOUR_STEPS.filter((s) => !without.includes(s.target)).map((s) => <div key={s.id} data-tour={s.target}>{s.id}</div>)}</>;
}

beforeEach(() => {
  stubMedia(false);
  window.localStorage.clear();
  useUiStore.setState(useUiStore.getInitialState(), true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Tour', () => {
  it('walks through the steps, then remembers it was seen', async () => {
    render(<><Targets /><Tour /></>);
    act(() => { useUiStore.getState().setTourActive(true); });

    expect(await screen.findByText(`Étape 1 sur ${TOUR_STEPS.length}`)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Visite guidée' }).textContent).toContain(TOUR_STEPS[0]?.title);
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
      expect(screen.getByText(`Étape ${i + 1} sur ${TOUR_STEPS.length}`)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));

    expect(useUiStore.getState().tourActive).toBe(false);
    expect(window.localStorage.getItem(TOUR_KEY)).toBe('done');
    expect(screen.queryByTestId('tour')).toBeNull();
  });

  it('goes back and skips on demand', async () => {
    render(<><Targets /><Tour /></>);
    act(() => { useUiStore.getState().setTourActive(true); });
    await screen.findByText(/Étape 1 sur/);
    expect(screen.queryByRole('button', { name: 'Précédent' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(screen.getByText(/Étape 1 sur/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }));

    expect(useUiStore.getState().tourActive).toBe(false);
    expect(window.localStorage.getItem(TOUR_KEY)).toBe('done');
  });

  it('is interrupted by Escape', async () => {
    render(<><Targets /><Tour /></>);
    act(() => { useUiStore.getState().setTourActive(true); });
    await screen.findByText(/Étape 1 sur/);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useUiStore.getState().tourActive).toBe(false);
  });

  it('skips the steps whose target is not on screen (replay bar in the demonstration)', async () => {
    render(<><Targets without={['replay']} /><Tour /></>);
    act(() => { useUiStore.getState().setTourActive(true); });

    expect(await screen.findByText(`Étape 1 sur ${TOUR_STEPS.length - 1}`)).toBeTruthy();
  });

  it('opens the drawer for the side panel step on a small screen, and closes it at the end', async () => {
    stubMedia(true);
    render(<><Targets /><Tour /></>);
    act(() => { useUiStore.getState().setTourActive(true); });
    await screen.findByText(/Étape 1 sur/);

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await vi.waitFor(() => { expect(useUiStore.getState().drawerOpen).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }));

    expect(useUiStore.getState().drawerOpen).toBe(false);
  });
});

describe('AboutDialog', () => {
  it('opens from the store and explains the threshold, the estimate and the limits', () => {
    render(<AboutDialog />);
    act(() => { useUiStore.getState().setAboutOpen(true); });

    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    const text = dialog?.textContent ?? '';
    for (const expected of ['3 véhicules', 'tirets', 'Ce qui n’est pas mesuré', 'Données périmées', 'OpenStreetMap']) {
      expect(text).toContain(expected);
    }
  });

  it('closes, and can relaunch the guided tour', () => {
    render(<AboutDialog />);
    act(() => { useUiStore.getState().setAboutOpen(true); });

    fireEvent.click(screen.getByRole('button', { name: 'Revoir la visite guidée' }));

    expect(useUiStore.getState().aboutOpen).toBe(false);
    expect(useUiStore.getState().tourActive).toBe(true);
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });
});

describe('TopBar', () => {
  it('offers the help and a drawer button that reflects its state', () => {
    render(<TopBar store={new StationStore(['A'])} />);
    const toggle = screen.getByRole('button', { name: 'Panneau des couches et des filtres' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(useUiStore.getState().drawerOpen).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Aide et à propos des données' }));
    expect(useUiStore.getState().aboutOpen).toBe(true);
  });
});
