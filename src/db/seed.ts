import { db } from './index';
import type { Product, StockRecord, StockMovement, AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  eventCode: 'EVT-2026-OMR01',
  eventName: 'OMR Weekend Pop-Up Market',
  outletCode: 'OMR-OUTLET-1',
  deviceId: 'TAB-POS-01',
  currency: 'USD',
  currencySymbol: '$',
  apiBaseUrl: 'https://pos-api.onemorerestaurant.com',
  mockSyncEnabled: true,
  qrMerchantName: 'ONE MORE RESTAURANT EVENT',
  qrAccountNumber: '099 888 777',
  lastSyncTimestamp: undefined,
};

// Inline SVG data URIs for crisp offline rendering on tablets
const createProductSvg = (bg: string, iconColor: string, title: string, iconType: string) => {
  const iconPaths: Record<string, string> = {
    coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" stroke="' + iconColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    tea: '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM10 2v4M7 3l1 3M13 3l-1 3" stroke="' + iconColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    sandwich: '<path d="M3 11l9-7 9 7-9 7-9-7zM3 14l9 7 9-7M3 17l9 7 9-7" stroke="' + iconColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    burger: '<path d="M4 11a8 8 0 0 1 16 0H4zM4 18h16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM3 14h18" stroke="' + iconColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    water: '<path d="M12 2v6M8 8h8v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8zM8 12h8" stroke="' + iconColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    bakery: '<path d="M4 14a8 8 0 0 1 16 0v2H4v-2zM6 18v2M18 18v2M9 10l1 2M15 10l-1 2" stroke="' + iconColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  };

  const path = iconPaths[iconType] || iconPaths['coffee'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" rx="16" fill="${bg}"/>
    <g transform="translate(38, 30) scale(1.0)">${path}</g>
    <text x="50" y="82" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="600" text-anchor="middle" fill="#334155">${title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const SEED_PRODUCTS: Array<{ product: Product; initialStock: number }> = [
  {
    product: {
      id: 'prod-iced-latte',
      name: 'Iced Latte',
      category: 'Coffee',
      price: 350, // $3.50
      image: createProductSvg('#ecfdf5', '#059669', 'Iced Latte', 'coffee'),
      sku: 'COF-LAT-01',
      isActive: true,
      sortOrder: 1,
      description: 'Espresso with cold milk and ice cubes',
    },
    initialStock: 40,
  },
  {
    product: {
      id: 'prod-americano',
      name: 'Americano',
      category: 'Coffee',
      price: 275, // $2.75
      image: createProductSvg('#f0fdf4', '#16a34a', 'Americano', 'coffee'),
      sku: 'COF-AME-01',
      isActive: true,
      sortOrder: 2,
      description: 'Rich double espresso diluted with hot water or poured over ice',
    },
    initialStock: 50,
  },
  {
    product: {
      id: 'prod-green-tea',
      name: 'Green Tea',
      category: 'Tea',
      price: 300, // $3.00
      image: createProductSvg('#f7fee7', '#65a30d', 'Green Tea', 'tea'),
      sku: 'TEA-GRN-01',
      isActive: true,
      sortOrder: 3,
      description: 'Organic Japanese green tea, served hot or iced',
    },
    initialStock: 35,
  },
  {
    product: {
      id: 'prod-sandwich',
      name: 'Club Sandwich',
      category: 'Food',
      price: 450, // $4.50
      image: createProductSvg('#fffbeb', '#d97706', 'Sandwich', 'sandwich'),
      sku: 'FOD-SAN-01',
      isActive: true,
      sortOrder: 4,
      description: 'Toasted multi-grain bread with roasted chicken, lettuce and cheddar',
    },
    initialStock: 25,
  },
  {
    product: {
      id: 'prod-burger',
      name: 'OMR Classic Burger',
      category: 'Food',
      price: 600, // $6.00
      image: createProductSvg('#fff7ed', '#ea580c', 'Burger', 'burger'),
      sku: 'FOD-BGR-01',
      isActive: true,
      sortOrder: 5,
      description: 'Juicy smash patty with melted cheese, house sauce and pickles',
    },
    initialStock: 20,
  },
  {
    product: {
      id: 'prod-bottled-water',
      name: 'Bottled Water',
      category: 'Beverages',
      price: 100, // $1.00
      image: createProductSvg('#eff6ff', '#2563eb', 'Water', 'water'),
      sku: 'BEV-WAT-01',
      isActive: true,
      sortOrder: 6,
      description: 'Chilled 500ml natural mineral water',
    },
    initialStock: 60,
  },
  {
    product: {
      id: 'prod-croissant',
      name: 'Butter Croissant',
      category: 'Bakery',
      price: 325, // $3.25
      image: createProductSvg('#fefce8', '#ca8a04', 'Croissant', 'bakery'),
      sku: 'BAK-CRO-01',
      isActive: true,
      sortOrder: 7,
      description: 'Golden flaky French pastry baked fresh every morning',
    },
    initialStock: 30,
  },
  {
    product: {
      id: 'prod-orange-juice',
      name: 'Fresh Orange Juice',
      category: 'Beverages',
      price: 350, // $3.50
      image: createProductSvg('#fff7ed', '#f97316', 'Orange Juice', 'water'),
      sku: 'BEV-ORJ-01',
      isActive: true,
      sortOrder: 8,
      description: 'Freshly squeezed 100% natural orange juice over ice',
    },
    initialStock: 30,
  },
];

export async function seedDemoData(force = false): Promise<void> {
  const productCount = await db.products.count();

  if (productCount > 0 && !force) {
    return; // Already initialized
  }

  const now = new Date().toISOString();

  await db.transaction('rw', [db.products, db.stock, db.stockMovements, db.settings], async () => {
    if (force) {
      await db.products.clear();
      await db.stock.clear();
      await db.stockMovements.clear();
    }

    // Insert products and initial opening stock
    for (const item of SEED_PRODUCTS) {
      await db.products.put(item.product);

      const stockRecord: StockRecord = {
        productId: item.product.id,
        openingQty: item.initialStock,
        stockIn: 0,
        soldQty: 0,
        wasteQty: 0,
        remainingQty: item.initialStock,
        updatedAt: now,
      };
      await db.stock.put(stockRecord);

      const movement: StockMovement = {
        id: `sm-init-${item.product.id}`,
        productId: item.product.id,
        type: 'OPENING',
        quantity: item.initialStock,
        previousQty: 0,
        newQty: item.initialStock,
        reason: 'Initial Event Opening Stock',
        createdAt: now,
      };
      await db.stockMovements.put(movement);
    }

    // Default settings
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = await db.settings.get(key);
      if (!existing || force) {
        await db.settings.put({ key, value });
      }
    }
  });
}

