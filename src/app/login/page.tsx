import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { cookies } from 'next/headers';
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
import {
  LOCALE_COOKIE_NAME,
  getTranslator,
  normalizeLocale,
} from '@/lib/i18n';

const ERROR_MESSAGE_KEYS: Record<string, string> = {
  missing_credentials: 'auth.login.error.missing_credentials',
  invalid_credentials: 'auth.login.error.invalid_credentials',
  invalid_response: 'auth.login.error.invalid_response',
  mfa_required: 'auth.login.error.mfa_required',
  not_initialized: 'auth.login.error.not_initialized',
  deactivated_by_admin: 'auth.login.error.deactivated_by_admin',
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
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const t = getTranslator(locale);
  const params = (await searchParams) ?? {};
  const initState = await fetchInitState();
  const rawError = params.error;
  const errorKey = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorKey
    ? t(ERROR_MESSAGE_KEYS[errorKey] ?? 'auth.login.error.default')
    : null;
  const showNotInitialized = initState ? !initState.initialized || !initState.has_admin : false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('auth.login.title')}</CardTitle>
          <CardDescription>{t('auth.login.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showNotInitialized ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {t('auth.login.warning')}
            </p>
          ) : null}
          <form
            className="space-y-4"
            method="post"
            action="/login/submit"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('auth.login.fieldLogin')}</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                name="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t('auth.login.fieldPassword')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                name="password"
                required
              />
            </div>

            <Button className="w-full" type="submit">
              {t('auth.login.submit')}
            </Button>

            {errorMessage ? (
              <p className="text-sm text-destructive">{errorMessage}</p>
            ) : null}
          </form>

          <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              {t('auth.login.info.gateway')}
            </div>
            <div className="flex items-center gap-2">
              <LockKeyhole className="size-4" />
              {t('auth.login.info.ssr')}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
