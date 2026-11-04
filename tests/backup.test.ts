import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import {
  validateBackupFileContent,
  restoreDatabaseBackup,
} from '../src/services/backupService';

describe('Product & Stock Import / Backup Restore', () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.stock.clear();
    await db.stockMovements.clear();
    await db.orders.clear();
  });

  it('validates and parses a sample products & stock JSON file', () => {
    const sampleJson = JSON.stringify({
      products: [
        {
          id: 'prod-latte-test',
          name: 'Vanilla Latte',
          category: 'Coffee',
          price: 350,
          openingStock: 45,
        },
        {
          name: 'Croissant Test',
          category: 'Bakery',
          price: 2.75, // Test decimal price auto-conversion
          openingStock: 20,
        },
      ],
    });

    const result = validateBackupFileContent(sampleJson);
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('PRODUCTS_AND_STOCK');
    expect(result.summary?.productsCount).toBe(2);
    expect(result.summary?.stockCount).toBe(2);

    // Check price conversion
    const products = result.data?.products;
    expect(products?.[0].price).toBe(350);
    expect(products?.[1].price).toBe(275); // 2.75 -> 275 cents
  });

  it('restores products and initial stock without wiping existing orders', async () => {
    // Insert a dummy existing order
    await db.orders.put({
      id: 'existing-order-1',
      orderNumber: 'OMR-EXISTING',
      createdAt: new Date().toISOString(),
      subtotalAmount: 500,
      totalAmount: 500,
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      syncStatus: 'PENDING',
      syncAttempts: 0,
      eventId: 'EVT-01',
      deviceId: 'TAB-01',
      outletCode: 'MAIN',
      idempotencyKey: 'idemp-1',
    });

    const sampleJson = JSON.stringify({
      products: [
        {
          id: 'prod-imported-1',
          name: 'Caramel Cold Brew',
          category: 'Coffee',
          price: 400,
          openingStock: 50,
        },
      ],
    });

    const validation = validateBackupFileContent(sampleJson);
    expect(validation.valid).toBe(true);

    await restoreDatabaseBackup(validation.data!, validation.mode);

    // Products & Stock should be populated
    const products = await db.products.toArray();
    expect(products.length).toBe(1);
    expect(products[0].name).toBe('Caramel Cold Brew');

    const stock = await db.stock.get('prod-imported-1');
    expect(stock?.openingQty).toBe(50);
    expect(stock?.remainingQty).toBe(50);

    // Initial movement recorded
    const movements = await db.stockMovements.toArray();
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe('OPENING');

    // Existing orders preserved!
    const orders = await db.orders.toArray();
    expect(orders.length).toBe(1);
    expect(orders[0].id).toBe('existing-order-1');
  });
});

