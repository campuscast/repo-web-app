import { LockKeyhole, ShieldCheck } from 'lucide-react';
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
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const rawError = params.error;
  const errorKey = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? 'Login failed' : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to CampusCast</CardTitle>
          <CardDescription>Sign in to the CMS panel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
