// Composition root: importing this file wires every migrated module into the container.
import './shared/shared.module'
import './roles/roles.module'
import './users/users.module'
import './branches/branches.module'
import './shifts/shifts.module'
import './auth/auth.module'
import './categories/categories.module'
import './products/products.module'
import './modifiers/modifiers.module'
import './cafe-menu/cafe-menu.module'
import './tables/tables.module'
import './setup/setup.module'
import './inventory/inventory.module'
import './audit/audit.module'
import './sales/sales.module'
import './orders/orders.module'
import './qr-payments/qr-payments.module'
import './settings/settings.module'

import './members/members.module'
import './promotions/promotions.module'
import './quotes/quotes.module'
import './customer-display/customer-display.module'
import './display-slides/display-slides.module'
import './stock-receipts/stock-receipts.module'

// Demo mode runs without PostgreSQL: the memory bindings registered after the
// drizzle ones replace them. This file stays the single composition switch —
// later demo tasks add their bindings in demo-memory.module, not here.
if (Bun.env.DEMO_MODE === 'memory') await import('./demo-memory/demo-memory.module')
