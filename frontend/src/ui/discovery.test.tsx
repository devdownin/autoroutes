import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_OD_VIEW } from '../od/odTypes';
import type { StationCollection } from '../map/referentiel';
import type { StationMetrics } from '../realtime/protocol';
import { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { ActivityPanel } from './ActivityPanel';
import { Legend } from './Legend';
import { SearchBox } from './SearchBox';
import { StationDetail } from './StationDetail';
import { formatCount } from './format';

vi.mock('../history/historyApi', () => ({
  stationSeries: vi.fn(() => Promise.resolve([
    { t: 0, entries: 1, exits: 1 }, { t: 900, entries: 2, exits: 2 }, { t: 1800, entries: 6, exits: 4 },
  ])),
}));

const stations: StationCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [4.8, 45.7] }, properties: { id: 'A', name: 'La Boisse', kind: 'ECHANGEUR', axes: 'A0042', dept: '01', lanes: 4 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.4, 43.3] }, properties: { id: 'B', name: 'Marseille', kind: 'ECHANGEUR', axes: 'A0007', dept: '13', lanes: 4 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [4.9, 44.9] }, properties: { id: 'C', name: 'Montélimar', kind: 'ECHANGEUR', axes: 'A0007', dept: '26', lanes: 4 } },
  ],
};

const metrics = (stationId: string, entries: number, exits: number): StationMetrics => ({
  stationId, last5m: { entries: 0, exits: 0 }, last15m: { entries: 0, exits: 0 },
  last1h: { entries, exits }, today: { entries, exits }, lastEventTime: null,
});

beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });
afterEach(cleanup);

describe('SearchBox', () => {
  const setup = () => {
    const onFocusStation = vi.fn();
    const onFocusAxis = vi.fn();
    render(<SearchBox stations={stations} onFocusStation={onFocusStation} onFocusAxis={onFocusAxis} />);
    return { onFocusStation, onFocusAxis, input: screen.getByRole('searchbox') };
  };

  it('opens the first result with Enter and clears the field', () => {
    const { input, onFocusStation } = setup();

    fireEvent.change(input, { target: { value: 'marse' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onFocusStation).toHaveBeenCalledWith(1);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('proposes a motorway and hands over its group', () => {
    const { input, onFocusAxis } = setup();

    fireEvent.change(input, { target: { value: 'A7' } });
    fireEvent.click(within(screen.getByRole('list', { name: 'Résultats de la recherche' })).getAllByRole('button')[0] as HTMLElement);

    expect(onFocusAxis).toHaveBeenCalledOnce();
    expect(onFocusAxis.mock.calls[0]?.[0]).toMatchObject({ id: 'A7', value: 'A0007', stations: [1, 2] });
  });

  it('moves through the results with the arrow keys and back to the field', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'a7' } });
    const list = screen.getByRole('list', { name: 'Résultats de la recherche' });
    const buttons = within(list).getAllByRole('button');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(input);
  });

  it('says so when nothing matches', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: 'zzzz' } });

    expect(screen.getByRole('status').textContent).toContain('Aucun résultat');
  });
});

describe('ActivityPanel', () => {
  it('lists the busiest stations with a trend and opens a station on click', async () => {
    useUiStore.setState({ openSection: 'activity' });
    const store = new StationStore(['A', 'B', 'C']);
    store.replaceAll([metrics('A', 10, 5), metrics('B', 300, 100), metrics('C', 0, 0)]);
    const onFocus = vi.fn();

    render(<ActivityPanel stations={stations} store={store} onFocus={onFocus} />);
    const list = screen.getByRole('list', { name: 'Gares les plus actives' });

    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Marseille'), expect.stringContaining('La Boisse')]);
    await waitFor(() => { expect(within(list).getAllByRole('img')).toHaveLength(2); });
    expect(within(list).getAllByRole('img')[0]?.getAttribute('aria-label')).toMatch(/au plus haut, en hausse/);
    fireEvent.click(within(list).getByRole('button', { name: /Marseille/ }));
    expect(onFocus).toHaveBeenCalledWith(1);
  });

  it('shows an empty state before any passage', () => {
    useUiStore.setState({ openSection: 'activity' });

    render(<ActivityPanel stations={stations} store={new StationStore(['A', 'B', 'C'])} onFocus={vi.fn()} />);

    expect(screen.getByText('Aucun passage sur l’heure')).toBeTruthy();
  });
});

