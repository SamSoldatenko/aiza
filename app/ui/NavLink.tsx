'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface NavLinkProps {
  label: string;
  href: string;
  icon: ReactNode;
  isActive?: boolean;
  external?: boolean;
}

export default function NavLink({ label, href, icon, isActive, external }: NavLinkProps): React.ReactElement {
  const baseClasses = 'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors';
  const activeClasses = 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white';
  const inactiveClasses = 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white';

  const className = `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;

  if (external) {
    return (
      <a href={href} className={className}>
        {icon}
        <span>{label}</span>
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
