import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@mui/material';
import { Check, ShieldCheck } from 'lucide-react';
import { tokenBroker, type PendingAuthorizations } from '@/auth/tokenBroker';
import { displayName } from '@/auth/useIdentity';
import { serviceLabel } from '@/ui/workspacePresentation';

type Step =
  | { kind: 'working'; message: string }
  | { kind: 'confirm'; authorizations: PendingAuthorizations; name: string | null };

// Where the IdP sends the browser back to, after sign-in and after each
// authorization of a service. Reached by a full-page redirect, never by
// client-side navigation.
export default function CognitoRedirect(): React.ReactElement {
  const navigate = useNavigate();
  const search = useSearch({ from: '/cognito_redirect' });
  const handled = useRef(false);
  const [step, setStep] = useState<Step>({ kind: 'working', message: 'Signing in…' });

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    tokenBroker
      .handleCallback({ code: search.code, state: search.state ?? null, error: search.error, errorDescription: search.error_description })
      .then((result) => {
        if (result.kind === 'done') {
          if (result.error) console.warn('Authorization was not granted:', result.error);
          navigate({ href: result.returnTo, replace: true });
        } else if (result.kind === 'continuing') {
          setStep({ kind: 'working', message: 'Authorizing services…' });
        } else {
          setStep({ kind: 'confirm', authorizations: result.authorizations, name: displayName(result.claims) });
        }
      })
      .catch((err) => {
        console.error('Sign-in failed:', err);
        navigate({ to: '/', replace: true });
      });
  }, [search, navigate]);

  if (step.kind === 'working') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-between p-24">
        <p>{step.message}</p>
      </main>
    );
  }

  const { authorizations, name } = step;
  const pending = [authorizations.next, ...authorizations.remaining];
  const services = (requests: typeof pending) => requests.flatMap((r) => r.services);

  function proceed(): void {
    setStep({ kind: 'working', message: 'Authorizing services…' });
    tokenBroker.continueAuthorization(authorizations).catch((err) => {
      console.error('Authorization failed:', err);
      navigate({ href: authorizations.returnTo, replace: true });
    });
  }

  function skip(): void {
    navigate({ href: authorizations.returnTo, replace: true });
  }

  // The IdP may ask for consent for each service: say why before sending the
  // user there.
  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
      <div className="max-w-lg w-full space-y-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
          <ShieldCheck size={24} /> Allow access to services
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {name ? <>Signed in as <strong>{name}</strong>. </> : 'Signed in. '}
          Each service gets a key of its own, limited to what it needs. Your identity provider may ask you to confirm each of them.
        </p>
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {services(authorizations.done).map((s) => (
            <li key={s} className="flex items-center gap-2 py-2 text-gray-500 dark:text-gray-400">
              <Check size={16} className="text-green-600" /> {serviceLabel(s)}
            </li>
          ))}
          {pending.map((request, i) => (
            <li key={request.scopes.join(' ')} className="py-2">
              <span className={i === 0 ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}>
                {request.services.map(serviceLabel).join(', ')}
              </span>
              <span className="block text-xs text-gray-500 break-all">{request.scopes.join(' ')}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="contained" onClick={proceed}>
            Continue{pending.length > 1 ? ` (${pending.length} left)` : ''}
          </Button>
          <Button variant="text" onClick={skip}>Skip for now</Button>
        </div>
      </div>
    </main>
  );
}
