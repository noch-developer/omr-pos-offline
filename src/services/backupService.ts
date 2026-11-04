import { db } from '../db';
import type { BackupData, Product, StockRecord, StockMovement, ProductImportInput } from '../types';

export function createFallbackSvg(name: string, category: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    Coffee: { bg: '#ecfdf5', text: '#059669' },
    Tea: { bg: '#f7fee7', text: '#65a30d' },
    Food: { bg: '#fff7ed', text: '#ea580c' },
    Beverages: { bg: '#eff6ff', text: '#2563eb' },
    Bakery: { bg: '#fefce8', text: '#ca8a04' },
  };

  const c = colors[category] || { bg: '#f1f5f9', text: '#475569' };
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" rx="18" fill="${c.bg}"/>
    <circle cx="50" cy="45" r="22" fill="${c.text}" fill-opacity="0.15"/>
    <text x="50" y="52" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="800" text-anchor="middle" fill="${c.text}">${initials}</text>
    <text x="50" y="80" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="8" font-weight="700" text-anchor="middle" fill="#334155">${name.slice(0, 16)}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function exportDatabaseBackup(): Promise<string> {
  const products = await db.products.toArray();
  const stock = await db.stock.toArray();
  const orders = await db.orders.toArray();
  const orderItems = await db.orderItems.toArray();
  const payments = await db.payments.toArray();
  const stockMovements = await db.stockMovements.toArray();
  const syncQueue = await db.syncQueue.toArray();
  const settingsEntries = await db.settings.toArray();

  const settingsObj: Record<string, unknown> = {};
  for (const s of settingsEntries) {
    settingsObj[s.key] = s.value;
  }

  const backupData: BackupData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    settings: settingsObj,
    products,
    stock,
    orders,
    orderItems,
    payments,
    stockMovements,
    syncQueue,
  };

  const jsonString = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `omr-pos-backup-${dateStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return fileName;
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  mode?: 'FULL_BACKUP' | 'PRODUCTS_AND_STOCK';
  data?: BackupData;
  summary?: {
    productsCount: number;
    stockCount: number;
    ordersCount: number;
    paymentsCount: number;
    exportedAt: string;
    description: string;
  };
}

export function validateBackupFileContent(jsonText: string): BackupValidationResult {
  try {
    const parsed = JSON.parse(jsonText);

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'File is not a valid JSON object or array' };
    }

    // Case 1: Raw array of products [ { name, price, ... } ]
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return { valid: false, error: 'Product array is empty' };
      }
      return buildProductsOnlyBackup(parsed);
    }

    // Case 2: Object with products only: { products: [ ... ] }
    if (Array.isArray(parsed.products) && (!parsed.orders || !Array.isArray(parsed.orders))) {
      return buildProductsOnlyBackup(parsed.products, parsed.stock);
    }

    // Case 3: Full Backup: { products: [...], stock: [...], orders: [...] }
    if (Array.isArray(parsed.products) && Array.isArray(parsed.orders)) {
      return {
        valid: true,
        mode: 'FULL_BACKUP',
        data: parsed as BackupData,
        summary: {
          productsCount: parsed.products.length,
          stockCount: Array.isArray(parsed.stock) ? parsed.stock.length : 0,
          ordersCount: parsed.orders.length,
          paymentsCount: Array.isArray(parsed.payments) ? parsed.payments.length : 0,
          exportedAt: parsed.exportedAt || new Date().toISOString(),
          description: 'Full Database Restore (All orders, payments, products & stock)',
        },
      };
    }

    return {
      valid: false,
      error: 'Unrecognized JSON structure. Expected either a product catalog or full backup file.',
    };
  } catch (err) {
    return {
      valid: false,
      error: 'Invalid JSON format: ' + (err instanceof Error ? err.message : 'Parse error'),
    };
  }
}

function buildProductsOnlyBackup(
  productInputs: ProductImportInput[],
  existingStocks?: StockRecord[]
): BackupValidationResult {
  const now = new Date().toISOString();
  const products: Product[] = [];
  const stockList: StockRecord[] = [];
  const movements: StockMovement[] = [];

  const stockLookup = new Map<string, StockRecord>();
  if (Array.isArray(existingStocks)) {
    existingStocks.forEach((s) => stockLookup.set(s.productId, s));
  }

  for (let i = 0; i < productInputs.length; i++) {
    const raw = productInputs[i];
    if (!raw.name) {
      return { valid: false, error: `Product at index ${i} is missing required 'name' field` };
    }

    // Price conversion: If float like 3.50, convert to integer cents (350)
    let priceCents = raw.price ?? 0;
    if (typeof priceCents === 'number' && (!Number.isInteger(priceCents) || priceCents < 50)) {
      priceCents = Math.round(priceCents * 100);
    }

    const productId =
      raw.id || `prod-${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i + 1}`;
    const category = raw.category || 'Coffee';
    const image = raw.image || createFallbackSvg(raw.name, category);
    const sku = raw.sku || `SKU-${raw.name.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`;
    const initialOpening = raw.openingStock ?? 30;

    const product: Product = {
      id: productId,
      name: raw.name,
      category,
      price: priceCents,
      sku,
      image,
      isActive: raw.isActive !== false,
      sortOrder: raw.sortOrder ?? i + 1,
      description: raw.description || '',
    };
    products.push(product);

    // Stock record
    const existingStock = stockLookup.get(productId);
    const openingQty = existingStock ? existingStock.openingQty : initialOpening;
    const stockIn = existingStock ? existingStock.stockIn : 0;
    const soldQty = existingStock ? existingStock.soldQty : 0;
    const wasteQty = existingStock ? existingStock.wasteQty : 0;
    const remainingQty = existingStock
      ? existingStock.remainingQty
      : openingQty + stockIn - soldQty - wasteQty;

    const stockRecord: StockRecord = {
      productId,
      openingQty,
      stockIn,
      soldQty,
      wasteQty,
      remainingQty,
      updatedAt: now,
    };
    stockList.push(stockRecord);

    const movement: StockMovement = {
      id: `sm-import-${productId}`,
      productId,
      type: 'OPENING',
      quantity: openingQty,
      previousQty: 0,
      newQty: openingQty,
      reason: 'Imported Initial Opening Stock',
      createdAt: now,
    };
    movements.push(movement);
  }

  const backupData: BackupData = {
    version: '1.0.0',
    exportedAt: now,
    settings: {},
    products,
    stock: stockList,
    orders: [],
    orderItems: [],
    payments: [],
    stockMovements: movements,
    syncQueue: [],
  };

  return {
    valid: true,
    mode: 'PRODUCTS_AND_STOCK',
    data: backupData,
    summary: {
      productsCount: products.length,
      stockCount: stockList.length,
      ordersCount: 0,
      paymentsCount: 0,
      exportedAt: now,
      description: 'Product Menu & Opening Stock Import (Existing orders preserved)',
    },
  };
}

export async function restoreDatabaseBackup(
  backup: BackupData,
  mode: 'FULL_BACKUP' | 'PRODUCTS_AND_STOCK' = 'FULL_BACKUP'
): Promise<void> {
  if (mode === 'PRODUCTS_AND_STOCK') {
    // Only replace products and stock, leave orders, payments and settings intact!
    await db.transaction('rw', [db.products, db.stock, db.stockMovements], async () => {
      await db.products.clear();
      await db.stock.clear();
      await db.stockMovements.where('type').equals('OPENING').delete();

      if (backup.products?.length) await db.products.bulkPut(backup.products);
      if (backup.stock?.length) await db.stock.bulkPut(backup.stock);
      if (backup.stockMovements?.length) await db.stockMovements.bulkPut(backup.stockMovements);
    });
    return;
  }

  // Full restore
  await db.transaction(
    'rw',
    [
      db.products,
      db.stock,
      db.orders,
      db.orderItems,
      db.payments,
      db.stockMovements,
      db.syncQueue,
      db.settings,
    ],
    async () => {
      await db.products.clear();
      await db.stock.clear();
      await db.orders.clear();
      await db.orderItems.clear();
      await db.payments.clear();
      await db.stockMovements.clear();
      await db.syncQueue.clear();

      if (backup.products?.length) await db.products.bulkPut(backup.products);
      if (backup.stock?.length) await db.stock.bulkPut(backup.stock);
      if (backup.orders?.length) await db.orders.bulkPut(backup.orders);
      if (backup.orderItems?.length) await db.orderItems.bulkPut(backup.orderItems);
      if (backup.payments?.length) await db.payments.bulkPut(backup.payments);
      if (backup.stockMovements?.length) await db.stockMovements.bulkPut(backup.stockMovements);
      if (backup.syncQueue?.length) await db.syncQueue.bulkPut(backup.syncQueue);

      if (backup.settings && typeof backup.settings === 'object') {
        for (const [key, value] of Object.entries(backup.settings)) {
          await db.settings.put({ key, value });
        }
      }
    }
  );
}

export function downloadSampleProductStockTemplate(): void {
  const sampleData = {
    products: [
      {
        id: "prod-iced-latte",
        name: "Iced Latte",
        category: "Coffee",
        price: 350,
        sku: "COF-LAT-01",
        openingStock: 50,
        description: "Freshly brewed espresso with chilled milk and ice"
      },
      {
        id: "prod-americano",
        name: "Americano",
        category: "Coffee",
        price: 275,
        sku: "COF-AME-01",
        openingStock: 60,
        description: "Classic double shot espresso diluted with hot or cold water"
      },
      {
        id: "prod-green-tea",
        name: "Green Tea",
        category: "Tea",
        price: 300,
        sku: "TEA-GRN-01",
        openingStock: 40,
        description: "Premium Japanese green tea"
      },
      {
        id: "prod-sandwich",
        name: "Club Sandwich",
        category: "Food",
        price: 450,
        sku: "FOD-SAN-01",
        openingStock: 25,
        description: "Toasted bread with grilled chicken, bacon, lettuce and tomato"
      },
      {
        id: "prod-burger",
        name: "OMR Classic Burger",
        category: "Food",
        price: 600,
        sku: "FOD-BGR-01",
        openingStock: 20,
        description: "Beef burger with melted cheddar cheese and house sauce"
      },
      {
        id: "prod-bottled-water",
        name: "Bottled Water",
        category: "Beverages",
        price: 100,
        sku: "BEV-WAT-01",
        openingStock: 80,
        description: "Chilled natural mineral water 500ml"
      },
      {
        id: "prod-croissant",
        name: "Butter Croissant",
        category: "Bakery",
        price: 325,
        sku: "BAK-CRO-01",
        openingStock: 30,
        description: "Flaky golden butter croissant"
      },
      {
        id: "prod-orange-juice",
        name: "Fresh Orange Juice",
        category: "Beverages",
        price: 350,
        sku: "BEV-ORJ-01",
        openingStock: 35,
        description: "100% freshly squeezed orange juice"
      }
    ]
  };

  const jsonString = JSON.stringify(sampleData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'omr-sample-products-stock.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
