// Composition root: importing this file wires every module into the container.
// It is the single composition switch. DEMO_MODE=memory takes the memory
// branch only: no drizzle module is imported, so a demo process cannot touch
// PostgreSQL (static imports always execute, hence the dynamic branches).
// Production takes the drizzle branch, in the same order as before.
if (Bun.env.DEMO_MODE === 'memory') {
  await import('./demo-memory/demo-memory.module')
} else {
  await import('./shared/shared.module')
  await import('./roles/roles.module')
  await import('./users/users.module')
  await import('./branches/branches.module')
  await import('./shifts/shifts.module')
  await import('./auth/auth.module')
  await import('./categories/categories.module')
  await import('./products/products.module')
  await import('./modifiers/modifiers.module')
  await import('./cafe-menu/cafe-menu.module')
  await import('./tables/tables.module')
  await import('./setup/setup.module')
  await import('./inventory/inventory.module')
  await import('./audit/audit.module')
  await import('./sales/sales.module')
  await import('./orders/orders.module')
  await import('./qr-payments/qr-payments.module')
  await import('./settings/settings.module')

  await import('./members/members.module')
  await import('./promotions/promotions.module')
  await import('./quotes/quotes.module')
  await import('./customer-display/customer-display.module')
  await import('./display-slides/display-slides.module')
  await import('./stock-receipts/stock-receipts.module')
}
