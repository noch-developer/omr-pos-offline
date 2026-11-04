import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import {
  setOpeningStock,
  addStockIn,
  recordWaste,
  recordPhysicalClosingCount,
} from '../src/services/stockService';
import { calculateRemaining } from '../src/utils/stock';

describe('Stock Management & Formula Tests', () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.stock.clear();
    await db.stockMovements.clear();

    await db.products.put({
      id: 'test-product-1',
      name: 'Iced Latte',
      category: 'Coffee',
      price: 350,
      image: '',
      sku: 'COF-01',
      isActive: true,
      sortOrder: 1,
    });
  });

  it('calculates remaining stock with formula: Opening + Stock In - Sold - Waste', () => {
    // Opening: 50, In: 20, Sold: 15, Waste: 5 -> Remaining: 50
    expect(calculateRemaining(50, 20, 15, 5)).toBe(50);

    // Opening: 10, In: 0, Sold: 10, Waste: 0 -> Remaining: 0
    expect(calculateRemaining(10, 0, 10, 0)).toBe(0);

    // Negative protection / zero guards
    expect(calculateRemaining(-5, 10, 2, 1)).toBe(7);
  });

  it('sets opening stock and logs movement ledger', async () => {
    const stock = await setOpeningStock('test-product-1', 40, 'Initial Event Opening');

    expect(stock.openingQty).toBe(40);
    expect(stock.remainingQty).toBe(40);

    const movements = await db.stockMovements.where('productId').equals('test-product-1').toArray();
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe('OPENING');
    expect(movements[0].newQty).toBe(40);
  });

  it('adds stock in (restock) correctly', async () => {
    await setOpeningStock('test-product-1', 20);
    const updated = await addStockIn('test-product-1', 15, 'Mid-day Restock');

    expect(updated.stockIn).toBe(15);
    expect(updated.remainingQty).toBe(35); // 20 + 15
  });

  it('records waste and prevents recording waste higher than available stock', async () => {
    await setOpeningStock('test-product-1', 10);
    const afterWaste = await recordWaste('test-product-1', 3, 'Spilled cup');

    expect(afterWaste.wasteQty).toBe(3);
    expect(afterWaste.remainingQty).toBe(7);

    // Attempting to record waste > remaining must throw error
    await expect(recordWaste('test-product-1', 10, 'Excess waste')).rejects.toThrow(
      /Cannot record waste of 10: Only 7 remaining in stock/
    );
  });

  it('reconciles physical closing count at end of event', async () => {
    await setOpeningStock('test-product-1', 30);
    // Physical count shows 28 remaining (2 units discrepancy attributed to waste)
    const reconciled = await recordPhysicalClosingCount('test-product-1', 28, 'Closing Audit');

    expect(reconciled.remainingQty).toBe(28);
    expect(reconciled.wasteQty).toBe(2);

    const movements = await db.stockMovements.where('productId').equals('test-product-1').toArray();
    const adjustMovement = movements.find((m) => m.type === 'ADJUSTMENT');
    expect(adjustMovement).toBeDefined();
    expect(adjustMovement?.newQty).toBe(28);
  });
});

