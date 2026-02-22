'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { FadeIn } from '@/components/animate-ui/fade-in';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { login } from '@/services/auth-service';

const loginSchema = z.object({
  email: z.string().email('Введите валидный email'),
  password: z.string().min(6, 'Минимум 6 символов')
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isSubmitting, setSubmitting] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      await login(values);
      router.replace('/');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#f4f8fb] to-[#ecf1f6] p-4">
      <FadeIn className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Вход в CMS</CardTitle>
            <CardDescription>Авторизация через API Gateway</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" {...form.register('email')} />
                <p className="text-xs text-destructive">{form.formState.errors.email?.message}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...form.register('password')}
                />
                <p className="text-xs text-destructive">{form.formState.errors.password?.message}</p>
              </div>
              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Выполняем вход...' : 'Войти'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </FadeIn>
    </main>
  );
}
