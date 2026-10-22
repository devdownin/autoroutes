import { describe, expect, it } from 'vitest';
import { DEFAULT_OD_FILTERS, isDefaultFilters, odQuery, streamOdView, toOdView } from './odTypes';

describe('OD types', () => {
  it('builds the query with only the active filters', () => {
    expect(odQuery(DEFAULT_OD_FILTERS)).toBe('level=STATION&role=ANY&limit=500');
    expect(odQuery({ level: 'DEPARTMENT', department: '69', axis: 'A0007', role: 'ORIGIN' }))
      .toBe('level=DEPARTMENT&role=ORIGIN&limit=500&department=69&axis=A0007');
  });

  it('recognises default filters', () => {
    expect(isDefaultFilters(DEFAULT_OD_FILTERS)).toBe(true);
    expect(isDefaultFilters({ ...DEFAULT_OD_FILTERS, axis: 'A6' })).toBe(false);
    expect(isDefaultFilters({ ...DEFAULT_OD_FILTERS, level: 'DEPARTMENT' })).toBe(false);
  });

  it('flattens the server result without exposing masked flows individually', () => {
    const view = toOdView({
      level: 'DEPARTMENT',
      flows: [{ originId: '69', destinationId: '13', vehicles: 9 }],
      nodes: [{ id: '69', name: 'Département 69', longitude: 4.8, latitude: 45.7 }],
      masked: { flows: 3, vehicles: 5 },
      totalVehicles: 14,
      truncated: false,
      coverage: { recorded: 14, openSystem: 2, entryMissing: 1, entryUnknown: 0 },
    });

    expect(view).toMatchObject({ level: 'DEPARTMENT', maskedFlows: 3, maskedVehicles: 5, totalVehicles: 14 });
    expect(view.flows).toHaveLength(1);
  });

  it('wraps stream flows without filters or coverage', () => {
    const view = streamOdView([{ originId: 'A', destinationId: 'B', vehicles: 4 }, { originId: 'B', destinationId: 'A', vehicles: 6 }]);

    expect(view.totalVehicles).toBe(10);
    expect(view.coverage).toBeNull();
  });
});
