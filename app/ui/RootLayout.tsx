import { Outlet } from '@tanstack/react-router';
import { AizaProvider } from './context/AizaProvider';
import NavBar from './NavBar';
import Footer from './Footer';

export default function RootLayout(): React.ReactElement {
  return (
    <AizaProvider>
      <NavBar />
      <Outlet />
      <Footer />
    </AizaProvider>
  );
}
