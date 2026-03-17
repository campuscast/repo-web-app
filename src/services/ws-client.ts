import type { ScheduleOp } from '@/types/api';

export type SyncStatus = 'idle' | 'connecting' | 'online' | 'degraded' | 'offline';

type Handlers = {
  onSyncAck?: (payload: { operation_ids: string[] }) => void;
  onSyncReject?: (payload: { operation_id: string; reason: string; explanation?: string }) => void;
  onTransform?: (payload: { operation_id: string; reason: string }) => void;
  onBatchRejected?: (payload: { reason: string; correlation_id: string }) => void;
  onSnapshot?: (payload: {
    schedule_id: string;
    slots: unknown[];
    epoch?: number;
    snapshot_hash?: string;
    last_operation_id?: string;
    missing_ops?: unknown[];
  }) => void;
  onRemoteOps?: (payload: { schedule_id: string; ops: unknown[] }) => void;
  onStatus?: (status: SyncStatus) => void;
};

type WsSyncClientOptions = {
  url: string;
  accessToken: string;
  handlers: Handlers;
};

// Canonical WS outbound message types from sync-service
type OpsAppliedMsg = {
  type: 'ops_applied';
  correlation_id: string;
  accepted: number;
  rejected: number;
  results: Array<{
    operation_id: string;
    accepted: boolean;
    reason?: string;
    explanation?: string;
    compensating_ops?: unknown[];
  }>;
  // Extra: broadcast from another editor includes original ops
  schedule_id?: string;
  ops?: unknown[];
};

type BatchRejectedMsg = {
  type: 'batch_rejected';
  correlation_id: string;
  reason: string;
};

type OpsRejectedMsg = {
  type: 'ops_rejected';
  correlation_id: string;
  error: string;
};

type SnapshotMsg = {
  type: 'snapshot';
  correlation_id: string;
  schedule_id: string;
  slots: unknown[];
  epoch?: number;
  snapshot_hash?: string;
  last_operation_id?: string;
  missing_ops?: unknown[];
};

type WsOutbound = OpsAppliedMsg | BatchRejectedMsg | OpsRejectedMsg | SnapshotMsg;

let correlationCounter = 0;
function nextCorrelationId(): string {
  return `web-${Date.now()}-${++correlationCounter}`;
}

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
        const msg = JSON.parse(event.data) as WsOutbound;
        this.handleMessage(msg);
      } catch {
        this.opts.handlers.onStatus?.('degraded');
      }
    };
  }

  private handleMessage(msg: WsOutbound) {
    switch (msg.type) {
      case 'ops_applied': {
        // Check if this is a broadcast from another editor (has ops array and schedule_id)
        if (msg.ops && Array.isArray(msg.ops) && msg.schedule_id && msg.correlation_id.startsWith('broadcast-')) {
          this.opts.handlers.onRemoteOps?.({
            schedule_id: msg.schedule_id,
            ops: msg.ops,
          });
          return;
        }

        const accepted = (msg.results || []).filter((r) => r.accepted);
        const rejected = (msg.results || []).filter((r) => !r.accepted);

        if (accepted.length > 0) {
          this.opts.handlers.onSyncAck?.({
            operation_ids: accepted.map((r) => r.operation_id),
          });
        }

        for (const r of rejected) {
          if (r.compensating_ops && r.compensating_ops.length > 0) {
            this.opts.handlers.onTransform?.({
              operation_id: r.operation_id,
              reason: r.reason || 'auto_transform',
            });
          } else {
            this.opts.handlers.onSyncReject?.({
              operation_id: r.operation_id,
              reason: r.reason || 'rejected',
              explanation: r.explanation,
            });
          }
        }
        break;
      }

      case 'batch_rejected': {
        this.opts.handlers.onBatchRejected?.({
          reason: msg.reason,
          correlation_id: msg.correlation_id,
        });
        break;
      }

      case 'ops_rejected': {
        // Entire batch failed (server error). Report as degraded.
        this.opts.handlers.onStatus?.('degraded');
        break;
      }

      case 'snapshot': {
        this.opts.handlers.onSnapshot?.({
          schedule_id: msg.schedule_id,
          slots: msg.slots,
          epoch: msg.epoch,
          snapshot_hash: msg.snapshot_hash,
          last_operation_id: msg.last_operation_id,
          missing_ops: msg.missing_ops,
        });
        break;
      }
    }
  }

  /** Send ops_batch in canonical flat envelope format */
  sendOps(scheduleId: string, ops: ScheduleOp[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Sync websocket is not connected');
    }

    this.ws.send(
      JSON.stringify({
        type: 'ops_batch',
        schedule_id: scheduleId,
        ops,
        correlation_id: nextCorrelationId(),
      })
    );
  }

  /** Request a full snapshot/resync for a schedule */
  requestSync(scheduleId: string, lastKnownOperationId?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Sync websocket is not connected');
    }

    this.ws.send(
      JSON.stringify({
        type: 'sync_request',
        schedule_id: scheduleId,
        correlation_id: nextCorrelationId(),
        ...(lastKnownOperationId ? { last_known_operation_id: lastKnownOperationId } : {}),
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
