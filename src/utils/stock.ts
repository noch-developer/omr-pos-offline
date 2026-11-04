/**
 * Stock calculation functions according to OMR Event POS specification:
 * Formula: Remaining = Opening + Stock In - Sold - Waste
 */

export function calculateRemaining(
  openingQty: number,
  stockIn: number,
  soldQty: number,
  wasteQty: number
): number {
  const opening = Math.max(0, openingQty || 0);
  const inQty = Math.max(0, stockIn || 0);
  const sold = Math.max(0, soldQty || 0);
  const waste = Math.max(0, wasteQty || 0);

  return opening + inQty - sold - waste;
}

/**
 * Validates that an operation will not result in negative stock.
 */
export function validateSufficientStock(
  currentRemaining: number,
  requestedDeduction: number
): { valid: boolean; remainingAfter: number; error?: string } {
  const remainingAfter = currentRemaining - requestedDeduction;
  if (remainingAfter < 0) {
    return {
      valid: false,
      remainingAfter: currentRemaining,
      error: `Insufficient stock! Requested: ${requestedDeduction}, Available: ${currentRemaining}`,
    };
  }
  return {
    valid: true,
    remainingAfter,
  };
}

