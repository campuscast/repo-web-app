'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
import { login } from '@/services/auth-service';

const loginSchema = z.object({
  email: z.string().min(1, 'Enter login'),
  password: z.string().min(1, 'Enter password'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = new URLSearchParams(window.location.search);
    if (!current.has('email') && !current.has('password')) return;

    const sanitized = new URLSearchParams(current.toString());
    sanitized.delete('email');
    sanitized.delete('password');
    const query = sanitized.toString();
    router.replace(query ? `/login?${query}` : '/login');
  }, [router]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      await login(values);
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Login failed',
      );
    } finally {
      setSubmitting(false);
    }
  });

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
            onSubmit={onSubmit}
            method="post"
            action="/login/submit"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Login</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                {...form.register('email')}
              />
              <p className="text-xs text-destructive">
                {form.formState.errors.email?.message}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
              <p className="text-xs text-destructive">
                {form.formState.errors.password?.message}
              </p>
            </div>

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
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
