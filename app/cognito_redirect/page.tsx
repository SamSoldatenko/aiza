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
    const state = params.get('state');

    if (!code || exchangeAttempted.current) return;

    exchangeAttempted.current = true;

    handleOAuthCallback(code, state)
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
