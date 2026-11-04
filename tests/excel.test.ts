import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { db } from '../src/db';
import { parseExcelProductFile, commitExcelProductsImport } from '../src/services/excelService';

describe('Excel Spreadsheet Import & Export', () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.stock.clear();
    await db.stockMovements.clear();
  });

  it('parses an uploaded Excel file with products and opening stock', async () => {
    // Generate a test Excel buffer
    const testRows = [
      {
        'Product Name': 'Matcha Latte',
        Category: 'Tea',
        'Price ($)': 4.25,
        'Opening Stock': 35,
        SKU: 'TEA-MAT-01',
      },
      {
        'Product Name': 'Avocado Toast',
        Category: 'Food',
        'Price ($)': 5.50,
        'Opening Stock': 20,
        SKU: 'FOD-AVO-01',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(testRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu');
    const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

    const file = new File([excelBuffer], 'test-menu.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const parsed = await parseExcelProductFile(file);
    expect(parsed.valid).toBe(true);
    expect(parsed.products?.length).toBe(2);

    const p1 = parsed.products?.[0];
    expect(p1?.name).toBe('Matcha Latte');
    expect(p1?.category).toBe('Tea');
    expect(p1?.price).toBe(425); // 4.25 -> 425 cents
    expect(p1?.openingStock).toBe(35);

    const p2 = parsed.products?.[1];
    expect(p2?.name).toBe('Avocado Toast');
    expect(p2?.price).toBe(550); // 5.50 -> 550 cents
    expect(p2?.openingStock).toBe(20);
  });

  it('commits parsed Excel products into IndexedDB and logs initial opening stock', async () => {
    const productsToCommit = [
      {
        id: 'prod-iced-tea',
        name: 'Lemon Iced Tea',
        category: 'Tea',
        price: 300,
        openingStock: 45,
      },
    ];

    await commitExcelProductsImport(productsToCommit);

    const dbProducts = await db.products.toArray();
    expect(dbProducts.length).toBe(1);
    expect(dbProducts[0].name).toBe('Lemon Iced Tea');

    const dbStock = await db.stock.get('prod-iced-tea');
    expect(dbStock?.openingQty).toBe(45);
    expect(dbStock?.remainingQty).toBe(45);

    const movements = await db.stockMovements.where('productId').equals('prod-iced-tea').toArray();
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe('OPENING');
    expect(movements[0].quantity).toBe(45);
  });
});
