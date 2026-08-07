import { Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AizaProvider } from './context/AizaProvider';
import NavBar from './NavBar';
import Footer from './Footer';

export default function RootLayout(): React.ReactElement {
  return (
    <AizaProvider>
      <NavBar />
      <Outlet />
      <Footer />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </>
      )}
    </AizaProvider>
  );
}
