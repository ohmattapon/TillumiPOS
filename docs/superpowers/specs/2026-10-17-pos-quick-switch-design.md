# Quick staff switch at the till

Date: 2026-10-17
Branch: `ohmattpon/pos-quick-switch`

## Why

In a retail shop several employees take turns at the same till: one goes on a break and another steps in. Today the only way to change who is selling is to sign out and sign in again with a username and password, which is slow, loses the cart (`clearCart` on sign-out), and forgets which register the till uses (the register selection is stored per user). So in practice people keep selling under the first person's name, and bills, voids and cash end up credited to the wrong person.

The owner asked for a quick account switch on the sales page and left the design to Claude. Everything below marked *(Claude's call)* was decided by Claude on the owner's behalf; the owner approved the overall proposal shown as a mockup.

## Goals

- On the sales page, the person currently selling is always visible, with a **"Switch staff"** button next to their name.
- Switching takes three steps: press the button → the till locks and shows the staff as large name tiles → tap your name and type your **PIN** (4–6 digits). The till is back on the sales page as the new person.
- **The cart stays.** The customer is still at the counter; the new person carries on with the same cart. The member and discount typed for the cart stay too. *(Claude's call: the cart belongs to the till, not to the person.)*
- **The shift stays open.** A shift belongs to the register, not to a person (`shifts.register_id`, one open shift per register), so nothing is closed or reopened. The new person keeps the till's register selection.
- From the switch on, every bill, void, refund and audit entry is recorded under the new person, and the screens and actions follow the new person's permissions.
- Full sign-in with username and password still works, from the login page and from a small link on the lock screen.

## Non-goals

- Locking the till automatically after a period of inactivity. *(Claude's call: later.)*
- Staff cards, NFC or barcode badges instead of a PIN.
- Clock-in / time attendance.
- A PIN as a way to sign in on a device where nobody has signed in (see Security).
- Switching on table orders differs in nothing: an open order is server data and simply stays open. No special handling.

## Anti-goals (a failure even if it works)

- A PIN that lets someone sign in from another device or from outside the shop.
- A PIN that can be guessed by trying many times.
- The cart, the shift or the register selection lost when switching.
- A bill credited to the person who was at the till before the switch.
- A PIN or its hash in a log, an audit entry, an API response or the JWT.

## How it behaves

### Setting PINs

- The owner (or anyone with `users.manage`) sets or clears a PIN for any user in the user management page. Each user can set or change their own PIN from their account menu, after typing their current password. *(Claude's call.)*
- PIN rule, in the domain: digits only, 4 to 6 long. Stored only as a hash (same hashing as passwords). *(Claude's call: no "too simple" PIN list; the lockout below is the protection.)*
- A user without a PIN does not appear on the lock screen; they can still use full sign-in.
- Setting, changing or clearing a PIN is audited (without the PIN).

### Switching

- "Switch staff" is shown on the sales page to anyone signed in. Pressing it shows the lock screen inside the app; the current session is still the previous person's until a switch succeeds.
- The lock screen lists the active users who have a PIN, as tiles with their display name, sorted by name. The current person is shown too (tapping it simply unlocks after their PIN).
- After the right PIN, the server starts a session for the chosen user (a new session cookie, exactly like a password sign-in) and the web reloads the signed-in user, their permissions and the till's state. The cart, member, discount and the register selection carry over to the new person.
- If the new person lacks a permission for the page they land on, they get what the app already does for such a page today.
- "Cancel" on the lock screen returns to the sales page as the same person, without asking for a PIN. *(Claude's call: locking is a convenience, not a security boundary; the protection is that switching TO someone needs their PIN.)*
- The switch is audited: who was at the till, who took over, at what time (`auth.switch`). A wrong PIN is audited like a failed login, outside the transaction, and never makes the switch fail for another reason.

### Security

- A PIN switch is only possible from a device that already holds a valid session (the request must be authenticated). It is not a login method: the PIN route refuses an anonymous request, so a PIN never opens the system on a new device.
- Five wrong PINs for the same target user lock that user's PIN switch for 15 minutes (the same numbers as the pairing and setup guards). Full sign-in is not affected. *(Claude's call: per target user, so one bad actor cannot lock everybody at once by guessing one name.)*
- The list of switchable users exposes only id and display name.
- Permissions are still loaded from the database on every request, so the new person's role applies immediately.

### What carries over, and whose rules apply *(Claude's calls, settled after the builder check)*

- **No new server rules for the hand-over.** Every request is checked as the person who makes it, exactly as today. Quotes, QR payments, open orders and the shift are not tied to their creator for use: the new person may pay a quote or a QR the previous person started (the quote checks branch, member and lines, not the creator), and a bill paid after the switch records the new person as cashier even when its quote was made before. The records keep their own creator fields (`createdById`, `openedById`) as history.
- A typed discount needs no permission today, so it carries over as is. Closing the shift or cash movements follow the existing shift rules for whoever does them.
- **The old session is not revoked.** Sessions are stateless signed cookies; the switch replaces the cookie in this browser, so the previous person's token no longer exists on the till. A copied token stays valid until it expires, exactly as after a normal sign-in today. Revoking sessions is out of scope.
- **Who may switch:** any signed-in user (`auth: true`), to any active user with a PIN, including an owner; the target's PIN is the gate. The switchable-users list (id, display name) is visible to any signed-in user. A cashier who guesses an owner's PIN five times locks only the owner's PIN switch for 15 minutes; the owner can still sign in with the password. Accepted.
- **Register selection:** the till's current register is written for the new person, overwriting any choice that person made earlier in this browser, because the physical till is this register.
- **Who may set a PIN:** a user sets their own PIN (current password required). A `users.manage` holder may set or clear another user's PIN, except a user with the owner role, whose PIN only that owner can set. This matches "the owner role cannot be edited" and stops a manager from taking over an owner's identity at a till.

## Constraints

- Hexagonal + CQRS per AGENTS.md. The PIN rule lives in the domain. Switching is a command; listing switchable users is a query.
- The PIN check sits behind a port; the lockout counter sits behind a guard port (like `IPairingGuard`), in memory, which has the same single-instance limitation the customer display already documents.
- Additive migration: a nullable PIN hash column on `users`.
- v1 contract additive only: new routes, new optional fields. New error codes are translated in `src/locales/errors.ts`; new UI text through `t()` in the auth / users / pos locales (Thai and English).
- The lock screen and PIN pad work at 390, 768 and 1366 px, with 44 px touch targets; the PIN pad is usable with a keyboard and a touchscreen.
- Tests: domain tests for the PIN rule; use case tests with mock ports for set PIN, clear PIN, list switchable users and switch (success, wrong PIN, locked, inactive user, user without PIN, anonymous request refused at the route); integration tests over HTTP for the routes, the cookie change and the audit entries; web unit tests for the carry-over of cart and register selection.

## Left to the builder

- Route names and shapes (for example `POST /api/v1/auth/switch` and `GET /api/v1/auth/switch-users`, and PIN routes under users and under the signed-in user's account).
- Where in the web the lock screen lives (an auth-feature component opened from the POS page) and how the register selection is copied to the new user id in `register-selection.ts`.
- Whether the guard counts by target user only or by target user and device, as long as the 5 / 15-minute rule holds per target user.
- Error codes, as long as they are stable and translated (for example `PIN_INVALID`, `PIN_LOCKED`, `PIN_NOT_SET`).
