'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileAudio,
  FileVideo,
  Image,
  MoreHorizontal,
  Music,
  Pause,
  Pencil,
  Play,
  Search,
  Trash2,
  Upload,
  Volume2,
  VolumeOff,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { queryKeys } from '@/lib/query-keys';
import { contentService } from '@/services/content-service';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';
import type { ContentAsset } from '@/types/api';

/* ─── Constants ─────────────────────────────────────────────────── */

const MINIO_PUBLIC_URL = process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL ?? 'http://localhost:9000';
const MINIO_BUCKET = 'campuscast-content';

const ACCEPTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.gif',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.mp3', '.wav', '.aac', '.flac', '.ogg', '.aiff', '.alac', '.opus', '.wma'
].join(',');

function assetPreviewUrl(asset: ContentAsset): string | null {
  if (!asset.storage_key) return null;
  return `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${asset.storage_key}`;
}

function mediaCategory(contentType: string): 'image' | 'video' | 'audio' | 'other' {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'other';
}

function mediaCategoryIcon(contentType: string) {
  const cat = mediaCategory(contentType);
  if (cat === 'video') return <FileVideo className="mr-2 size-4" />;
  if (cat === 'audio') return <FileAudio className="mr-2 size-4" />;
  return <Image className="mr-2 size-4" />;
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/* ─── Styled Media Player (video + audio) ───────────────────────── */

function StyledVideoPlayer({ src, filename }: { src: string; filename: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProgress((video.currentTime / video.duration) * 100);
    setCurrentTime(video.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) setDuration(video.duration);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    video.currentTime = ratio * video.duration;
  }, []);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="group relative overflow-hidden rounded-md bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        className="max-h-[60vh] w-full"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
        aria-label={filename}
      />

      {/* Custom controls overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div
          className="mb-2 h-1 cursor-pointer rounded-full bg-white/30 transition-all hover:h-1.5"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 text-white hover:bg-white/20 hover:text-white" onClick={togglePlay}>
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-white hover:bg-white/20 hover:text-white" onClick={toggleMute}>
            {isMuted ? <VolumeOff className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <span className="ml-1 font-mono text-xs text-white/80">
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
        </div>
      </div>

      {/* Big centered play button when paused */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
          aria-label="Play video"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg backdrop-blur-sm">
            <Play className="ml-1 size-6" />
          </div>
        </button>
      )}
    </div>
  );
}

