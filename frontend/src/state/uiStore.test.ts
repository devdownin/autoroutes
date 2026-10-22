import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore';

describe('uiStore sections', () => {
  beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });

  it('starts with the layers section open', () => {
    expect(useUiStore.getState().openSection).toBe('layers');
  });

  it('opens the settings of a layer when it is switched on, and keeps the section when it is switched off', () => {
    useUiStore.getState().toggleLayer('od');
    expect(useUiStore.getState().openSection).toBe('od');
    useUiStore.getState().toggleLayer('segments');
    expect(useUiStore.getState().openSection).toBe('segments');

    useUiStore.getState().toggleLayer('segments');

    expect(useUiStore.getState().layers.segments).toBe(false);
    expect(useUiStore.getState().openSection).toBe('segments');
  });

  it('does not steal the focus for layers without a section of their own', () => {
    useUiStore.getState().toggleLayer('labels');

    expect(useUiStore.getState().openSection).toBe('layers');
  });

  it('hides internal flows until asked', () => {
    expect(useUiStore.getState().odIncludeInternal).toBe(false);
  });
});

describe('uiStore axis selection', () => {
  beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });

  it('applies the axis filter on click, and shows the flows it filters', () => {
    useUiStore.getState().chooseAxis('A0007,A0007N');

    const state = useUiStore.getState();
    expect(state.odFilters.axis).toBe('A0007,A0007N');
    expect(state.layers.od).toBe(true);
    expect(state.openSection).toBe('od');
  });

  it('removes the filter on a second click and leaves the layers alone', () => {
    useUiStore.getState().chooseAxis('A0007');
    useUiStore.getState().setOpenSection('layers');

    useUiStore.getState().chooseAxis('A0007');

    expect(useUiStore.getState().odFilters.axis).toBe('');
    expect(useUiStore.getState().openSection).toBe('layers');
  });

  it('switches directly from one axis to another and keeps the other filters', () => {
    useUiStore.getState().setOdFilters({ department: '69' });
    useUiStore.getState().chooseAxis('A0007');
    useUiStore.getState().chooseAxis('A0006');

    expect(useUiStore.getState().odFilters).toMatchObject({ axis: 'A0006', department: '69' });
  });

  it('shows the motorway names by default', () => {
    expect(useUiStore.getState().layers.axes).toBe(true);
  });
});
