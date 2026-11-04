import * as XLSX from 'xlsx';
import { db } from '../db';
import type { StockWithProduct, OrderWithDetails, ProductImportInput } from '../types';
import { getStockWithProducts } from './stockService';
import { getOrders } from './orderService';
import { createFallbackSvg } from './backupService';

export interface ExcelImportValidationResult {
  valid: boolean;
  error?: string;
  products?: ProductImportInput[];
  summary?: {
    totalRows: number;
    categories: string[];
    sampleItems: string[];
  };
}

/**
 * Download a ready-to-fill Excel template (.xlsx) with example menu items
 */
export function downloadExcelTemplate(): void {
  const templateRows = [
    {
      'Product Name': 'Iced Latte',
      Category: 'Coffee',
      'Price ($)': 3.50,
      'Opening Stock': 50,
      SKU: 'COF-LAT-01',
      Description: 'Espresso with cold milk and ice cubes',
    },
    {
      'Product Name': 'Americano',
      Category: 'Coffee',
      'Price ($)': 2.75,
      'Opening Stock': 60,
      SKU: 'COF-AME-01',
      Description: 'Rich double espresso diluted with hot or cold water',
    },
    {
      'Product Name': 'Green Tea',
      Category: 'Tea',
      'Price ($)': 3.00,
      'Opening Stock': 40,
      SKU: 'TEA-GRN-01',
      Description: 'Organic Japanese green tea, served hot or iced',
    },
    {
      'Product Name': 'Club Sandwich',
      Category: 'Food',
      'Price ($)': 4.50,
      'Opening Stock': 25,
      SKU: 'FOD-SAN-01',
      Description: 'Toasted multi-grain bread with chicken and lettuce',
    },
    {
      'Product Name': 'OMR Classic Burger',
      Category: 'Food',
      'Price ($)': 6.00,
      'Opening Stock': 20,
      SKU: 'FOD-BGR-01',
      Description: 'Juicy smash patty with cheddar cheese and house sauce',
    },
    {
      'Product Name': 'Bottled Water',
      Category: 'Beverages',
      'Price ($)': 1.00,
      'Opening Stock': 80,
      SKU: 'BEV-WAT-01',
      Description: 'Chilled natural mineral water 500ml',
    },
    {
      'Product Name': 'Butter Croissant',
      Category: 'Bakery',
      'Price ($)': 3.25,
      'Opening Stock': 30,
      SKU: 'BAK-CRO-01',
      Description: 'Golden flaky French pastry baked fresh daily',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateRows);

  // Column widths
  worksheet['!cols'] = [
    { wch: 24 }, // Product Name
    { wch: 14 }, // Category
    { wch: 12 }, // Price ($)
    { wch: 15 }, // Opening Stock
    { wch: 16 }, // SKU
    { wch: 40 }, // Description
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products & Stock');

  XLSX.writeFile(workbook, 'omr-products-stock-template.xlsx');
}

/**
 * Export current products and live stock report to Excel (.xlsx)
 */
export async function exportStockToExcel(): Promise<string> {
  const stockItems: StockWithProduct[] = await getStockWithProducts();
  const settingsEntries = await db.settings.toArray();
  const settingsMap = new Map(settingsEntries.map((s) => [s.key, s.value]));

  const eventCode = (settingsMap.get('eventCode') as string) || 'EVENT';

  const rows = stockItems.map((item) => ({
    'Product Name': item.product.name,
    Category: item.product.category,
    'Price ($)': (item.product.price / 100).toFixed(2),
    'Opening Qty': item.openingQty,
    'Stock In (+)': item.stockIn,
    'Sold Qty (-)': item.soldQty,
    'Waste Qty (-)': item.wasteQty,
    'Remaining Stock': item.remainingQty,
    'Total Value ($)': ((item.remainingQty * item.product.price) / 100).toFixed(2),
    SKU: item.product.sku,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory Report');

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 10);
  const fileName = `omr-inventory-${eventCode}-${dateStr}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  return fileName;
}

/**
 * Export all orders, line items, and stock movements to a multi-sheet Excel workbook
 */
export async function exportOrdersToExcel(): Promise<string> {
  const orders: OrderWithDetails[] = await getOrders();
  const stockMovements = await db.stockMovements.orderBy('createdAt').reverse().toArray();
  const products = await db.products.toArray();
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Sheet 1: Orders summary
  const orderRows = orders.map((o) => ({
    'Order #': o.orderNumber,
    'Date & Time': new Date(o.createdAt).toLocaleString(),
    'Total Amount ($)': (o.totalAmount / 100).toFixed(2),
    'Subtotal ($)': (o.subtotalAmount / 100).toFixed(2),
    'Payment Method': o.paymentMethod,
    'Tendered ($)': o.payment?.amountReceived ? (o.payment.amountReceived / 100).toFixed(2) : '',
    'Change ($)': o.payment?.changeGiven ? (o.payment.changeGiven / 100).toFixed(2) : '',
    'QR Reference': o.payment?.reference || '',
    Status: o.status,
    'Cancellation Reason': o.cancellationReason || '',
    'Sync Status': o.syncStatus,
    'Device ID': o.deviceId,
  }));

  // Sheet 2: Itemized sales breakdown
  const itemRows: Array<Record<string, unknown>> = [];
  for (const o of orders) {
    for (const item of o.items) {
      itemRows.push({
        'Order #': o.orderNumber,
        Date: new Date(o.createdAt).toLocaleDateString(),
        Time: new Date(o.createdAt).toLocaleTimeString(),
        'Product Name': item.productName,
        Quantity: item.quantity,
        'Unit Price ($)': (item.unitPrice / 100).toFixed(2),
        'Line Total ($)': (item.totalPrice / 100).toFixed(2),
        'Order Status': o.status,
      });
    }
  }

  // Sheet 3: Stock Movement Ledger
  const movementRows = stockMovements.map((m) => {
    const prod = productMap.get(m.productId);
    return {
      'Date & Time': new Date(m.createdAt).toLocaleString(),
      Product: prod?.name || m.productId,
      'Movement Type': m.type,
      'Quantity Change': m.quantity,
      'Remaining Stock': m.newQty,
      Reason: m.reason,
    };
  });

  const workbook = XLSX.utils.book_new();

  const wsOrders = XLSX.utils.json_to_sheet(orderRows);
  const wsItems = XLSX.utils.json_to_sheet(itemRows);
  const wsMovements = XLSX.utils.json_to_sheet(movementRows);

  XLSX.utils.book_append_sheet(workbook, wsOrders, 'Orders');
  XLSX.utils.book_append_sheet(workbook, wsItems, 'Items Sold');
  XLSX.utils.book_append_sheet(workbook, wsMovements, 'Stock Ledger');

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 10);
  const fileName = `omr-sales-report-${dateStr}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  return fileName;
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return await file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse an uploaded Excel (.xlsx, .xls) or CSV file containing products and stock
 */
export async function parseExcelProductFile(file: File): Promise<ExcelImportValidationResult> {
  try {
    const data = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(data, { type: 'array' });

    if (!workbook.SheetNames.length) {
      return { valid: false, error: 'The uploaded Excel file contains no worksheets.' };
    }

    // Read the first worksheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to JSON array of row objects
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return { valid: false, error: 'The uploaded worksheet is empty.' };
    }

    const products: ProductImportInput[] = [];
    const categoriesSet = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];

      // Flexible column name matching (case-insensitive & trimmed)
      const getVal = (possibleKeys: string[]): unknown => {
        for (const key of Object.keys(row)) {
          const normalized = key.trim().toLowerCase();
          for (const target of possibleKeys) {
            if (normalized === target.toLowerCase() || normalized.replace(/[^a-z0-9]/g, '') === target.replace(/[^a-z0-9]/g, '')) {
              return row[key];
            }
          }
        }
        return undefined;
      };

      const rawName = getVal(['product name', 'product', 'name', 'item', 'item name']);
      if (!rawName || String(rawName).trim() === '') {
        continue; // Skip blank rows
      }

      const name = String(rawName).trim();
      const rawCategory = getVal(['category', 'type', 'group']) || 'Food';
      const category = String(rawCategory).trim() || 'Food';
      categoriesSet.add(category);

      const rawPrice = getVal(['price', 'price ($)', 'selling price', 'unit price', 'amount']) ?? 0;
      let priceNum = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice).replace(/[^0-9.-]/g, ''));
      if (isNaN(priceNum)) priceNum = 0;

      // If price entered as 3.5 or 3.50, convert to integer cents (350). If already > 50 and whole, assume cents or dollars appropriately.
      let priceCents = priceNum;
      if (!Number.isInteger(priceNum) || priceNum < 50) {
        priceCents = Math.round(priceNum * 100);
      }

      const rawStock = getVal(['opening stock', 'stock', 'opening qty', 'qty', 'quantity', 'initial stock']) ?? 30;
      let openingStock = typeof rawStock === 'number' ? rawStock : parseInt(String(rawStock).replace(/[^0-9-]/g, ''), 10);
      if (isNaN(openingStock) || openingStock < 0) openingStock = 0;

      const rawSku = getVal(['sku', 'code', 'barcode']);
      const sku = rawSku ? String(rawSku).trim() : `SKU-${name.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`;

      const rawDesc = getVal(['description', 'desc', 'notes', 'details']);
      const description = rawDesc ? String(rawDesc).trim() : '';

      products.push({
        id: `prod-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i + 1}`,
        name,
        category,
        price: priceCents,
        openingStock,
        sku,
        description,
        isActive: true,
        sortOrder: i + 1,
      });
    }

    if (products.length === 0) {
      return {
        valid: false,
        error: 'Could not find valid product rows. Ensure your spreadsheet contains a column named "Product Name" or "Name".',
      };
    }

    return {
      valid: true,
      products,
      summary: {
        totalRows: products.length,
        categories: Array.from(categoriesSet),
        sampleItems: products.slice(0, 5).map((p) => `${p.name} ($${(p.price / 100).toFixed(2)}, stock: ${p.openingStock})`),
      },
    };
  } catch (err: unknown) {
    return {
      valid: false,
      error: 'Error reading Excel file: ' + (err instanceof Error ? err.message : 'Unknown parse error'),
    };
  }
}

/**
 * Import validated products into Dexie IndexedDB
 */
export async function commitExcelProductsImport(products: ProductImportInput[]): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', [db.products, db.stock, db.stockMovements], async () => {
    // Clear old products & stock
    await db.products.clear();
    await db.stock.clear();
    await db.stockMovements.where('type').equals('OPENING').delete();

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const image = p.image || createFallbackSvg(p.name, p.category);

      await db.products.put({
        id: p.id!,
        name: p.name,
        category: p.category,
        price: p.price,
        image,
        sku: p.sku || `SKU-${p.name.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
        isActive: true,
        sortOrder: p.sortOrder || i + 1,
        description: p.description || '',
      });

      const openingQty = p.openingStock ?? 30;

      await db.stock.put({
        productId: p.id!,
        openingQty,
        stockIn: 0,
        soldQty: 0,
        wasteQty: 0,
        remainingQty: openingQty,
        updatedAt: now,
      });

      await db.stockMovements.put({
        id: `sm-excel-${p.id}`,
        productId: p.id!,
        type: 'OPENING',
        quantity: openingQty,
        previousQty: 0,
        newQty: openingQty,
        reason: 'Imported from Excel spreadsheet',
        createdAt: now,
      });
    }
  });
}
