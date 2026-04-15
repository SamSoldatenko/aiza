'use client';

import { type ReactNode } from 'react';

interface InfoCardProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

export default function InfoCard({ icon, title, children }: InfoCardProps): React.ReactElement {
  return (
    <main className="flex-1 p-5 max-w-4xl w-full mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center space-x-4 mb-6">
          {icon}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
