import { createFileRoute } from '@tanstack/react-router';
import CognitoRedirect from '@/pages/CognitoRedirect';

// Exported (despite having no importers) so that the generated routeTree.gen.ts
// can name it in the inferred type of this route.
export interface CognitoRedirectSearch {
  code?: string;
  state?: string;
}

export const Route = createFileRoute('/cognito_redirect')({
  validateSearch: (search: Record<string, unknown>): CognitoRedirectSearch => ({
    code: typeof search.code === 'string' ? search.code : undefined,
    state: typeof search.state === 'string' ? search.state : undefined,
  }),
  component: CognitoRedirect,
});
