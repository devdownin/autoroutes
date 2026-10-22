import { describe, expect, it } from 'vitest';
import { delta, metrics } from '../test-fixtures';
import { parseStreamMessage } from './protocol';

describe('parseStreamMessage', () => {
  it('accepts a well-formed delta', () => {
    const message = delta(3, [metrics('GL-1')]);
    expect(parseStreamMessage(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    ['not json', '{'],
    ['unknown type', JSON.stringify({ type: 'boom', epoch: 'e', payload: {} })],
    ['delta without seq', JSON.stringify({ type: 'delta', epoch: 'e', payload: { stations: [] } })],
    ['delta without stations', JSON.stringify({ type: 'delta', epoch: 'e', seq: 1, payload: {} })],
    ['missing payload', JSON.stringify({ type: 'heartbeat', epoch: 'e' })],
  ])('rejects %s', (_, raw) => {
    expect(parseStreamMessage(raw)).toBeNull();
  });
});
