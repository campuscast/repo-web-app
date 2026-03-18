import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
const ERROR_MESSAGES: Record<string, string> = {
  missing_credentials: 'Enter login and password',
  invalid_credentials: 'Invalid login or password',
  invalid_response: 'Invalid auth response',
  mfa_required: 'MFA required. Enter code on the next screen.',
  not_initialized: 'System is not initialized yet. Run bootstrap install flow first.',
  deactivated_by_admin: 'Your account was disabled by administrator.',
};

type InitState = {
  initialized: boolean;
  has_admin: boolean;
};

async function fetchInitState(): Promise<InitState | null> {
  try {
    const response = await fetch(`${env.backendBaseUrl}/api/v1/system/init-state`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const payload = await response.json();
    if (
      payload &&
      typeof payload === 'object' &&
      typeof payload.initialized === 'boolean' &&
      typeof payload.has_admin === 'boolean'
    ) {
      return payload as InitState;
    }
    return null;
  } catch {
    return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const initState = await fetchInitState();
  const rawError = params.error;
  const errorKey = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? 'Login failed' : null;
  const showNotInitialized = initState ? !initState.initialized || !initState.has_admin : false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to CampusCast</CardTitle>
          <CardDescription>Sign in to the CMS panel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showNotInitialized ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              CMS is not initialized yet. Run `repo-infra/scripts/bootstrap.sh` with
              `AUTH_BOOTSTRAP_ADMIN_EMAIL` and `AUTH_BOOTSTRAP_ADMIN_PASSWORD` to create the first administrator.
            </p>
          ) : null}
          <form
            className="space-y-4"
            method="post"
            action="/login/submit"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Login</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                name="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                name="password"
                required
              />
            </div>

            <Button className="w-full" type="submit">
              Sign in
            </Button>

            {errorMessage ? (
              <p className="text-sm text-destructive">{errorMessage}</p>
            ) : null}
          </form>

          <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              Auth via API Gateway + refresh cookies
            </div>
            <div className="flex items-center gap-2">
              <LockKeyhole className="size-4" />
              SSR guards + in-memory access token
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
