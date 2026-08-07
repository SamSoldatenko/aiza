import { createRootRoute } from '@tanstack/react-router';
import RootLayout from '@/ui/RootLayout';
import NotFound from '@/ui/NotFound';
import RouteError from '@/ui/RouteError';

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});
