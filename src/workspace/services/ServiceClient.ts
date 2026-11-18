// A client of an HTTP service of a workspace, authorized by one of its
// identities: endpoint failover, a token carrying the scopes this service
// needs (from the TokenBroker), and 401 handling local to this service.
// Concrete clients declare their scopes and add their API on top.

import type { IdentityConfig } from '@/auth/identity';
import { NeedsConsentError, NeedsLoginError } from '@/auth/errors';
import { tokenBroker, type TokenBroker } from '@/auth/tokenBroker';

export type ServiceFailure =
  | 'unconfigured'
  | 'network'
  | 'needs-login'
  | 'needs-consent'
  | 'unauthorized'
  | 'forbidden'
  | 'error';

// A request that didn't get a usable answer. Everything a client throws is
// one of these, except an AbortError when the caller cancelled the request.
export class ServiceRequestError extends Error {
  readonly httpStatus?: number;

  constructor(
    readonly kind: ServiceFailure,
    message: string,
    options: { httpStatus?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ServiceRequestError';
    if (options.httpStatus !== undefined) this.httpStatus = options.httpStatus;
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

// Fisher–Yates over a copy.
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Whether a request that may have reached a replica can be sent to another
// one: safe methods always; any other method only with an Idempotency-Key,
// so the service can recognize the repetition. A streamed body can't be
// sent twice.
export function canFailOver(init: RequestInit): boolean {
  if (typeof ReadableStream !== 'undefined' && init.body instanceof ReadableStream) return false;
  return SAFE_METHODS.has((init.method ?? 'GET').toUpperCase()) || new Headers(init.headers).has('Idempotency-Key');
}

// A signal for one attempt: aborted by the caller's signal or after `ms`.
function attemptSignal(outer: AbortSignal | null | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException(`No answer within ${ms / 1000} s`, 'TimeoutError')), ms);
  const onAbort = () => controller.abort(outer!.reason);
  if (outer?.aborted) onAbort();
  else outer?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

export abstract class ServiceClient {
  // --- Service identity and configuration ---

  // Scopes the token sent to this service carries, and only these: the
  // client gets its own grant for them (see TokenBroker).
  abstract readonly scopes: readonly string[];

  // Base URLs in this client's failover order. Shuffled once, so clients
  // (tabs, devices, services) spread over the replicas and fail over in
  // different orders.
  readonly endpoints: readonly string[];

  // How long one attempt (one endpoint) may take before it counts as a
  // network failure.
  protected attemptTimeoutMs = 15_000;

  constructor(
    // Base URLs of interchangeable replicas; empty while the service has no address.
    endpoints: readonly string[] | undefined,
    readonly identity: IdentityConfig,
    private readonly broker: TokenBroker = tokenBroker,
  ) {
    this.endpoints = shuffle(endpoints ?? []);
  }

  // A service without an address can't be used; its scopes aren't requested
  // at sign-in.
  get configured(): boolean {
    return this.endpoints.length > 0;
  }

  // --- Request execution ---

  protected async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    this.assertConfigured();
    const response = await this.fetchAuthorized(path, init);
    if (response.status === 403) throw new ServiceRequestError('forbidden', 'Access denied', { httpStatus: 403 });
    return response;
  }

  protected async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    return parseJson<T>(await this.fetch(path, init));
  }

  protected async expectOk(path: string, init?: RequestInit): Promise<void> {
    const response = await this.fetch(path, init);
    if (!response.ok) throw httpError(response);
  }

  // Unauthenticated request, with the same failover.
  protected async fetchPublicJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();
    return parseJson<T>(await this.fetchWithFailover(path, init));
  }

  private assertConfigured(): void {
    if (!this.configured) throw new ServiceRequestError('unconfigured', 'The service has no address');
  }

  // --- Failover policy ---

  // Index in `endpoints` of the endpoint requests start from: the last one
  // that answered. It sticks until it fails.
  private current = 0;

  get endpoint(): string | undefined {
    return this.endpoints[this.current];
  }

  // Tries the endpoints round the ring from the current one. Moves on after
  // a network error, a timeout or a 5xx, but not after a 4xx: that answer is
  // authoritative and another replica would agree. A request that may not be
  // repeated (canFailOver) gets one attempt; if that fails, the next request
  // starts from the next endpoint.
  private async fetchWithFailover(path: string, init: RequestInit): Promise<Response> {
    const count = this.endpoints.length;
    const attempts = canFailOver(init) ? count : 1;
    let lastFailure = 'no endpoints';
    let lastError: unknown;
    for (let step = 0; step < attempts; step++) {
      const index = (this.current + step) % count;
      const base = this.endpoints[index];
      const attempt = attemptSignal(init.signal, this.attemptTimeoutMs);
      try {
        // Sequential on purpose: the next endpoint is a fallback, not a race.
        // oxlint-disable-next-line no-await-in-loop
        const response = await fetch(joinUrl(base, path), { ...init, signal: attempt.signal });
        if (response.status < 500) {
          this.current = index;
          return response;
        }
        if (attempts === 1) {
          this.current = (index + 1) % count;
          return response;
        }
        lastFailure = `${base}: HTTP ${response.status}`;
      } catch (err) {
        // Cancelled by the caller: not a failure of the endpoint.
        if (init.signal?.aborted) throw err;
        lastError = err;
        lastFailure = `${base}: ${err instanceof Error ? err.message : String(err)}`;
        if (attempts === 1) this.current = (index + 1) % count;
      } finally {
        attempt.done();
      }
    }
    throw new ServiceRequestError('network', `Service unreachable (${lastFailure})`, { cause: lastError });
  }

  // --- Authentication integration ---

  private async token(): Promise<string> {
    try {
      return await this.broker.getToken(this.identity, this.scopes);
    } catch (err) {
      if (err instanceof NeedsLoginError) throw new ServiceRequestError('needs-login', err.message, { cause: err });
      if (err instanceof NeedsConsentError) throw new ServiceRequestError('needs-consent', err.message, { cause: err });
      // fetch() rejects with a TypeError when the IdP can't be reached.
      if (err instanceof TypeError) throw new ServiceRequestError('network', `Identity provider unreachable (${err.message})`, { cause: err });
      throw new ServiceRequestError('error', err instanceof Error ? err.message : String(err), { cause: err });
    }
  }

  private async fetchAuthorized(path: string, init: RequestInit): Promise<Response> {
    const withToken = (token: string): RequestInit => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return { ...init, headers };
    };

    let token = await this.token();
    let response = await this.fetchWithFailover(path, withToken(token));
    if (response.status === 401) {
      // The service rejected this token: stop handing it out and retry once
      // with a refreshed one (the request was not carried out, so any method
      // may be repeated). A second 401 concerns this service only.
      this.broker.invalidate(this.identity, token);
      token = await this.token();
      response = await this.fetchWithFailover(path, withToken(token));
      if (response.status === 401) throw new ServiceRequestError('unauthorized', 'Service rejected the credentials', { httpStatus: 401 });
    }
    return response;
  }

  // --- Service status ---

  // Checks that the service answers and accepts the credentials; resolves to
  // a short description of what it reported. Clients without a cheap check
  // leave it undefined.
  probe?(): Promise<string | undefined>;
}

function httpError(response: Response): ServiceRequestError {
  return new ServiceRequestError('error', `HTTP ${response.status}`, { httpStatus: response.status });
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw httpError(response);
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new ServiceRequestError('error', 'Invalid JSON from service', { cause: err });
  }
}
