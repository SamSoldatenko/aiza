'use client';

import { useState, useEffect } from 'react';
import { Alert, Button } from '@mui/material';
import { useServerConfig } from './context/ServerConfigContext';

export default function BackendMismatchBanner(): React.ReactElement | null {
  const { aizaJson } = useServerConfig();
  const [currentOrigin, setCurrentOrigin] = useState('');

  useEffect(() => {
    setCurrentOrigin(window.location.origin);
  }, []);

  const expectedUrl = aizaJson?.web;
  const urlMismatch = expectedUrl && currentOrigin && currentOrigin !== expectedUrl;

  if (!urlMismatch) {
    return null;
  }

  function handleNavigate(): void {
    window.location.href = expectedUrl!;
  }

  return (
    <Alert
      severity="warning"
      sx={{ mb: 2 }}
      action={
        <Button color="inherit" size="small" onClick={handleNavigate}>
          Go to {expectedUrl}
        </Button>
      }
    >
      You&apos;re accessing from {currentOrigin} but this backend expects {expectedUrl}.
    </Alert>
  );
}
