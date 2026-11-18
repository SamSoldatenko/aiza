import { createFileRoute } from '@tanstack/react-router';
import CognitoRedirect from '@/pages/CognitoRedirect';

// Exported (despite having no importers) so that the generated routeTree.gen.ts
// can name it in the inferred type of this route.
export interface CognitoRedirectSearch {
  code?: string;
  state?: string;
  // Sent by the IdP instead of a code (e.g. the user refused consent).
  error?: string;
  error_description?: string;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export const Route = createFileRoute('/cognito_redirect')({
  validateSearch: (search: Record<string, unknown>): CognitoRedirectSearch => ({
    code: text(search.code),
    state: text(search.state),
    error: text(search.error),
    error_description: text(search.error_description),
  }),
  component: CognitoRedirect,
});
