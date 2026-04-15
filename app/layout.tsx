import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import './globals.css';
import { AizaProvider } from './ui/context/AizaProvider';
import NavBar from './ui/NavBar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AIZA Personal AI assistant',
  description: 'AI assistant to store and analyze personal data',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`min-h-screen flex flex-col ${inter.className}`}>
        <AppRouterCacheProvider>
          <AizaProvider>
            <NavBar />
            {children}
            <footer className="h-16 bg-gray-100 dark:bg-gray-800 p-5 text-center">
              Aiza app
            </footer>
          </AizaProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
