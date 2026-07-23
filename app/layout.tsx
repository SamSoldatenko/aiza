import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import './globals.css';
import { AizaProvider } from './ui/context/AizaProvider';
import NavBar from './ui/NavBar';
import Footer from './ui/Footer';

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
            <Footer />
          </AizaProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
