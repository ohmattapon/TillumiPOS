/** Checkout-facing port; sales never reads shift tables or adapters directly. */
export interface IShiftLedger {
  /** Row-locks the shift and rejects a missing, cross-branch, closing, or closed shift. */
  assertOpenForCheckout(shiftId: number, branchId: number): Promise<void>
  /** Adds the sale's net cash once, after its header and payments have been persisted in the same UOW. */
  recordSaleCash(input: { shiftId: number; branchId: number; saleId: number; receiptNo: string; actorId: number; actorName: string; amountSatang: number; createdAt: Date }): Promise<void>
  /** Records a full cash refund for a voided sale against a currently open same-branch shift. */
  recordSaleRefund(input: { shiftId: number; branchId: number; saleId: number; actorId: number; actorName: string; amountSatang: number; reason: string; createdAt: Date }): Promise<void>
}
