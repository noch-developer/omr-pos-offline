import { db } from '../db';
import type { StockRecord, StockWithProduct, StockMovement } from '../types';
import { calculateRemaining } from '../utils/stock';

export async function getStockWithProducts(): Promise<StockWithProduct[]> {
  const products = await db.products.toArray();
  const stocks = await db.stock.toArray();

  const stockMap = new Map<string, StockRecord>();
  stocks.forEach((s) => stockMap.set(s.productId, s));

  const result: StockWithProduct[] = [];

  for (const product of products) {
    let stock = stockMap.get(product.id);
    if (!stock) {
      stock = {
        productId: product.id,
        openingQty: 0,
        stockIn: 0,
        soldQty: 0,
        wasteQty: 0,
        remainingQty: 0,
        updatedAt: new Date().toISOString(),
      };
      await db.stock.put(stock);
    }
    result.push({
      ...stock,
      product,
    });
  }

  return result.sort((a, b) => a.product.sortOrder - b.product.sortOrder);
}

export async function getStockForProduct(productId: string): Promise<StockRecord | undefined> {
  return await db.stock.get(productId);
}

/**
 * Set or reset opening stock
 */
export async function setOpeningStock(
  productId: string,
  newOpeningQty: number,
  reason = 'Set Opening Stock'
): Promise<StockRecord> {
  if (newOpeningQty < 0) {
    throw new Error('Opening quantity cannot be negative');
  }

  return await db.transaction('rw', [db.stock, db.stockMovements], async () => {
    let stock = await db.stock.get(productId);
    const now = new Date().toISOString();

    if (!stock) {
      stock = {
        productId,
        openingQty: 0,
        stockIn: 0,
        soldQty: 0,
        wasteQty: 0,
        remainingQty: 0,
        updatedAt: now,
      };
    }

    const prevRemaining = stock.remainingQty;
    const openingDelta = newOpeningQty - stock.openingQty;
    const newRemaining = calculateRemaining(
      newOpeningQty,
      stock.stockIn,
      stock.soldQty,
      stock.wasteQty
    );

    if (newRemaining < 0) {
      throw new Error(`Cannot set opening stock to ${newOpeningQty}: Remaining would be negative (${newRemaining})`);
    }

    stock.openingQty = newOpeningQty;
    stock.remainingQty = newRemaining;
    stock.updatedAt = now;

    await db.stock.put(stock);

    const movement: StockMovement = {
      id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId,
      type: 'OPENING',
      quantity: openingDelta,
      previousQty: prevRemaining,
      newQty: newRemaining,
      reason,
      createdAt: now,
    };
    await db.stockMovements.put(movement);

    return stock;
  });
}

/**
 * Add stock in (restock during event)
 */
export async function addStockIn(
  productId: string,
  qtyToAdd: number,
  reason = 'Event Restock'
): Promise<StockRecord> {
  if (qtyToAdd <= 0) {
    throw new Error('Stock in quantity must be greater than zero');
  }

  return await db.transaction('rw', [db.stock, db.stockMovements], async () => {
    let stock = await db.stock.get(productId);
    const now = new Date().toISOString();

    if (!stock) {
      stock = {
        productId,
        openingQty: 0,
        stockIn: 0,
        soldQty: 0,
        wasteQty: 0,
        remainingQty: 0,
        updatedAt: now,
      };
    }

    const prevRemaining = stock.remainingQty;
    const newStockIn = stock.stockIn + qtyToAdd;
    const newRemaining = calculateRemaining(
      stock.openingQty,
      newStockIn,
      stock.soldQty,
      stock.wasteQty
    );

    stock.stockIn = newStockIn;
    stock.remainingQty = newRemaining;
    stock.updatedAt = now;

    await db.stock.put(stock);

    const movement: StockMovement = {
      id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId,
      type: 'STOCK_IN',
      quantity: qtyToAdd,
      previousQty: prevRemaining,
      newQty: newRemaining,
      reason,
      createdAt: now,
    };
    await db.stockMovements.put(movement);

    return stock;
  });
}

/**
 * Record waste (damaged, spoiled, dropped item)
 */
export async function recordWaste(
  productId: string,
  wasteQty: number,
  reason: string
): Promise<StockRecord> {
  if (wasteQty <= 0) {
    throw new Error('Waste quantity must be greater than zero');
  }
  if (!reason || reason.trim().length === 0) {
    throw new Error('A reason is required to record waste');
  }

  return await db.transaction('rw', [db.stock, db.stockMovements], async () => {
    const stock = await db.stock.get(productId);
    if (!stock) {
      throw new Error('Product stock record not found');
    }

    if (stock.remainingQty < wasteQty) {
      throw new Error(
        `Cannot record waste of ${wasteQty}: Only ${stock.remainingQty} remaining in stock`
      );
    }

    const now = new Date().toISOString();
    const prevRemaining = stock.remainingQty;
    const newWaste = stock.wasteQty + wasteQty;
    const newRemaining = calculateRemaining(
      stock.openingQty,
      stock.stockIn,
      stock.soldQty,
      newWaste
    );

    stock.wasteQty = newWaste;
    stock.remainingQty = newRemaining;
    stock.updatedAt = now;

    await db.stock.put(stock);

    const movement: StockMovement = {
      id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId,
      type: 'WASTE',
      quantity: wasteQty,
      previousQty: prevRemaining,
      newQty: newRemaining,
      reason,
      createdAt: now,
    };
    await db.stockMovements.put(movement);

    return stock;
  });
}

/**
 * Physical closing stock count reconciliation
 * Adjusts stock to match actual counted units at event closing
 */
export async function recordPhysicalClosingCount(
  productId: string,
  countedQty: number,
  reason = 'Physical closing count reconciliation'
): Promise<StockRecord> {
  if (countedQty < 0) {
    throw new Error('Physical count cannot be negative');
  }

  return await db.transaction('rw', [db.stock, db.stockMovements], async () => {
    const stock = await db.stock.get(productId);
    if (!stock) {
      throw new Error('Product stock record not found');
    }

    const now = new Date().toISOString();
    const prevRemaining = stock.remainingQty;
    const delta = countedQty - prevRemaining;

    if (delta === 0) {
      return stock; // Exact match, no adjustment needed
    }

    // If delta is negative, attribute discrepancy to waste or adjustment
    if (delta < 0) {
      stock.wasteQty += Math.abs(delta);
    } else {
      // Unrecorded stock in
      stock.stockIn += delta;
    }

    const newRemaining = calculateRemaining(
      stock.openingQty,
      stock.stockIn,
      stock.soldQty,
      stock.wasteQty
    );
    stock.remainingQty = newRemaining;
    stock.updatedAt = now;

    await db.stock.put(stock);

    const movement: StockMovement = {
      id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId,
      type: 'ADJUSTMENT',
      quantity: delta,
      previousQty: prevRemaining,
      newQty: newRemaining,
      reason: `${reason} (${delta > 0 ? '+' + delta : delta})`,
      createdAt: now,
    };
    await db.stockMovements.put(movement);

    return stock;
  });
}

export async function getStockMovements(productId?: string): Promise<StockMovement[]> {
  if (productId) {
    return await db.stockMovements
      .where('productId')
      .equals(productId)
      .reverse()
      .sortBy('createdAt');
  }
  return await db.stockMovements.orderBy('createdAt').reverse().toArray();
}
