import { Alert, Button } from '@mui/material';
import { useServerConfig } from './context/ServerConfigContext';

export default function BackendMismatchBanner(): React.ReactElement | null {
  const { infoJson } = useServerConfig();
  const currentOrigin = window.location.origin;

  const expectedUrl = infoJson?.web;
  const urlMismatch = expectedUrl && currentOrigin !== expectedUrl;

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
