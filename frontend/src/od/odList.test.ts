import { describe, expect, it } from 'vitest';
import { visibleFlows } from './odList';

const flows = [
  { originId: '06', destinationId: '06', vehicles: 28 },
  { originId: '69', destinationId: '13', vehicles: 9 },
  { originId: '62', destinationId: '62', vehicles: 7 },
];

describe('visibleFlows', () => {
  it('hides internal flows by default and counts them', () => {
    const { shown, hiddenInternal } = visibleFlows(flows, false);

    expect(shown).toEqual([{ originId: '69', destinationId: '13', vehicles: 9 }]);
    expect(hiddenInternal).toBe(2);
  });

  it('keeps everything, in server order, when internal flows are requested', () => {
    const { shown, hiddenInternal } = visibleFlows(flows, true);

    expect(shown).toEqual(flows);
    expect(hiddenInternal).toBe(0);
  });
});
