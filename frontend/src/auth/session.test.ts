import { describe, expect, it, vi } from 'vitest';
import { checkSession } from './session';

const respond = (status: number, body: unknown = {}) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

describe('checkSession', () => {
  it('asks for the login when the API answers 401', async () => {
    await expect(checkSession(respond(401))).resolves.toEqual({ kind: 'login' });
  });

  it('returns the identity when the session is valid', async () => {
    const me = { authenticated: true, name: 'alice', roles: ['VIEWER'] };

    await expect(checkSession(respond(200, me))).resolves.toEqual({ kind: 'ready', me });
  });

  it('works without authentication configured on the server', async () => {
    const me = { authenticated: false, name: null, roles: [] };

    await expect(checkSession(respond(200, me))).resolves.toEqual({ kind: 'ready', me });
  });

  it('fails on any other error instead of looping on the login', async () => {
    await expect(checkSession(respond(503))).rejects.toThrow(/503/);
  });
});
