'use client';

import { User } from 'lucide-react';
import InfoCard from '../ui/InfoCard';

export default function ProfilePage(): React.ReactElement {
  return (
    <InfoCard icon={<User size={48} className="text-gray-400" />} title="Profile">
      <p className="text-gray-600 dark:text-gray-400">
        Profile page coming soon. User settings and account management will be available here.
      </p>
    </InfoCard>
  );
}
