import type { ScheduleOp } from '@/types/api';

export type SyncStatus = 'idle' | 'connecting' | 'online' | 'degraded' | 'offline';

type Handlers = {
  onSyncAck?: (payload: { operation_ids: string[] }) => void;
  onSyncReject?: (payload: { operation_id: string; reason: string; explanation?: string }) => void;
  onTransform?: (payload: { operation_id: string; reason: string }) => void;
  onStatus?: (status: SyncStatus) => void;
};

type WsSyncClientOptions = {
  url: string;
  accessToken: string;
  handlers: Handlers;
};

export class WsSyncClient {
  private ws: WebSocket | null = null;
  private readonly opts: WsSyncClientOptions;

  constructor(opts: WsSyncClientOptions) {
    this.opts = opts;
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) {
      return;
    }

    this.opts.handlers.onStatus?.('connecting');

    const protocolToken = `bearer.${this.opts.accessToken}`;
    this.ws = new WebSocket(this.opts.url, ['json', protocolToken]);

    this.ws.onopen = () => {
      this.opts.handlers.onStatus?.('online');
    };

    this.ws.onerror = () => {
      this.opts.handlers.onStatus?.('degraded');
    };

    this.ws.onclose = () => {
      this.opts.handlers.onStatus?.('offline');
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: string;
          data: unknown;
        };

        if (payload.type === 'sync_ack') {
          this.opts.handlers.onSyncAck?.(payload.data as { operation_ids: string[] });
        }

        if (payload.type === 'sync_reject') {
          this.opts.handlers.onSyncReject?.(
            payload.data as { operation_id: string; reason: string; explanation?: string }
          );
        }

        if (payload.type === 'auto_transform') {
          this.opts.handlers.onTransform?.(payload.data as { operation_id: string; reason: string });
        }
      } catch {
        this.opts.handlers.onStatus?.('degraded');
      }
    };
  }

  sendOps(scheduleId: string, ops: ScheduleOp[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Sync websocket is not connected');
    }

    this.ws.send(
      JSON.stringify({
        type: 'ops_batch',
        data: {
          schedule_id: scheduleId,
          ops
        }
      })
    );
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.opts.handlers.onStatus?.('idle');
  }
}