describe('StationDetail flows', () => {
  const store = () => {
    const s = new StationStore(['A', 'B', 'C']);
    s.replaceAll([metrics('A', 10, 5)]);
    return s;
  };
  const view = {
    ...EMPTY_OD_VIEW,
    flows: [{ originId: 'A', destinationId: 'B', vehicles: 12 }, { originId: 'C', destinationId: 'A', vehicles: 30 }, { originId: 'B', destinationId: 'C', vehicles: 90 }],
  };

  it('lists the flows of the selected station and focuses the map on one', () => {
    useUiStore.setState({ selectedIndex: 0, layers: { ...useUiStore.getState().layers, od: true }, odView: view });
    const onFocusFlow = vi.fn();

    render(<StationDetail stations={stations} store={store()} onFocusFlow={onFocusFlow} />);
    const list = screen.getByRole('list', { name: 'Principaux flux de la gare' });

    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Depuis Montélimar30 véh.', 'Vers Marseille12 véh.']);
    fireEvent.mouseEnter(within(list).getByRole('button', { name: /Depuis Montélimar/ }));
    expect(useUiStore.getState().highlightedFlow).toEqual({ originId: 'C', destinationId: 'A' });
    fireEvent.click(within(list).getByRole('button', { name: /Vers Marseille/ }));
    expect(onFocusFlow).toHaveBeenCalledWith({ originId: 'A', destinationId: 'B' });
  });

  it('offers to show the flow layer when it is off', () => {
    useUiStore.setState({ selectedIndex: 0 });

    render(<StationDetail stations={stations} store={store()} onFocusFlow={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les flux O/D' }));

    expect(useUiStore.getState().layers.od).toBe(true);
  });

  it('explains that department-level flows do not name stations', () => {
    useUiStore.setState({ selectedIndex: 0, layers: { ...useUiStore.getState().layers, od: true }, odView: { ...view, level: 'DEPARTMENT' } });

    render(<StationDetail stations={stations} store={store()} onFocusFlow={vi.fn()} />);

    expect(screen.getByText(/regroupés par départements/)).toBeTruthy();
  });

  it('says when the station has no flow of at least 3 vehicles', () => {
    useUiStore.setState({ selectedIndex: 0, layers: { ...useUiStore.getState().layers, od: true }, odView: EMPTY_OD_VIEW });

    render(<StationDetail stations={stations} store={store()} onFocusFlow={vi.fn()} />);

    expect(screen.getByText(/Aucun flux d’au moins 3 véhicules/)).toBeTruthy();
  });
});

describe('Legend segment scale', () => {
  it('shows a gradient scale in vehicles per hour once an estimate arrived', () => {
    useUiStore.setState({
      openSection: 'legend', layers: { ...useUiStore.getState().layers, segments: true },
      segments: { graphVersion: 'g1', algorithm: 'fastest', loads: Array.from({ length: 100 }, (_, i) => ({ segmentId: `s${i}`, vehicles: (i + 1) * 20 })) },
    });

    render(<Legend />);
    const scale = screen.getByTestId('segment-scale');

    expect(scale.textContent).toContain(`≥ ${formatCount(1900)}`);
    expect(scale.textContent).toContain('estimée');
    expect(scale.querySelector('.scale-bar')?.getAttribute('style')).toContain('linear-gradient');
  });

  it('announces the scale is not available before the first estimate', () => {
    useUiStore.setState({ openSection: 'legend', layers: { ...useUiStore.getState().layers, segments: true } });

    render(<Legend />);

    expect(screen.getByText('Échelle disponible à la première estimation.')).toBeTruthy();
  });
});
