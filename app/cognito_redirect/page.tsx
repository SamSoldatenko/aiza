'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useAuth } from '../ui/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';

function CognitoRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const { handleOAuthCallback } = useAuth();
  const exchangeAttempted = useRef(false);

  useEffect(() => {
    const code = params.get('code');
    const error = params.get('error');
    const state = params.get('state');

    const isInIframe = window !== window.parent;

    if (isInIframe) {
      window.parent.postMessage({
        type: 'oauth_callback',
        code,
        error,
        state,
      }, window.location.origin);
      return;
    }

    if (!code || exchangeAttempted.current) return;

    exchangeAttempted.current = true;

    handleOAuthCallback(code)
      .then(() => {
        router.replace('/');
      })
      .catch((err) => {
        console.error('Token exchange failed:', err);
        router.replace('/');
      });
  }, [params, handleOAuthCallback, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <p>Processing login...</p>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CognitoRedirect />
    </Suspense>
  );
}
