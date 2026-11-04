import { db } from '../db';
import type {
  SyncPayload,
  SyncResponse,
  Order,
  OrderItem,
  PaymentRecord,
  StockMovement,
} from '../types';
import { getSettings, updateSetting } from './settingsService';

/**
 * =========================================================================
 * OMR EVENT POS — RESTAURANT POS SYNC CONTRACT (POST /api/event-pos/sync)
 * =========================================================================
 * Request Body (JSON):
 * {
 *   "eventId": "EVT-2026-OMR01",
 *   "deviceId": "TAB-POS-01",
 *   "outletCode": "OMR-MAIN",
 *   "syncTimestamp": "2026-11-04T09:30:00.000Z",
 *   "idempotencyKey": "sync-618355c7-2c84-433c-b130-690dabb9e004",
 *   "orders": [
 *     {
 *       "id": "ord-...",
 *       "orderNumber": "OMR-20261104-0001",
 *       "createdAt": "...",
 *       "totalAmount": 1250,
 *       "status": "COMPLETED",
 *       ...
 *     }
 *   ],
 *   "orderItems": [...],
 *   "payments": [...],
 *   "stockMovements": [...]
 * }
 *
 * Successful Response (HTTP 200/201):
 * {
 *   "success": true,
 *   "importedCounts": {
 *     "orders": 12,
 *     "items": 24,
 *     "payments": 12,
 *     "stockMovements": 28
 *   },
 *   "serverTimestamp": "2026-11-04T09:30:01.000Z",
 *   "message": "Transactions durably persisted"
 * }
 * =========================================================================
 */

export interface SyncStats {
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  mockSyncedCount: number;
  lastSyncTimestamp?: string;
}

export async function getSyncStats(): Promise<SyncStats> {
  const settings = await getSettings();
  const pendingCount = await db.orders.where('syncStatus').equals('PENDING').count();
  const syncedCount = await db.orders.where('syncStatus').equals('SYNCED').count();
  const failedCount = await db.orders.where('syncStatus').equals('FAILED').count();
  const mockSyncedCount = await db.orders.where('syncStatus').equals('MOCK_SYNCED').count();

  return {
    pendingCount,
    syncedCount,
    failedCount,
    mockSyncedCount,
    lastSyncTimestamp: settings.lastSyncTimestamp,
  };
}

export async function buildSyncPayload(): Promise<{
  payload: SyncPayload;
  ordersToSync: Order[];
}> {
  const settings = await getSettings();

  // Find all orders that are PENDING or FAILED
  const ordersToSync = await db.orders
    .where('syncStatus')
    .anyOf(['PENDING', 'FAILED'])
    .toArray();

  if (ordersToSync.length === 0) {
    throw new Error('No pending or failed orders to synchronize');
  }

  const orderIds = ordersToSync.map((o) => o.id);

  // Gather related items, payments
  const orderItems: OrderItem[] = [];
  const payments: PaymentRecord[] = [];

  for (const id of orderIds) {
    const items = await db.orderItems.where('orderId').equals(id).toArray();
    orderItems.push(...items);

    const paymentList = await db.payments.where('orderId').equals(id).toArray();
    payments.push(...paymentList);
  }

  // Gather stock movements
  const stockMovements: StockMovement[] = await db.stockMovements.toArray();

  const idempotencyKey = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const payload: SyncPayload = {
    eventId: settings.eventCode,
    deviceId: settings.deviceId,
    outletCode: settings.outletCode,
    syncTimestamp: new Date().toISOString(),
    idempotencyKey,
    orders: ordersToSync,
    orderItems,
    payments,
    stockMovements,
  };

  return { payload, ordersToSync };
}

export interface SyncExecutionResult {
  success: boolean;
  isMock: boolean;
  message: string;
  syncedCount: number;
  error?: string;
  timestamp: string;
}

/**
 * Execute synchronization:
 * - When Mock Mode is ENABLED: runs the documented mock adapter, marked as MOCK_SYNCED.
 * - When Mock Mode is DISABLED: calls the real POS backend endpoint.
 */
export async function executeSync(forceMockFailure = false): Promise<SyncExecutionResult> {
  const settings = await getSettings();
  const { payload, ordersToSync } = await buildSyncPayload();
  const now = new Date().toISOString();

  // DEVELOPMENT MOCK MODE
  if (settings.mockSyncEnabled) {
    // Artificial latency for realistic tablet experience
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (forceMockFailure) {
      // Simulate backend outage or network drop
      await db.transaction('rw', db.orders, async () => {
        for (const order of ordersToSync) {
          order.syncStatus = 'FAILED';
          order.syncAttempts += 1;
          order.lastSyncError = 'Mock Simulation: HTTP 503 Service Unavailable';
          await db.orders.put(order);
        }
      });

      return {
        success: false,
        isMock: true,
        message: 'Mock sync simulated a failure (HTTP 503). Retained for retry.',
        syncedCount: 0,
        error: 'Mock Simulation: HTTP 503 Service Unavailable',
        timestamp: now,
      };
    }

    // In mock mode, mark clearly as MOCK_SYNCED so user knows it's NOT a real restaurant POS sync!
    await db.transaction('rw', [db.orders, db.settings], async () => {
      for (const order of ordersToSync) {
        order.syncStatus = 'MOCK_SYNCED';
        order.syncedAt = now;
        order.lastSyncError = undefined;
        await db.orders.put(order);
      }
      await updateSetting('lastSyncTimestamp', now);
    });

    return {
      success: true,
      isMock: true,
      message: `[DEVELOPMENT MOCK] Simulated sync of ${ordersToSync.length} orders. Note: this has NOT been imported to live POS.`,
      syncedCount: ordersToSync.length,
      timestamp: now,
    };
  }

  // REAL PRODUCTION API CALL
  const endpoint = `${settings.apiBaseUrl.replace(/\/+$/, '')}/api/event-pos/sync`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': settings.deviceId,
        'X-Event-Id': settings.eventCode,
        'X-Idempotency-Key': payload.idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`POS Server returned HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const data: SyncResponse = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'POS Server reported unsuccessful import');
    }

    // Server confirmed durable persistence! Commit SYNCED status.
    await db.transaction('rw', [db.orders, db.settings], async () => {
      for (const order of ordersToSync) {
        order.syncStatus = 'SYNCED';
        order.syncedAt = now;
        order.lastSyncError = undefined;
        await db.orders.put(order);
      }
      await updateSetting('lastSyncTimestamp', now);
    });

    return {
      success: true,
      isMock: false,
      message: `Successfully synchronized ${ordersToSync.length} orders to Restaurant POS.`,
      syncedCount: ordersToSync.length,
      timestamp: now,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown network failure';

    // Mark as FAILED and retain for retry
    await db.transaction('rw', db.orders, async () => {
      for (const order of ordersToSync) {
        order.syncStatus = 'FAILED';
        order.syncAttempts += 1;
        order.lastSyncError = errorMessage;
        await db.orders.put(order);
      }
    });

    return {
      success: false,
      isMock: false,
      message: `Sync failed: ${errorMessage}. Transactions retained for retry.`,
      syncedCount: 0,
      error: errorMessage,
      timestamp: now,
    };
  }
}

