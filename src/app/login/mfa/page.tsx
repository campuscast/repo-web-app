import { ShieldCheck } from 'lucide-react';
import { cookies } from 'next/headers';
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
  missing_code: 'auth.mfa.error.missing_code',
  invalid_code: 'auth.mfa.error.invalid_code',
  missing_challenge: 'auth.mfa.error.missing_challenge',
  invalid_response: 'auth.mfa.error.invalid_response',
};

export default async function MfaLoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const t = getTranslator(locale);
  const params = (await searchParams) ?? {};
  const rawError = params.error;
  const errorKey = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorKey
    ? t(ERROR_MESSAGE_KEYS[errorKey] ?? 'auth.mfa.error.default')
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('auth.mfa.title')}</CardTitle>
          <CardDescription>{t('auth.mfa.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-4" method="post" action="/login/mfa/submit">
            <div className="space-y-1.5">
              <Label htmlFor="code">{t('auth.mfa.code')}</Label>
              <Input
                id="code"
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t('auth.mfa.placeholder')}
                required
              />
            </div>

            <Button className="w-full" type="submit">
              {t('auth.mfa.submit')}
            </Button>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </form>

          <div className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            {t('auth.mfa.info')}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
