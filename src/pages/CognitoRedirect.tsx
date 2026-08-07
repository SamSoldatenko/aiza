import { useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuth } from '../ui/context/AuthContext';

export default function CognitoRedirect(): React.ReactElement {
  const navigate = useNavigate();
  const { code, state } = useSearch({ from: '/cognito_redirect' });
  const { handleOAuthCallback } = useAuth();
  const exchangeAttempted = useRef(false);

  useEffect(() => {
    if (!code || exchangeAttempted.current) return;

    exchangeAttempted.current = true;

    handleOAuthCallback(code, state ?? null)
      .then(() => {
        navigate({ to: '/', replace: true });
      })
      .catch((err) => {
        console.error('Token exchange failed:', err);
        navigate({ to: '/', replace: true });
      });
  }, [code, state, handleOAuthCallback, navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <p>Processing login...</p>
    </main>
  );
}
