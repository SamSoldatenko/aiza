import type { ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '@mui/material';
import { TriangleAlert } from 'lucide-react';
import InfoCard from './InfoCard';

export default function RouteError({ error, reset }: ErrorComponentProps): React.ReactElement {
  return (
    <InfoCard icon={<TriangleAlert size={48} className="text-gray-400" />} title="Something went wrong">
      <p className="text-gray-600 dark:text-gray-400">{error.message}</p>
      <div className="mt-4">
        <Button variant="outlined" size="small" onClick={reset}>
          Try again
        </Button>
      </div>
    </InfoCard>
  );
}
