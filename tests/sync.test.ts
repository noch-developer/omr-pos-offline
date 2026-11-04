import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { createOrderAndPayment } from '../src/services/orderService';
import { buildSyncPayload, executeSync, getSyncStats } from '../src/services/syncService';
import { seedDemoData } from '../src/db/seed';

describe('Sync API Adapter & Offline Queue Retries', () => {
  beforeEach(async () => {
    await db.orders.clear();
    await db.orderItems.clear();
    await db.payments.clear();
    await db.stockMovements.clear();
    await db.stock.clear();
    await db.products.clear();
    await db.settings.clear();
    await seedDemoData(true);
  });

  it('builds sync payload matching POS backend contract with idempotency keys', async () => {
    // Create an order
    await createOrderAndPayment({
      items: [{ productId: 'prod-iced-latte', quantity: 1 }],
      paymentMethod: 'CASH',
      amountReceived: 500,
    });

    const { payload, ordersToSync } = await buildSyncPayload();

    expect(payload.eventId).toBe('EVT-2026-OMR01');
    expect(payload.deviceId).toBe('TAB-POS-01');
    expect(payload.idempotencyKey).toMatch(/^sync-\d+-[a-z0-9]+$/);
    expect(ordersToSync.length).toBe(1);
    expect(payload.orders.length).toBe(1);
    expect(payload.orderItems.length).toBe(1);
    expect(payload.payments.length).toBe(1);
    expect(payload.stockMovements.length).toBeGreaterThan(0);
  });

  it('development mock marks transactions as MOCK_SYNCED, never falsely as real POS sync', async () => {
    await createOrderAndPayment({
      items: [{ productId: 'prod-americano', quantity: 2 }],
      paymentMethod: 'CASH',
      amountReceived: 1000,
    });

    const initialStats = await getSyncStats();
    expect(initialStats.pendingCount).toBe(1);
    expect(initialStats.syncedCount).toBe(0);

    const result = await executeSync(false);
    expect(result.success).toBe(true);
    expect(result.isMock).toBe(true);
    expect(result.message).toContain('[DEVELOPMENT MOCK]');

    const updatedStats = await getSyncStats();
    expect(updatedStats.pendingCount).toBe(0);
    // Crucial rule: Never report mock sync as real live syncedCount
    expect(updatedStats.syncedCount).toBe(0);
    expect(updatedStats.mockSyncedCount).toBe(1);
  });

  it('retains failed transactions for retry on server/network failure', async () => {
    await createOrderAndPayment({
      items: [{ productId: 'prod-green-tea', quantity: 1 }],
      paymentMethod: 'CASH',
      amountReceived: 500,
    });

    // Simulate server outage (HTTP 503)
    const failureResult = await executeSync(true);
    expect(failureResult.success).toBe(false);
    expect(failureResult.syncedCount).toBe(0);

    const statsAfterFail = await getSyncStats();
    expect(statsAfterFail.failedCount).toBe(1);
    expect(statsAfterFail.pendingCount).toBe(0);

    // Verify order stored failed status and error
    const failedOrder = await db.orders.where('syncStatus').equals('FAILED').first();
    expect(failedOrder).toBeDefined();
    expect(failedOrder?.syncAttempts).toBe(1);
    expect(failedOrder?.lastSyncError).toContain('HTTP 503');

    // Retrying sync should bundle the failed order and retry
    const retryResult = await executeSync(false);
    expect(retryResult.success).toBe(true);

    const statsAfterRetry = await getSyncStats();
    expect(statsAfterRetry.failedCount).toBe(0);
    expect(statsAfterRetry.mockSyncedCount).toBe(1);
  });
});

