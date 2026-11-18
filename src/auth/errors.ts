// The identity has no usable session: the user has to sign in (again).
export class NeedsLoginError extends Error {
  constructor(message = 'Sign-in required') {
    super(message);
    this.name = 'NeedsLoginError';
  }
}

// Signed in, but the session was granted fewer scopes than the service needs.
export class NeedsConsentError extends Error {
  readonly missingScopes: string[];

  constructor(missingScopes: string[]) {
    super(`Additional consent required: ${missingScopes.join(' ')}`);
    this.name = 'NeedsConsentError';
    this.missingScopes = missingScopes;
  }
}