function StyledAudioPlayer({ src, filename }: { src: string; filename: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
    setCurrentTime(audio.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setDuration(audio.duration);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  }, []);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        This audio format is not supported by your browser
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-8">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setError(true)}
        aria-label={filename}
      />

      {/* Waveform placeholder / icon */}
      <div className="flex size-20 items-center justify-center rounded-full bg-primary/10">
        <Music className="size-10 text-primary" />
      </div>

      {/* Progress bar */}
      <div className="w-full">
        <div
          className="h-1.5 cursor-pointer rounded-full bg-muted transition-all hover:h-2"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
          <span>{fmtTime(currentTime)}</span>
          <span>{fmtTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="size-10 rounded-full" onClick={togglePlay}>
          {isPlaying ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={toggleMute}>
          {isMuted ? <VolumeOff className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

/* ─── Content Manager ───────────────────────────────────────────── */

export function ContentManager() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'uploading'>('all');
  const [page, setPage] = useState(1);
  const [isDragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // Preview dialog state
  const [previewAsset, setPreviewAsset] = useState<ContentAsset | null>(null);
  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<ContentAsset | null>(null);
  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<ContentAsset | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const zonesQuery = useQuery({ queryKey: queryKeys.zones, queryFn: zoneService.listZones });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || visibleZones[0]?.zone_id || '';

  const contentQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.content(effectiveZoneId) : ['content', 'none'],
    queryFn: () => contentService.list(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const usageQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.scheduleUsage(effectiveZoneId) : ['schedule', 'usage', 'none'],
    queryFn: () => scheduleService.getUsage(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const usageCountMap = useMemo<Record<string, number>>(() => {
    return usageQuery.data?.assets ?? {};
  }, [usageQuery.data]);

  /* ── Mutations ──────────────────────────────────────────── */

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveZoneId) throw new Error('Select zone');
      if (selectedFiles.length === 0) throw new Error('Select media files');

      const total = selectedFiles.length;
      let completed = 0;

      for (const file of selectedFiles) {
        setUploadProgress({ current: completed + 1, total });
        const init = await contentService.initUpload({
          zone_id: effectiveZoneId,
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size
        });

        await contentService.uploadBinaryToSignedUrl(init.upload_url, file);
        const hash = await sha256Hex(file);
        await contentService.completeUpload(init.asset_id, hash);
        completed++;
      }

      return completed;
    },
    onSuccess: async (count) => {
      setSelectedFiles([]);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await queryClient.invalidateQueries({ queryKey: queryKeys.content(effectiveZoneId) });
      toast.success(`${count} asset${count > 1 ? 's' : ''} uploaded successfully`);
    },
    onError: (error) => {
      setUploadProgress(null);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    }
  });

  const renameMutation = useMutation({
    mutationFn: ({ assetId, filename }: { assetId: string; filename: string }) =>
      contentService.renameAsset(assetId, filename),
    onSuccess: async () => {
      setRenameTarget(null);
      setRenameValue('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.content(effectiveZoneId) });
      toast.success('File renamed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Rename failed');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => contentService.deleteAsset(assetId),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.content(effectiveZoneId) });
      toast.success('Asset deleted');
    },
    onError: (error) => {
      setDeleteTarget(null);
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  });

  /* ── Handlers ───────────────────────────────────────────── */

  const handleFileDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) setSelectedFiles((prev) => [...prev, ...files]);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) setSelectedFiles((prev) => [...prev, ...files]);
    // reset so the same file(s) can be selected again
    if (event.target) event.target.value = '';
  }, []);

  const removeSelectedFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const openRenameDialog = useCallback((asset: ContentAsset) => {
    setRenameTarget(asset);
    setRenameValue(asset.filename);
  }, []);

  const handleDownload = useCallback((asset: ContentAsset) => {
    const url = assetPreviewUrl(asset);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const filtered = useMemo(() => {
    const rows = contentQuery.data ?? [];
    const lowered = search.toLowerCase();
    return rows.filter((asset) => {
      const matchSearch = asset.filename.toLowerCase().includes(lowered);
      const matchStatus = statusFilter === 'all' || asset.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [contentQuery.data, search, statusFilter]);

  const pageSize = 10;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <PageHeader description="Медиатека, upload flow и контроль READY/DRAFT статусов" />

        {/* Zone selector */}
        <div className="flex items-center gap-3">
          <Label className="shrink-0 text-sm font-medium">Zone</Label>
          <Select
            value={effectiveZoneId}
            onValueChange={(value) => {
              setSelectedZoneId(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              {visibleZones.map((zone) => (
                <SelectItem key={zone.zone_id} value={zone.zone_id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Two-panel grid */}
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Upload panel */}
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Upload flow</h3>

            <div
              className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center transition-colors ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}`}
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-6 text-muted-foreground" />
                {selectedFiles.length > 0 ? (
                  <p className="text-sm font-medium">
                    {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Drop files here or click to browse</p>
                    <p className="text-xs text-muted-foreground">image / video / audio</p>
                  </>
                )}
              </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileInputChange}
            />

            {/* Selected files list */}
            {selectedFiles.length > 0 && (
              <div className="max-h-[200px] space-y-1 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs"
                  >
                    <span className="flex-1 truncate" title={file.name}>
                      {file.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSelectedFile(index);
                      }}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full"
              disabled={selectedFiles.length === 0 || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
            >
              <Upload className="size-4" />
              {uploadMutation.isPending && uploadProgress
                ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
                : selectedFiles.length > 1
                  ? `Upload ${selectedFiles.length} assets`
                  : 'Upload asset'}
            </Button>
          </div>

          {/* Content table */}
          <DataTable
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-sm text-muted-foreground">Status:</span>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="uploading">Uploading</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative w-[260px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search file"
                    className="pl-8"
                  />
                </div>
              </div>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Filename</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Used in</TableHead>
                  <TableHead className="w-[52px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contentQuery.isLoading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : paged.map((asset) => {
                      const usageCount = usageCountMap[asset.asset_id] ?? 0;
                      const isUsed = usageCount > 0;

                      return (
                        <TableRow key={asset.asset_id}>
                          <TableCell className="pl-4">
                            <span className="font-medium">{asset.filename}</span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              tone={asset.status === 'ready' ? 'success' : 'warning'}
                              label={asset.status.toUpperCase()}
                            />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{asset.content_type}</TableCell>
                          <TableCell className="text-center">
                            {isUsed ? (
                              <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                                {usageCount}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setPreviewAsset(asset)}>
                                  {mediaCategoryIcon(asset.content_type)}
                                  Preview
                                </DropdownMenuItem>

                                <DropdownMenuItem onClick={() => handleDownload(asset)}>
                                  <Download className="mr-2 size-4" />
                                  Download
                                </DropdownMenuItem>

                                {isUsed ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <DropdownMenuItem disabled>
                                        <Pencil className="mr-2 size-4" />
                                        Rename
                                      </DropdownMenuItem>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                      Used in {usageCount} schedule slot{usageCount > 1 ? 's' : ''} — cannot rename
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <DropdownMenuItem onClick={() => openRenameDialog(asset)}>
                                    <Pencil className="mr-2 size-4" />
                                    Rename
                                  </DropdownMenuItem>
                                )}

                                <DropdownMenuSeparator />

                                {isUsed ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <DropdownMenuItem disabled className="text-destructive">
                                        <Trash2 className="mr-2 size-4" />
                                        Delete
                                      </DropdownMenuItem>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                      Used in {usageCount} schedule slot{usageCount > 1 ? 's' : ''} — cannot delete
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget(asset)}
                                  >
                                    <Trash2 className="mr-2 size-4" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>

            {!contentQuery.isLoading && !total ? (
              <div className="p-4">
                <EmptyState
                  title="No content assets"
                  description="Загрузите первый медиафайл в выбранную зону."
                  actionLabel={selectedFiles.length > 0 ? 'Upload now' : undefined}
                  onAction={selectedFiles.length > 0 ? () => uploadMutation.mutate() : undefined}
                />
              </div>
            ) : null}
          </DataTable>
        </div>

        {/* ── Preview dialog ─────────────────────────────────── */}
        {previewAsset && (
          <Dialog open onOpenChange={() => setPreviewAsset(null)}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="truncate">{previewAsset.filename}</DialogTitle>
                <DialogDescription asChild>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>{previewAsset.content_type}</span>
                    <span>{formatBytes(previewAsset.file_size)}</span>
                    <span className="uppercase">{previewAsset.status}</span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-hidden rounded-md border bg-muted/30">
                {(() => {
                  const url = assetPreviewUrl(previewAsset);
                  if (!url) {
                    return (
                      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                        Preview not available
                      </div>
                    );
                  }
                  const cat = mediaCategory(previewAsset.content_type);
                  if (cat === 'image') {
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={previewAsset.filename}
                        className="max-h-[60vh] w-full object-contain"
                      />
                    );
                  }
                  if (cat === 'video') {
                    return <StyledVideoPlayer src={url} filename={previewAsset.filename} />;
                  }
                  if (cat === 'audio') {
                    return <StyledAudioPlayer src={url} filename={previewAsset.filename} />;
                  }
                  return (
                    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                      Preview not supported for this file type
                    </div>
                  );
                })()}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ── Rename dialog ───────────────────────────────────── */}
        {renameTarget && (
          <Dialog
            open
            onOpenChange={() => {
              if (!renameMutation.isPending) {
                setRenameTarget(null);
                setRenameValue('');
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="size-5" />
                  Rename file
                </DialogTitle>
                <DialogDescription>
                  Enter a new name for <span className="font-medium text-foreground">{renameTarget.filename}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="rename-input">New filename</Label>
                <Input
                  id="rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="filename.ext"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameValue.trim() && renameValue !== renameTarget.filename) {
                      renameMutation.mutate({ assetId: renameTarget.asset_id, filename: renameValue.trim() });
                    }
                  }}
                  autoFocus
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRenameTarget(null);
                    setRenameValue('');
                  }}
                  disabled={renameMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => renameMutation.mutate({ assetId: renameTarget.asset_id, filename: renameValue.trim() })}
                  disabled={
                    renameMutation.isPending ||
                    !renameValue.trim() ||
                    renameValue.trim() === renameTarget.filename
                  }
                >
                  <Pencil className="size-4" />
                  {renameMutation.isPending ? 'Renaming...' : 'Rename'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* ── Delete confirmation dialog ──────────────────────── */}
        {deleteTarget && (
          <Dialog open onOpenChange={() => !deleteMutation.isPending && setDeleteTarget(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="size-5" />
                  Delete asset?
                </DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-foreground">{deleteTarget.filename}</span> will be permanently
                  removed from the system. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(deleteTarget.asset_id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-4" />
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </TooltipProvider>
  );
}
