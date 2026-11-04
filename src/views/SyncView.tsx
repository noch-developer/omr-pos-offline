import { useState } from 'react';
import {
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { executeSync } from '../services/syncService';
import { exportDatabaseBackup } from '../services/backupService';
import { Button } from '../components/ui/Button';
import { formatDateTime, formatMoney } from '../utils/formatters';

export function SyncView() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    isMock: boolean;
    message: string;
    error?: string;
  } | null>(null);

  // Live queries
  const pendingOrders = useLiveQuery(
    () => db.orders.where('syncStatus').equals('PENDING').toArray(),
    [],
    []
  );

  const syncedOrders = useLiveQuery(
    () => db.orders.where('syncStatus').equals('SYNCED').toArray(),
    [],
    []
  );

  const mockSyncedOrders = useLiveQuery(
    () => db.orders.where('syncStatus').equals('MOCK_SYNCED').toArray(),
    [],
    []
  );

  const failedOrders = useLiveQuery(
    () => db.orders.where('syncStatus').equals('FAILED').toArray(),
    [],
    []
  );

  const settings = useLiveQuery(
    async () => {
      const apiUrl = await db.settings.get('apiBaseUrl');
      const isMock = await db.settings.get('mockSyncEnabled');
      const eventCode = await db.settings.get('eventCode');
      const deviceId = await db.settings.get('deviceId');
      const lastSync = await db.settings.get('lastSyncTimestamp');
      return {
        apiUrl: (apiUrl?.value as string) || 'https://pos-api.onemorerestaurant.com',
        isMock: isMock?.value !== false,
        eventCode: (eventCode?.value as string) || 'EVT-2026-OMR01',
        deviceId: (deviceId?.value as string) || 'TAB-POS-01',
        lastSync: lastSync?.value as string | undefined,
      };
    },
    [],
    {
      apiUrl: 'https://pos-api.onemorerestaurant.com',
      isMock: true,
      eventCode: 'EVT-2026-OMR01',
      deviceId: 'TAB-POS-01',
      lastSync: undefined,
    }
  );

  const handleSyncNow = async (forceFailure = false) => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await executeSync(forceFailure);
      setSyncResult(result);
    } catch (err: unknown) {
      setSyncResult({
        success: false,
        isMock: settings.isMock,
        message: err instanceof Error ? err.message : 'Sync execution failed',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const fileName = await exportDatabaseBackup();
      alert(`Database backup exported successfully: ${fileName}`);
    } catch (err) {
      alert('Failed to export backup: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 select-none">
      {/* Header */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">
            Event End Synchronization
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Push completed transactions, payments and stock movements to the main Restaurant POS
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportBackup}
            className="flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export JSON Backup</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            isLoading={isSyncing}
            disabled={pendingOrders.length === 0 && failedOrders.length === 0}
            onClick={() => handleSyncNow(false)}
            className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sync Now ({pendingOrders.length + failedOrders.length})</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Mock Mode Alert Banner (Crucial Requirement) */}
        {settings.isMock && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-300 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs uppercase tracking-wider text-amber-900">
                    DEVELOPMENT MOCK MODE ACTIVE
                  </span>
                  <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded">
                    Simulated Adapter
                  </span>
                </div>
                <p className="text-xs text-amber-800 mt-0.5 max-w-2xl">
                  The backend endpoint (<code>POST /api/event-pos/sync</code>) is not yet available.
                  Synchronization will run using the development mock and mark records as{' '}
                  <strong>MOCK_SYNCED</strong>. It will <strong>never</strong> be reported as a real
                  POS import.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSyncNow(true)}
                disabled={isSyncing || (pendingOrders.length === 0 && failedOrders.length === 0)}
                className="text-xs text-rose-700 border-rose-300 hover:bg-rose-50"
                title="Test how the POS retains failed transactions for retry"
              >
                Simulate 503 Outage
              </Button>
            </div>
          </div>
        )}

        {/* Sync Execution Feedback Banner */}
        {syncResult && (
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3 animate-in fade-in ${
              syncResult.success
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            {syncResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs">
              <span className="font-bold block">
                {syncResult.success ? 'Sync Completed' : 'Sync Failed'}
              </span>
              <p className="mt-0.5">{syncResult.message}</p>
              {syncResult.error && (
                <p className="mt-1 font-mono text-[11px] text-rose-700">{syncResult.error}</p>
              )}
            </div>
          </div>
        )}

        {/* Sync Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>Pending Sync</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-600 font-mono mt-1">
              {pendingOrders.length}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Waiting to upload</p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>Failed (Retry Queue)</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-black text-rose-600 font-mono mt-1">
              {failedOrders.length}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Retained for retry</p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>Live Synced</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
              {syncedOrders.length}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Durable on server</p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>Mock Synced</span>
              <Server className="w-4 h-4 text-sky-500" />
            </div>
            <div className="text-2xl font-black text-sky-700 font-mono mt-1">
              {mockSyncedOrders.length}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Simulated only</p>
          </div>
        </div>

        {/* API Contract & Configuration Information */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">Target Endpoint</span>
            <span className="font-mono bg-slate-100 px-2.5 py-1 rounded-lg text-slate-700 text-[11px]">
              POST {settings.apiUrl}/api/event-pos/sync
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Last Sync Execution:</span>
            <span className="font-mono text-slate-700">
              {settings.lastSync ? formatDateTime(settings.lastSync) : 'Never'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Device ID / Event:</span>
            <span className="font-mono text-slate-700">
              {settings.deviceId} / {settings.eventCode}
            </span>
          </div>
        </div>

        {/* Pending & Failed Orders Details */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Unsynced Transactions ({pendingOrders.length + failedOrders.length})
              </h3>
              <p className="text-xs text-slate-400">
                These orders will be sent atomically with UUID idempotency keys
              </p>
            </div>
          </div>

          {pendingOrders.length === 0 && failedOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-slate-700">All local transactions are up to date!</p>
              <p className="text-slate-400 mt-0.5">
                New sales made on the POS register will be automatically queued here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 text-xs max-h-80 overflow-y-auto">
              {[...failedOrders, ...pendingOrders].map((order) => (
                <div key={order.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{order.orderNumber}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          order.syncStatus === 'FAILED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {order.syncStatus}
                      </span>
                      {order.syncAttempts > 0 && (
                        <span className="text-[10px] text-slate-400">
                          (Attempts: {order.syncAttempts})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Created: {formatDateTime(order.createdAt)} | Method: {order.paymentMethod}
                    </div>
                    {order.lastSyncError && (
                      <div className="text-[10px] font-mono text-rose-600 bg-rose-50 px-2 py-0.5 rounded mt-1">
                        Error: {order.lastSyncError}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-black text-slate-900">
                      {formatMoney(order.totalAmount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
