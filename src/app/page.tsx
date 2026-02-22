import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { requireServerSession } from '@/auth/server-session';
import { AuthHydrator } from '@/auth/auth-hydrator';
import { SiteShell } from '@/components/layout/site-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function HomePage() {
  const session = await requireServerSession();

  return (
    <>
      <AuthHydrator me={session.me} accessToken={session.accessToken} />
      <SiteShell>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Рабочая сессия</CardTitle>
              <CardDescription>
                Последнее обновление: {formatDistanceToNow(new Date(), { addSuffix: true, locale: ru })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Пользователь: </span>
                <span className="font-medium">{session.me.user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Роли:</span>
                {session.me.roles.map((role) => (
                  <Badge key={role}>{role}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Зоны:</span>
                {session.me.zones.map((zone) => (
                  <Badge key={zone} variant="secondary">
                    {zone}
                  </Badge>
                ))}
              </div>
              <div>
                <span className="text-muted-foreground">CRDT:</span>{' '}
                <Badge variant={session.me.crdt_enabled ? 'success' : 'secondary'}>
                  {session.me.crdt_enabled ? 'ENABLED' : 'DISABLED'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </SiteShell>
    </>
  );
}
