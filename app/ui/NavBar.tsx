'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { Home, User, Bug, Info, Menu, X } from 'lucide-react';
import Auth from './Auth';
import NavLink from './NavLink';
import BackendMismatchBanner from './BackendMismatchBanner';
import BackendStatusIndicator from './BackendStatusIndicator';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  external?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: <Home size={18} /> },
  { label: 'Profile', href: '/profile', icon: <User size={18} /> },
  { label: 'JWT debug', href: '/jwttest.html', icon: <Bug size={18} />, external: true },
  { label: 'About', href: '/about', icon: <Info size={18} /> },
];

function isNavItemActive(item: NavItem, pathname: string): boolean {
  return !item.external && pathname === item.href;
}

export default function NavBar(): React.ReactElement {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleDrawerToggle(): void {
    setDrawerOpen(!drawerOpen);
  }

  function handleNavClick(): void {
    setDrawerOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <BackendMismatchBanner />
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleDrawerToggle}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Toggle menu"
            >
              {drawerOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
              AIZA
            </Link>
            <div className="hidden md:flex items-center space-x-1 ml-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  isActive={isNavItemActive(item, pathname)}
                  external={item.external}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BackendStatusIndicator />
            <Auth />
          </div>
        </div>
      </nav>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={handleDrawerToggle}
        slotProps={{
          paper: {
            sx: {
              width: 280,
              bgcolor: 'background.paper',
            },
          },
        }}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xl font-bold text-gray-900 dark:text-white">AIZA</span>
        </div>
        <List>
          {navItems.map((item) => {
            const isActive = isNavItemActive(item, pathname);
            const linkProps = item.external
              ? { component: 'a' as const, href: item.href }
              : { component: Link, href: item.href };

            return (
              <ListItem key={item.href} disablePadding>
                <ListItemButton
                  {...linkProps}
                  onClick={handleNavClick}
                  selected={isActive}
                  sx={{
                    '&.Mui-selected': {
                      bgcolor: 'action.selected',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Drawer>
    </header>
  );
}
