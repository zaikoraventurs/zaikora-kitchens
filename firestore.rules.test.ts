/**
 * ZAIKORA KITCHENS — Security Rules Adversarial Verification Spec
 * Documents expected PERMISSION_DENIED outcomes for the Dirty Dozen payloads
 * defined in security_spec.md against firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  guardingRule: string;
}

export const DIRTY_DOZEN_SECURITY_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Spoofed Customer Profile UID',
    collectionPath: 'customers/victim_uid',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'isOwner(customerId) && incoming().uid == customerId',
  },
  {
    id: 2,
    name: 'Self-Assigned Admin Escalation',
    collectionPath: 'admins/attacker_uid',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'isAdmin() or valid Two-Sector proofDigest matching private /admin_lock_config/primary required on /admins/{uid}',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Order',
    collectionPath: 'orders/ord_shadow_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'isValidOrder() data.keys().hasOnly([...])',
  },
  {
    id: 4,
    name: 'Client Timestamp Forgery on Order',
    collectionPath: 'orders/ord_time_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'incoming().createdAt == request.time && incoming().updatedAt == request.time',
  },
  {
    id: 5,
    name: 'Cross-User Order Read',
    collectionPath: 'orders/victim_order_1',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'existing().customerId == request.auth.uid || isAdmin()',
  },
  {
    id: 6,
    name: 'Unfiltered Order List Scrape',
    collectionPath: 'orders',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'resource.data.customerId == request.auth.uid || isAdmin()',
  },
  {
    id: 7,
    name: 'Unauthorized Order Status Jump by Customer',
    collectionPath: 'orders/ord_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'Customer update restricted to paymentStatus transition from pending',
  },
  {
    id: 8,
    name: 'Negative Price or Charge Tampering',
    collectionPath: 'orders/ord_neg_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'isValidOrder() enforces finalAmount > 0 && deliveryCharge >= 0 && handlingCharge >= 0',
  },
  {
    id: 9,
    name: 'Path Variable ID Poisoning',
    collectionPath: 'customers/uid_1/addresses/bad..id',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'isValidId(addressId) regex ^[a-zA-Z0-9_\\-]+$',
  },
  {
    id: 10,
    name: 'Non-Admin Menu Price Tampering',
    collectionPath: 'food_menu/chicken_biryani',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'isAdmin() required on /food_menu/{itemId}',
  },
  {
    id: 11,
    name: 'Coupon Value Tampering by Customer',
    collectionPath: 'coupons/WELCOME',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'Customer update restricted to usedCount == existing().usedCount + 1 and affectedKeys().hasOnly([usedCount, updatedAt])',
  },
  {
    id: 12,
    name: 'Terminal Payment Mutation',
    collectionPath: 'payments/pay_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'existing().status == pending required for customer payment update',
  },
  {
    id: 13,
    name: 'PIN Hash Overwrite and Phone Account Enumeration',
    collectionPath: 'phone_accounts/919876543210',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'incoming().pinHash == existing().pinHash && incoming().pinSalt == existing().pinSalt; allow list: if isAdmin()',
  },
  {
    id: 14,
    name: 'Unauthorized Limited Stock Inflation or Arbitrary Tampering',
    collectionPath: 'food_menu/chicken-biryani',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'Non-admin update restricted strictly to decrementing limited stockQuantity atomically with verified pending->successful order transition',
  },
  {
    id: 15,
    name: 'Stock History Forgery or Unauthorized Read',
    collectionPath: 'stock_history/stk_fake_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'Non-admin create blocked unless negative order_deduction matching atomic order_{productId} and post-commit verified order ownership; allow list/get: if isAdmin()',
  },
  {
    id: 16,
    name: 'Unauthorized Checkout Charge Tampering',
    collectionPath: 'checkout_charges/delivery',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardingRule: 'isAdmin() and isValidCheckoutCharge() required for create/update/delete on /checkout_charges/{chargeId}',
  },
];

