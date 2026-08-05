import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import RootLayout from './ui/RootLayout';
import Home from './routes/Home';
import About from './routes/About';
import Profile from './routes/Profile';
import CognitoRedirect from './routes/CognitoRedirect';

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: About,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: Profile,
});

interface CognitoRedirectSearch {
  code?: string;
  state?: string;
}

const cognitoRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cognito_redirect',
  validateSearch: (search: Record<string, unknown>): CognitoRedirectSearch => ({
    code: typeof search.code === 'string' ? search.code : undefined,
    state: typeof search.state === 'string' ? search.state : undefined,
  }),
  component: CognitoRedirect,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  profileRoute,
  cognitoRedirectRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
