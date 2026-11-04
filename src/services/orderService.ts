import { db } from '../db';
import type {
  Order,
  OrderItem,
  PaymentRecord,
  OrderWithDetails,
  PaymentMethod,
  OrderStatus,
  SyncStatus,
  StockMovement,
  SyncQueueItem,
} from '../types';
import { calculateRemaining } from '../utils/stock';
import { getSettings } from './settingsService';

export interface CheckoutItemParam {
  productId: string;
  quantity: number;
}

export interface CheckoutParams {
  items: CheckoutItemParam[];
  paymentMethod: PaymentMethod;
  amountReceived?: number; // integer cents for cash
  qrReference?: string;
  qrVerified?: boolean;
}

/**
 * Generate human-readable sequential order number: OMR-YYYYMMDD-XXXX
 */
async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePrefix = `OMR-${year}${month}${day}-`;

  const totalOrdersToday = await db.orders
    .where('orderNumber')
    .startsWith(datePrefix)
    .count();

  const seq = String(totalOrdersToday + 1).padStart(4, '0');
  return `${datePrefix}${seq}`;
}

/**
 * Atomic Order Creation, Payment Verification, and Stock Deduction
 */
export async function createOrderAndPayment(
  params: CheckoutParams
): Promise<OrderWithDetails> {
  if (!params.items || params.items.length === 0) {
    throw new Error('Cannot checkout an empty cart');
  }

  // QR Payment verification check
  if (params.paymentMethod === 'QR') {
    if (!params.qrReference || params.qrReference.trim().length === 0) {
      throw new Error('Payment reference code is required for QR transactions');
    }
    if (!params.qrVerified) {
      throw new Error(
        'Staff must verify that the QR transfer has been successfully received before completing order'
      );
    }
  }

  const settings = await getSettings();
  const now = new Date().toISOString();
  const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const paymentId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const idempotencyKey = `idemp-${orderId}`;

  return await db.transaction(
    'rw',
    [
      db.products,
      db.stock,
      db.orders,
      db.orderItems,
      db.payments,
      db.stockMovements,
      db.syncQueue,
    ],
    async () => {
      // 1. Validate all products and stock sufficiency
      const orderItems: OrderItem[] = [];
      let subtotalAmount = 0;

      for (const item of params.items) {
        if (item.quantity <= 0) {
          throw new Error(`Invalid item quantity: ${item.quantity}`);
        }

        const product = await db.products.get(item.productId);
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        const stock = await db.stock.get(item.productId);
        if (!stock) {
          throw new Error(`Stock record not found for product: ${product.name}`);
        }

        if (stock.remainingQty < item.quantity) {
          throw new Error(
            `Insufficient stock for "${product.name}". Requested: ${item.quantity}, Available: ${stock.remainingQty}`
          );
        }

        const itemTotal = product.price * item.quantity;
        subtotalAmount += itemTotal;

        orderItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          orderId,
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          quantity: item.quantity,
          totalPrice: itemTotal,
        });
      }

      const totalAmount = subtotalAmount;

      // 2. Validate Cash payment if applicable
      let changeGiven = 0;
      if (params.paymentMethod === 'CASH') {
        const received = params.amountReceived ?? totalAmount;
        if (received < totalAmount) {
          throw new Error(
            `Insufficient cash received! Total is $${(totalAmount / 100).toFixed(2)}, received: $${(received / 100).toFixed(2)}`
          );
        }
        changeGiven = received - totalAmount;
      }

      // 3. Generate sequential order number
      const orderNumber = await generateOrderNumber();

      // 4. Create Order record
      const order: Order = {
        id: orderId,
        orderNumber,
        createdAt: now,
        subtotalAmount,
        totalAmount,
        paymentMethod: params.paymentMethod,
        status: 'COMPLETED',
        syncStatus: 'PENDING',
        syncAttempts: 0,
        eventId: settings.eventCode,
        deviceId: settings.deviceId,
        outletCode: settings.outletCode,
        idempotencyKey,
      };

      await db.orders.put(order);

      // 5. Create Order Items
      for (const item of orderItems) {
        await db.orderItems.put(item);
      }

      // 6. Create Payment record
      const payment: PaymentRecord = {
        id: paymentId,
        orderId,
        method: params.paymentMethod,
        amount: totalAmount,
        amountReceived: params.paymentMethod === 'CASH' ? params.amountReceived : undefined,
        changeGiven: params.paymentMethod === 'CASH' ? changeGiven : undefined,
        reference: params.paymentMethod === 'QR' ? params.qrReference?.trim() : undefined,
        status: 'COMPLETED',
        paidAt: now,
      };

      await db.payments.put(payment);

      // 7. Deduct stock and record stock movements
      for (const item of orderItems) {
        const stock = (await db.stock.get(item.productId))!;
        const prevRemaining = stock.remainingQty;
        const newSold = stock.soldQty + item.quantity;
        const newRemaining = calculateRemaining(
          stock.openingQty,
          stock.stockIn,
          newSold,
          stock.wasteQty
        );

        stock.soldQty = newSold;
        stock.remainingQty = newRemaining;
        stock.updatedAt = now;

        await db.stock.put(stock);

        const movement: StockMovement = {
          id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId: item.productId,
          type: 'SALE',
          quantity: item.quantity,
          previousQty: prevRemaining,
          newQty: newRemaining,
          reason: `Sale Order #${orderNumber}`,
          referenceId: orderId,
          createdAt: now,
        };
        await db.stockMovements.put(movement);
      }

      // 8. Register to Sync Queue
      const queueItem: SyncQueueItem = {
        id: `sq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        entityType: 'ORDER',
        entityId: orderId,
        action: 'CREATE',
        status: 'PENDING',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.syncQueue.put(queueItem);

      return {
        ...order,
        items: orderItems,
        payment,
      };
    }
  );
}

/**
 * Cancel an order with a reason
 * - Validates order status is COMPLETED
 * - Reverses stock exactly once
 * - Prevents duplicate cancellation
 * - Enqueues cancellation for backend synchronization
 */
export async function cancelOrder(orderId: string, reason: string): Promise<Order> {
  if (!reason || reason.trim().length === 0) {
    throw new Error('A cancellation reason is required');
  }

  return await db.transaction(
    'rw',
    [
      db.orders,
      db.orderItems,
      db.stock,
      db.stockMovements,
      db.syncQueue,
    ],
    async () => {
      const order = await db.orders.get(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Prevent duplicate cancellation
      if (order.status === 'CANCELLED') {
        throw new Error(`Order #${order.orderNumber} is already cancelled`);
      }

      const now = new Date().toISOString();
      const items = await db.orderItems.where('orderId').equals(orderId).toArray();

      // Reverse stock for all items
      for (const item of items) {
        const stock = await db.stock.get(item.productId);
        if (stock) {
          const prevRemaining = stock.remainingQty;
          // Reverse sold quantity
          const newSold = Math.max(0, stock.soldQty - item.quantity);
          const newRemaining = calculateRemaining(
            stock.openingQty,
            stock.stockIn,
            newSold,
            stock.wasteQty
          );

          stock.soldQty = newSold;
          stock.remainingQty = newRemaining;
          stock.updatedAt = now;

          await db.stock.put(stock);

          const movement: StockMovement = {
            id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            productId: item.productId,
            type: 'SALE_CANCELLED_RETURN',
            quantity: item.quantity,
            previousQty: prevRemaining,
            newQty: newRemaining,
            reason: `Cancelled Order #${order.orderNumber}: ${reason.trim()}`,
            referenceId: orderId,
            createdAt: now,
          };
          await db.stockMovements.put(movement);
        }
      }

      // Update order status
      order.status = 'CANCELLED';
      order.cancellationReason = reason.trim();
      order.cancelledAt = now;
      order.syncStatus = 'PENDING'; // Needs to sync cancellation state

      await db.orders.put(order);

      // Register cancellation update to syncQueue
      const queueItem: SyncQueueItem = {
        id: `sq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        entityType: 'ORDER',
        entityId: orderId,
        action: 'UPDATE',
        status: 'PENDING',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.syncQueue.put(queueItem);

      return order;
    }
  );
}

export async function getOrderWithDetails(orderId: string): Promise<OrderWithDetails | undefined> {
  const order = await db.orders.get(orderId);
  if (!order) return undefined;

  const items = await db.orderItems.where('orderId').equals(orderId).toArray();
  const payment = await db.payments.where('orderId').equals(orderId).first();

  return {
    ...order,
    items,
    payment,
  };
}

export async function getOrders(params?: {
  search?: string;
  status?: OrderStatus;
  syncStatus?: SyncStatus;
}): Promise<OrderWithDetails[]> {
  let query = db.orders.orderBy('createdAt').reverse();

  let orders = await query.toArray();

  if (params?.status) {
    orders = orders.filter((o) => o.status === params.status);
  }

  if (params?.syncStatus) {
    orders = orders.filter((o) => o.syncStatus === params.syncStatus);
  }

  if (params?.search && params.search.trim() !== '') {
    const s = params.search.trim().toLowerCase();
    orders = orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(s) ||
        o.paymentMethod.toLowerCase().includes(s) ||
        (o.cancellationReason && o.cancellationReason.toLowerCase().includes(s))
    );
  }

  const result: OrderWithDetails[] = [];
  for (const o of orders) {
    const items = await db.orderItems.where('orderId').equals(o.id).toArray();
    const payment = await db.payments.where('orderId').equals(o.id).first();
    result.push({
      ...o,
      items,
      payment,
    });
  }

  return result;
}

