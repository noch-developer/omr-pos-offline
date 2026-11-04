export type ProductCategory = 'Coffee' | 'Tea' | 'Food' | 'Beverages' | 'Bakery' | 'All';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number; // in cents, e.g. 450 = $4.50
  image: string;
  sku: string;
  isActive: boolean;
  sortOrder: number;
  description?: string;
}

export interface ProductImportInput {
  id?: string;
  name: string;
  category: string;
  price: number; // In cents (e.g. 350) or dollar float (e.g. 3.50)
  sku?: string;
  image?: string;
  isActive?: boolean;
  sortOrder?: number;
  description?: string;
  openingStock?: number;
}

export interface StockRecord {
  productId: string;
  openingQty: number;
  stockIn: number;
  soldQty: number;
  wasteQty: number;
  remainingQty: number; // Opening + Stock In - Sold - Waste
  updatedAt: string;
}

export interface StockWithProduct extends StockRecord {
  product: Product;
}

export type StockMovementType =
  | 'OPENING'
  | 'STOCK_IN'
  | 'SALE'
  | 'WASTE'
  | 'ADJUSTMENT'
  | 'SALE_CANCELLED_RETURN';

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number; // Quantity changed (e.g. +5 or -5)
  previousQty: number;
  newQty: number;
  reason: string;
  referenceId?: string; // e.g. orderId
  createdAt: string;
}

export type PaymentMethod = 'CASH' | 'QR';

export interface PaymentRecord {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number; // in cents
  amountReceived?: number; // for cash, in cents
  changeGiven?: number; // for cash, in cents
  reference?: string; // for QR, e.g. bank auth / tx ref
  status: 'VERIFIED' | 'COMPLETED';
  paidAt: string;
}

export type OrderStatus = 'COMPLETED' | 'CANCELLED';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED' | 'MOCK_SYNCED';

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  unitPrice: number; // in cents
  quantity: number;
  totalPrice: number; // in cents (unitPrice * quantity)
}

export interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  totalAmount: number; // in cents
  subtotalAmount: number; // in cents
  taxAmount?: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  cancellationReason?: string;
  cancelledAt?: string;
  syncStatus: SyncStatus;
  syncAttempts: number;
  lastSyncError?: string;
  syncedAt?: string;
  eventId: string;
  deviceId: string;
  outletCode: string;
  idempotencyKey: string;
}

export interface OrderWithDetails extends Order {
  items: OrderItem[];
  payment?: PaymentRecord;
}

export interface SyncQueueItem {
  id: string;
  entityType: 'ORDER' | 'STOCK_MOVEMENT';
  entityId: string;
  action: 'CREATE' | 'UPDATE';
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  eventCode: string;
  eventName: string;
  outletCode: string;
  deviceId: string;
  currency: string;
  currencySymbol: string;
  apiBaseUrl: string;
  mockSyncEnabled: boolean;
  qrMerchantName: string;
  qrAccountNumber: string;
  lastSyncTimestamp?: string;
}

export interface SyncPayload {
  eventId: string;
  deviceId: string;
  outletCode: string;
  syncTimestamp: string;
  idempotencyKey: string;
  orders: Order[];
  orderItems: OrderItem[];
  payments: PaymentRecord[];
  stockMovements: StockMovement[];
}

export interface SyncResponse {
  success: boolean;
  importedCounts: {
    orders: number;
    items: number;
    payments: number;
    stockMovements: number;
  };
  serverTimestamp: string;
  message?: string;
  isMock?: boolean;
}

export interface BackupData {
  version: string;
  exportedAt: string;
  settings: Record<string, unknown>;
  products: Product[];
  stock: StockRecord[];
  orders: Order[];
  orderItems: OrderItem[];
  payments: PaymentRecord[];
  stockMovements: StockMovement[];
  syncQueue: SyncQueueItem[];
}

