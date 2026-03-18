import { ShieldCheck } from 'lucide-react';
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
  missing_code: 'Enter a 6-digit MFA code',
  invalid_code: 'Invalid MFA code',
  missing_challenge: 'MFA challenge expired. Sign in again.',
  invalid_response: 'Invalid MFA response',
};

export default async function MfaLoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const rawError = params.error;
  const errorKey = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? 'MFA verification failed' : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify MFA</CardTitle>
          <CardDescription>Enter one-time code from your authenticator app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-4" method="post" action="/login/mfa/submit">
            <div className="space-y-1.5">
              <Label htmlFor="code">Authenticator code</Label>
              <Input
                id="code"
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                required
              />
            </div>

            <Button className="w-full" type="submit">
              Verify and sign in
            </Button>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </form>

          <div className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            Session will be issued only after successful MFA code verification
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
