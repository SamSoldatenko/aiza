import { Link } from '@tanstack/react-router';
import { FileQuestion } from 'lucide-react';
import InfoCard from './InfoCard';

export default function NotFound(): React.ReactElement {
  return (
    <InfoCard icon={<FileQuestion size={48} className="text-gray-400" />} title="Page not found">
      <p className="text-gray-600 dark:text-gray-400">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <p className="mt-4">
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">
          Go back home
        </Link>
      </p>
    </InfoCard>
  );
}
