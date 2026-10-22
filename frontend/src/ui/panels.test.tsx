import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_OD_VIEW } from '../od/odTypes';
import type { OdView } from '../od/odTypes';
import type { StationCollection } from '../map/referentiel';
import { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { OdPanel } from './OdPanel';
import { ReplayBar } from './ReplayBar';
import type { ReplayControls } from './ReplayBar';
import { SegmentsPanel } from './SegmentsPanel';
import { StationTooltip } from './StationTooltip';

const stations: StationCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [4.8, 45.7] },
      properties: { id: 'A', name: 'La Boisse', kind: 'ECHANGEUR', axes: 'A0042', dept: '01', lanes: 4 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.4, 43.3] },
      properties: { id: 'B', name: 'Marseille', kind: 'ECHANGEUR', axes: 'A0007', dept: '13', lanes: 4 } },
  ],
};

const view = (overrides: Partial<OdView>): OdView => ({ ...EMPTY_OD_VIEW, ...overrides });

beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true);
  useUiStore.setState({ openSection: 'od' });
});
afterEach(cleanup);

describe('OdPanel', () => {
  const departments = view({
    level: 'DEPARTMENT',
    flows: [{ originId: '06', destinationId: '06', vehicles: 28 }, { originId: '69', destinationId: '13', vehicles: 9 }],
    nodes: [{ id: '06', name: 'Département 06', longitude: 7.2, latitude: 43.7 }, { id: '69', name: 'Département 69', longitude: 4.8, latitude: 45.7 }, { id: '13', name: 'Département 13', longitude: 5.4, latitude: 43.3 }],
  });

  it('lists the flows between departments first, internal ones hidden by default', () => {
    useUiStore.setState({ odView: departments, odFilters: { level: 'DEPARTMENT', department: '', axis: '', role: 'ANY' } });
    render(<OdPanel stations={stations} onFocusFlow={vi.fn()} />);

    const list = screen.getByRole('list', { name: 'Principaux flux' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toContain('Département 69 → Département 13');
    expect(screen.getByText(/1 flux internes masqués/)).toBeTruthy();
  });

  it('shows the internal flows on request', () => {
    useUiStore.setState({ odView: departments, odFilters: { level: 'DEPARTMENT', department: '', axis: '', role: 'ANY' } });
    render(<OdPanel stations={stations} onFocusFlow={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/Inclure les flux internes/));

    expect(screen.getByRole('list', { name: 'Principaux flux' }).textContent).toContain('Département 06 (interne)');
  });

  it('marks the nature once, in the header', () => {
    useUiStore.setState({ odView: departments });
    render(<OdPanel stations={stations} onFocusFlow={vi.fn()} />);

    expect(screen.getAllByText('observé')).toHaveLength(1);
  });

  it('highlights the arc of the hovered row and focuses the map on click', () => {
    const onFocusFlow = vi.fn();
    useUiStore.setState({ odView: departments, odFilters: { level: 'DEPARTMENT', department: '', axis: '', role: 'ANY' } });
    render(<OdPanel stations={stations} onFocusFlow={onFocusFlow} />);
    const row = screen.getByRole('button', { name: /Département 69 → Département 13/ });

    fireEvent.mouseEnter(row);
    expect(useUiStore.getState().highlightedFlow).toEqual({ originId: '69', destinationId: '13' });
    fireEvent.mouseLeave(row);
    expect(useUiStore.getState().highlightedFlow).toBeNull();
    fireEvent.click(row);

    expect(onFocusFlow).toHaveBeenCalledWith({ originId: '69', destinationId: '13' });
  });

  it('offers to remove the filters when they leave nothing to show', () => {
    useUiStore.setState({ odView: view({}), odFilters: { level: 'STATION', department: '13', axis: '', role: 'ANY' } });
    render(<OdPanel stations={stations} onFocusFlow={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer les filtres' }));

    expect(useUiStore.getState().odFilters).toEqual({ level: 'STATION', department: '', axis: '', role: 'ANY' });
  });

  it('suggests the department level when the station level is empty without filters', () => {
    useUiStore.setState({ odView: view({}) });
    render(<OdPanel stations={stations} onFocusFlow={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Voir par départements' }));

    expect(useUiStore.getState().odFilters.level).toBe('DEPARTMENT');
  });

  it('offers the hidden internal flows when they are the only ones', () => {
    useUiStore.setState({
      odView: view({ level: 'DEPARTMENT', flows: [{ originId: '06', destinationId: '06', vehicles: 5 }] }),
      odFilters: { level: 'DEPARTMENT', department: '', axis: '', role: 'ANY' },
    });
    render(<OdPanel stations={stations} onFocusFlow={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Afficher les flux internes' }));

    expect(useUiStore.getState().odIncludeInternal).toBe(true);
  });

  it('explains an error and retries by renewing the filters', () => {
    useUiStore.setState({ odError: 'Flux O/D indisponibles (503)' });
    const before = useUiStore.getState().odFilters;
    render(<OdPanel stations={stations} onFocusFlow={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('503');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(useUiStore.getState().odFilters).not.toBe(before);
    expect(useUiStore.getState().odFilters).toEqual(before);
  });
});

describe('OdPanel axis filter', () => {
  const withVariants: StationCollection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [4.8, 45.7] }, properties: { id: 'A', name: 'a', kind: 'ECHANGEUR', axes: 'A0007', dept: '69', lanes: 2 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [4.9, 45.0] }, properties: { id: 'B', name: 'b', kind: 'ECHANGEUR', axes: 'A0007N', dept: '26', lanes: 2 } },
    ],
  };

  it('offers motorways under the name drivers know, with the grouped codes as the filter value', () => {
    render(<OdPanel stations={withVariants} onFocusFlow={vi.fn()} />);
    const select = screen.getByLabelText<HTMLSelectElement>('Axe');

    expect([...select.options].map((o) => [o.textContent, o.value])).toEqual([['Tous', ''], ['A7', 'A0007,A0007N']]);
    fireEvent.change(select, { target: { value: 'A0007,A0007N' } });

    expect(useUiStore.getState().odFilters.axis).toBe('A0007,A0007N');
  });

  it('reflects an axis chosen by clicking its name on the map', () => {
    render(<OdPanel stations={withVariants} onFocusFlow={vi.fn()} />);

    act(() => { useUiStore.getState().chooseAxis('A0007,A0007N'); });

    expect(screen.getByLabelText<HTMLSelectElement>('Axe').value).toBe('A0007,A0007N');
  });
});

describe('SegmentsPanel', () => {
  it('explains the two possible reasons for an empty estimate and links the procedure', () => {
    useUiStore.setState({ openSection: 'segments', segments: null });
    render(<SegmentsPanel />);

    expect(screen.getByRole('status').textContent).toContain('Aucune estimation reçue');
    expect(screen.getByRole('link', { name: /Procédure de mise en service/ }).getAttribute('href')).toContain('increment-4.md');
    expect(screen.getByText(/pas une mesure/)).toBeTruthy();
  });
});

describe('sections', () => {
  it('shows only the open section and switches on click', () => {
    useUiStore.setState({ openSection: 'od', segments: null });
    render(<><OdPanel stations={stations} onFocusFlow={vi.fn()} /><SegmentsPanel /></>);
    const od = screen.getByRole('button', { name: /Flux O\/D/ });
    const segments = screen.getByRole('button', { name: /Charge estimée/ });

    expect(od.getAttribute('aria-expanded')).toBe('true');
    expect(segments.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(segments);

    expect(od.getAttribute('aria-expanded')).toBe('false');
    expect(segments.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('ReplayBar', () => {
  const controls = (): ReplayControls => ({ start: vi.fn(), playPause: vi.fn(), setSpeed: vi.fn(), backToLive: vi.fn() });

  it('is a discreet button until opened, then starts a replay with the chosen period', () => {
    const c = controls();
    render(<ReplayBar controls={c} />);
    expect(screen.queryByLabelText('Début de relecture')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Relecture/ }));
    fireEvent.change(screen.getByLabelText('Durée de relecture'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la relecture' }));

    expect(c.start).toHaveBeenCalledWith(expect.any(Date), 30, 60);
  });

  it('shows the transport controls and the progress during a replay', () => {
    const c = controls();
    useUiStore.setState({ mode: 'replay', replay: { status: 'playing', speed: 60, time: '2026-10-22T09:00:00Z', error: null,
      from: '2026-10-22T08:00:00Z', to: '2026-10-22T10:00:00Z' } });
    render(<ReplayBar controls={c} />);

    expect(screen.getByRole('progressbar', { name: 'Avancement de la relecture' }).getAttribute('value')).toBe('0.5');
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Retour au direct' }));

    expect(c.playPause).toHaveBeenCalled();
    expect(c.backToLive).toHaveBeenCalled();
  });
});

describe('StationTooltip', () => {
  it('previews the hovered station without a click, and disappears with the pointer', () => {
    const store = new StationStore(['A', 'B']);
    useUiStore.setState({ hover: { index: 1, x: 40, y: 40 } });
    render(<StationTooltip stations={stations} store={store} />);

    expect(screen.getByRole('tooltip').textContent).toContain('Marseille');
    expect(screen.getByRole('tooltip').textContent).toContain('15 min');

    cleanup();
    useUiStore.setState({ hover: null });
    render(<StationTooltip stations={stations} store={store} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
