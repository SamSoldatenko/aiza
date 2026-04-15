'use client';

import { Info } from 'lucide-react';
import InfoCard from '../ui/InfoCard';

export default function AboutPage(): React.ReactElement {
  return (
    <InfoCard icon={<Info size={48} className="text-gray-400" />} title="About AIZA">
      <p className="text-gray-600 dark:text-gray-400">
        AIZA is a personal AI assistant for storing and analyzing personal data.
      </p>
      <p className="mt-4">
        <a
          href="https://github.com/SamSoldatenko/aiza#readme"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Learn more on GitHub
        </a>
      </p>
    </InfoCard>
  );
}
