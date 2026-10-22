// durable-data 01-auth-renewal FR4: renewal creds for apiGet/apiPut.
//
// A pure module (no client import), so the many tests that factory-mock
// `src/api/client` still get a real `toAuthCreds`. `client.ts` re-exports the
// type only; production code imports `toAuthCreds` from here.

import type { Credentials } from '../types/config';

/** Credentials + environment for the apiGet/apiPut renew-and-retry path. */
export interface AuthCreds {
  username: string; // SecureStore 'crossover_username' via loadCredentials()
  password: string; // SecureStore 'crossover_password' via loadCredentials()
  useQA: boolean; // CrossoverConfig.useQA of the request's own config
}

/** Adds the request's environment to stored credentials. Returns a new object. */
export function toAuthCreds(c: Credentials, useQA: boolean): AuthCreds {
  return { username: c.username, password: c.password, useQA };
}
