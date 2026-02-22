'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { contentService } from '@/services/content-service';
import { zoneService } from '@/services/zone-service';

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function ContentManager() {
  const queryClient = useQueryClient();
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones
  });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    if (isAdmin) return zones;
    return zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || visibleZones[0]?.zone_id || '';

  const contentQuery = useQuery({
    queryKey: queryKeys.content(effectiveZoneId),
    queryFn: () => contentService.list(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !effectiveZoneId) {
        throw new Error('Выберите зону и файл');
      }

      const init = await contentService.initUpload({
        zone_id: effectiveZoneId,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        file_size: file.size
      });

      await contentService.uploadBinaryToSignedUrl(init.upload_url, file);
      const hash = await sha256Hex(file);
      return contentService.completeUpload(init.asset_id, hash);
    },
    onSuccess: async () => {
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.content(effectiveZoneId) });
      toast.success('Контент загружен и зафиксирован');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка загрузки')
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>init upload → upload → complete upload</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm space-y-1.5">
            <Label>Zone</Label>
            <Select value={effectiveZoneId} onChange={(event) => setSelectedZoneId(event.target.value)}>
              {visibleZones.map((zone) => (
                <option key={zone.zone_id} value={zone.zone_id}>
                  {zone.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="max-w-sm space-y-1.5">
            <Label>Media file</Label>
            <Input
              type="file"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
              }}
            />
          </div>

          <Button onClick={() => uploadMutation.mutate()} disabled={!file || uploadMutation.isPending}>
            {uploadMutation.isPending ? 'Загрузка...' : 'Загрузить'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Media Library</CardTitle>
          <CardDescription>READY/DRAFT статус + hash read-only</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hash</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(contentQuery.data ?? []).map((asset) => (
                <TableRow key={asset.asset_id}>
                  <TableCell>
                    <div className="font-medium">{asset.filename}</div>
                    <div className="font-mono text-xs text-muted-foreground">{asset.asset_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={asset.status === 'ready' ? 'success' : 'secondary'}>
                      {asset.status === 'ready' ? 'READY' : 'DRAFT'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-xs">{asset.sha256_hash}</TableCell>
                  <TableCell>{asset.content_type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
