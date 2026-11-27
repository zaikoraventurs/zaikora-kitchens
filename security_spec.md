# ZAIKORA KITCHENS — Firestore Security Specification

## 1. Data Invariants
1. **Customer PII Isolation**: A customer document (`/customers/{customerId}`) and its subcollections (`addresses`, `notifications`) can only be read/written by the matching Firebase Auth UID (`request.auth.uid == customerId`) or an active Admin (`/admins/{request.auth.uid}`).
2. **Order Ownership & Pricing Integrity**: An order (`/orders/{orderId}`) must bind `customerId == request.auth.uid`, enforce non-negative whole-rupee integer charges (`deliveryCharge`, `handlingCharge`, `finalAmount > 0`), and keep `customerId` and `createdAt` immutable on update.
3. **Subcollection Master Gate**: Order items (`/orders/{orderId}/items/{itemId}`) and status history (`/orders/{orderId}/status_history/{historyId}`) must verify parent `/orders/{orderId}` ownership and match `customerId`.
4. **Payment Integrity**: Payment records (`/payments/{paymentId}`) bind `customerId == request.auth.uid`, enforce `currency == 'INR'` and `amount > 0`, and restrict status corrections after terminal `'successful'` state to active Admins only.
5. **Admin RBAC**: Menu writes (`food_menu`, `cake_menu`), settings (`restaurant_settings`), coupon creation/management (`coupons`), and admin order status progression are restricted to verified active entries in `/admins/{request.auth.uid}` authorized via the private Two-Sector Key Lock digest in `/admin_lock_config/primary`.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` fields use server `request.time` timestamps.
7. **Mobile + 4-Digit PIN Integrity**: `/phone_accounts/{phoneId}` stores scrypt-salted hashes (`pinSalt`, `pinHash`) which are immutable after creation by non-admins, and `allow list` is restricted to active Admins to prevent phone enumeration.
8. **Inventory & Stock Deduction Integrity**: Non-admins cannot alter product price, name, availability, or increase stock on `/food_menu/{itemId}` or `/cake_menu/{cakeId}`. Customers may only decrement `stockQuantity` atomically inside a verified payment transition (`pending -> successful` with `inventoryDeducted == true`) accompanied by a matching negative-delta `order_deduction` entry in immutable `/stock_history/{historyId}`.
9. **Dynamic Checkout Charges Integrity**: Public users can read `/checkout_charges/{chargeId}` so carts and checkouts reflect live fees, while `create`, `update`, and `delete` operations are restricted strictly to active Admins (`isAdmin()`) with non-negative numeric validation (`fixed` up to ₹1,00,000; `percentage` `0–100%`) and `request.time` timestamps. Orders capture immutable `appliedCharges` snapshots validated cleanly by `isValidOrder()`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Spoofed Customer Profile**: Creating `/customers/victim_uid` with `uid: "victim_uid"` while signed in as `attacker_uid` -> `PERMISSION_DENIED`.
2. **Self-Assigned Admin Escalation**: Creating `/admins/attacker_uid` with `role: "super_admin"` by non-admin -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Order**: Creating `/orders/ord_1` with extra ghost field `isAdminApproved: true` -> `PERMISSION_DENIED`.
4. **Client Timestamp Forgery**: Creating `/orders/ord_2` with client-forged `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
5. **Cross-User Order Read**: Reading `/orders/victim_order` as non-owner non-admin -> `PERMISSION_DENIED`.
6. **Unfiltered Order List Scrape**: Listing `/orders` without `where('customerId', '==', uid)` as customer -> `PERMISSION_DENIED`.
7. **Unauthorized Order Status Jump**: Customer updating `/orders/ord_1` `status` to `"Delivered / Collected"` -> `PERMISSION_DENIED`.
8. **Negative Price / Discount Tampering**: Creating `/orders/ord_3` with `finalAmount: -500` or `handlingCharge: -10` -> `PERMISSION_DENIED`.
9. **Path Variable ID Poisoning**: Creating `/customers/uid/addresses/../../bad` or 500-char ID -> `PERMISSION_DENIED`.
10. **Non-Admin Menu Price Tampering**: Customer updating `/food_menu/chicken_biryani` `originalPrice: 1` -> `PERMISSION_DENIED`.
11. **Coupon Arbitrary Tampering**: Customer updating `/coupons/SAVE50` `discountValue: 100` -> `PERMISSION_DENIED`.
12. **Terminal Payment Mutation**: Non-admin changing `/payments/pay_1` from `successful` back to `pending` -> `PERMISSION_DENIED`.
13. **PIN Hash Overwrite / Account Enumeration**: Non-admin listing `/phone_accounts` or overwriting `pinHash` on `/phone_accounts/919876543210` -> `PERMISSION_DENIED`.
14. **Unauthorized Stock Inflation / Tampering**: Customer increasing `stockQuantity` on `/food_menu/chicken-biryani` or decrementing outside an atomic verified payment commit -> `PERMISSION_DENIED`.
15. **Stock History Forgery**: Non-admin reading, listing, modifying, or creating non-order `/stock_history/{historyId}` entries -> `PERMISSION_DENIED`.
16. **Unauthorized Checkout Charge Tampering**: Non-admin creating, updating (e.g. making charges `₹0` or negative), or deleting `/checkout_charges/{chargeId}` -> `PERMISSION_DENIED`.

