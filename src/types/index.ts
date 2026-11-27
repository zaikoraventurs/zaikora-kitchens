export type FoodCategory =
  | 'Starters'
  | 'Main Course – Lunch & Dinner'
  | 'Seafood Specials'
  | 'Evening Snacks – Pizza Corner'
  | 'Burger Corner'
  | 'Fries Corner'
  | 'Pasta Corner'
  | 'Additional Snacks'
  | 'Desserts';

export type StockMode = 'unlimited' | 'limited';

export type StockHistoryAction =
  | 'manual_add'
  | 'manual_reduce'
  | 'manual_edit'
  | 'mode_change'
  | 'availability_toggle'
  | 'admin_reset'
  | 'order_deduction'
  | 'order_restore';

export interface FoodMenuItem {
  id: string;
  name: string;
  category: FoodCategory | string;
  quantityLabel: string;
  originalPrice: number;
  description?: string;
  imageUrl?: string;
  imageDerivativeUrl?: string;
  mediaId?: string;
  available: boolean;
  sortOrder: number;
  stockMode?: StockMode;
  stockQuantity?: number;
  stockUnit?: string;
  lowStockThreshold?: number;
  soldOut?: boolean;
  lastStockUpdatedAt?: unknown;
  lastStockUpdatedBy?: string;
  lastStockOrderId?: string;
  updatedAt?: unknown;
}

export type CakeType = 'bento' | 'sicle' | 'party';

export interface CakeMenuItem {
  id: string;
  name: string;
  cakeType: CakeType;
  quantityLabel: string;
  originalPrice: number;
  priceUnit?: string;
  flavours?: string[];
  notice?: string;
  orderableOnline: boolean;
  eligibleForAutoDiscount: boolean;
  description?: string;
  imageUrl?: string;
  imageDerivativeUrl?: string;
  mediaId?: string;
  available: boolean;
  sortOrder: number;
  stockMode?: StockMode;
  stockQuantity?: number;
  stockUnit?: string;
  lowStockThreshold?: number;
  soldOut?: boolean;
  lastStockUpdatedAt?: unknown;
  lastStockUpdatedBy?: string;
  lastStockOrderId?: string;
  updatedAt?: unknown;
}

export interface StockHistoryRecord {
  historyId: string;
  productId: string;
  productType: 'food' | 'cake';
  productName: string;
  stockMode: StockMode;
  stockUnit: string;
  previousStock: number;
  changeDelta: number;
  newStock: number;
  actionType: StockHistoryAction;
  reason: string;
  orderId?: string;
  actorUid: string;
  createdAt?: unknown;
}

export type MediaType = 'image' | 'video';

export type MediaCategory = 'food' | 'cake' | 'homepage' | 'promotional' | 'other';

export type WebsiteSectionId =
  | 'homepage_hero'
  | 'homepage_cakes_banner'
  | 'cakes_hero'
  | 'promo_banner'
  | 'cat_starters'
  | 'cat_main_course'
  | 'cat_seafood'
  | 'cat_pizza'
  | 'cat_burger'
  | 'cat_fries'
  | 'cat_pasta'
  | 'cat_snacks'
  | 'cat_desserts';

export interface MediaAssetRecord {
  mediaId: string;
  displayLabel: string;
  originalFilename: string;
  mediaType: MediaType;
  mediaCategory: MediaCategory;
  storagePath: string;
  derivativeStoragePath?: string;
  downloadUrl: string;
  derivativeUrl?: string;
  mimeType: string;
  fileFormat: string;
  fileSize: number;
  width?: number;
  height?: number;
  assignedProductId?: string;
  assignedProductName?: string;
  assignedProductType?: 'food' | 'cake';
  websiteSection?: WebsiteSectionId | string;
  active: boolean;
  uploadedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SiteMediaSectionRecord {
  sectionId: WebsiteSectionId | string;
  label: string;
  mediaId: string;
  mediaUrl: string;
  derivativeUrl?: string;
  mediaType: MediaType;
  storagePath: string;
  updatedAt?: unknown;
}

export interface CartItem {
  cartKey: string;
  productId: string;
  productType: 'food' | 'cake';
  name: string;
  quantityLabel: string;
  selectedFlavour?: string;
  originalPrice: number;
  eligibleForAutoDiscount: boolean;
  quantity: number;
  imageUrl?: string;
}

export type CommunityType = 'brigade_eldorado' | 'outside_eldorado';
export type FulfillmentType = 'delivery' | 'collection';
export type OrderDeliveryCommunity = CommunityType | 'collection_gate';

export interface CustomerProfile {
  uid: string;
  phone: string;
  name: string;
  email?: string;
  marketingConsent?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PhoneAccountRecord {
  phoneId: string;
  phone: string;
  name: string;
  email?: string;
  marketingConsent?: boolean;
  pinSalt: string;
  pinHash: string;
  lastUid: string;
  loginCount: number;
  orderCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  label: string;
  recipientName: string;
  phone: string;
  community: CommunityType;
  apartmentName: string;
  blockOrTower?: string;
  flatNumber?: string;
  landmark?: string;
  isDefault: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerNotification {
  id: string;
  customerId: string;
  orderId: string;
  title: string;
  message: string;
  smsSent: boolean;
  smsStatusDetail: string;
  read: boolean;
  createdAt?: unknown;
}

export type OrderStatus =
  | 'PAYMENT PENDING'
  | 'PAYMENT FAILED'
  | 'PAYMENT VERIFIED'
  | 'PENDING ADMIN APPROVAL'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT FOR DELIVERY'
  | 'READY FOR COLLECTION'
  | 'DELIVERED'
  | 'COLLECTED'
  | 'REJECTED'
  | 'REFUND PROCESSING'
  | 'REFUNDED'
  | 'Order Placed Successfully'
  | 'Payment Successful / Confirmed'
  | 'Preparing Your Order'
  | 'Order Ready'
  | 'Out for Delivery'
  | 'Ready for Collection'
  | 'Delivered / Collected'
  | 'Cancelled';

export type PaymentStatus =
  | 'pending'
  | 'verified'
  | 'successful'
  | 'failed'
  | 'refund_processing'
  | 'refunded';

export type RefundStatus =
  | 'Refund Requested'
  | 'Under Investigation'
  | 'Refund Approved'
  | 'Refund Processing'
  | 'Refund Completed'
  | 'Refund Rejected';

export interface OrderRecord {
  orderId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  idempotencyKey?: string;
  fulfillmentType: FulfillmentType;
  deliveryCommunity: OrderDeliveryCommunity;
  deliveryAddressSummary: string;
  deliveryRuleAcknowledged: boolean;
  displayedSubtotal: number;
  autoDiscountTotal: number;
  couponCode?: string;
  couponDiscount: number;
  deliveryCharge: number;
  handlingCharge: number;
  additionalChargesTotal?: number;
  appliedCharges?: AppliedOrderCharge[];
  finalAmount: number;
  totalItemCount: number;
  itemsPreview?: string;
  paymentStatus: PaymentStatus;
  paymentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentVerifiedAt?: unknown;
  status: OrderStatus;
  estimatedPrepMinutes: number;
  readySoonerNotice?: string;
  reviewFlagged?: boolean;
  reviewFlagReason?: string;
  suspiciousScore?: number;
  adminAccepted?: boolean;
  adminAcceptedBy?: string;
  adminAcceptedAt?: unknown;
  adminRejected?: boolean;
  adminRejectedBy?: string;
  adminRejectedAt?: unknown;
  rejectionReason?: string;
  refundId?: string;
  refundStatus?: RefundStatus;
  refundAmount?: number;
  refundInitiatedAt?: unknown;
  refundCompletedAt?: unknown;
  inventoryDeducted?: boolean;
  inventoryDeductedAt?: unknown;
  inventoryRestored?: boolean;
  inventoryRestoredAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  customerId: string;
  productId: string;
  productType: 'food' | 'cake';
  name: string;
  quantityLabel?: string;
  selectedFlavour?: string;
  quantity: number;
  originalPrice: number;
  displayedPrice: number;
  autoDiscountPerUnit: number;
  lineTotal: number;
}

export interface OrderStatusHistoryRecord {
  id: string;
  orderId: string;
  customerId: string;
  status: string;
  note: string;
  updatedBy: string;
  createdAt?: unknown;
}

export interface PaymentRecord {
  paymentId: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: 'INR';
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  signatureVerified: boolean;
  verifiedByServer?: boolean;
  refundId?: string;
  refundStatus?: RefundStatus;
  refundAmount?: number;
  failureReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CouponRecord {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  validFrom: unknown;
  validUntil: unknown;
  usageLimit: number;
  usedCount: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminUserRecord {
  uid: string;
  phone?: string;
  name: string;
  role: 'super_admin' | 'manager';
  active: boolean;
  createdAt?: unknown;
}

export type CheckoutChargeType = 'fixed' | 'percentage';
export type CheckoutChargeAppliesOn = 'all' | 'delivery_only';

export interface CheckoutChargeRecord {
  id: string;
  name: string;
  description?: string;
  amount: number;
  type: CheckoutChargeType;
  appliesOn: CheckoutChargeAppliesOn;
  enabled: boolean;
  displayOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppliedOrderCharge {
  id: string;
  name: string;
  type: CheckoutChargeType;
  appliesOn: CheckoutChargeAppliesOn;
  rate: number;
  calculatedAmount: number;
  isFree: boolean;
}

export interface RestaurantSettings {
  brandName: string;
  tagline: string;
  whatsappNumber: string;
  contactPhone: string;
  contactEmail: string;
  defaultPrepMinutes: number;
  deliveryCharge: number;
  handlingCharge: number;
  autoDiscountPerItem: number;
  isAcceptingOrders: boolean;
  checkoutChargesConfigured?: boolean;
  collectionNotice: string;
  studioPhone?: string;
  studioEmail?: string;
  studioInstagram?: string;
  updatedAt?: unknown;
}

export interface ServerConfigStatus {
  razorpayConfigured: boolean;
  razorpayWebhookConfigured: boolean;
  razorpayMode?: 'live' | 'test' | 'configured' | 'unconfigured';
  isProductionEnv?: boolean;
}

export type SecurityEventCategory =
  | 'auth'
  | 'payment'
  | 'database'
  | 'api'
  | 'upload'
  | 'admin';

export type SecurityEventSeverity = 'info' | 'warning' | 'critical';

export interface SecurityEventRecord {
  id: string;
  timestamp: string;
  category: SecurityEventCategory;
  eventType: string;
  severity: SecurityEventSeverity;
  ip: string;
  browser: string;
  device: string;
  userAgent: string;
  endpoint: string;
  method: string;
  accountIdentifier: string;
  actionTaken: string;
  result: string;
  suspicious: boolean;
  details?: string;
}

export interface AdminLoginAttemptRecord {
  id: string;
  timestamp: string;
  success: boolean;
  ip: string;
  browser: string;
  device: string;
  accountIdentifier: string;
  consecutiveFailuresAtTime: number;
  reason: string;
}

export interface AdminLockoutRecord {
  id: string;
  key: string;
  uid: string;
  ip: string;
  browser: string;
  device: string;
  failedCount: number;
  lockedAt: string;
  expiresAt: string;
  active: boolean;
  unblockedAt?: string;
  unblockedBy?: string;
  cybercrimeWarningIssued: boolean;
}

export interface ActiveAdminSessionRecord {
  sessionId: string;
  uid: string;
  ip: string;
  browser: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokedBy?: string;
  active: boolean;
}

export interface SecurityNotificationRecord {
  id: string;
  timestamp: string;
  eventType: string;
  severity: SecurityEventSeverity;
  title: string;
  message: string;
  ip: string;
  accountIdentifier: string;
  read: boolean;
}

export interface AdminAuditActionRecord {
  id: string;
  timestamp: string;
  adminUid: string;
  action: string;
  target: string;
  ip: string;
  browser: string;
  device: string;
  details: string;
}

export interface SecurityConfigurationStatus {
  razorpaySecretConfigured: boolean;
  razorpayWebhookConfigured: boolean;
  adminPasswordEnvOverrides: boolean;
  maxConsecutiveFailedLogins: number;
  lockoutDurationMinutes: number;
  sessionTtlHours: number;
  cspEnabled: boolean;
  rateLimiterEnabled: boolean;
  strictSameOriginCors: boolean;
  fileUploadValidationEnabled: boolean;
  persistenceMode: string;
}

export interface SecurityOverviewPayload {
  events: SecurityEventRecord[];
  loginAttempts: AdminLoginAttemptRecord[];
  lockouts: AdminLockoutRecord[];
  activeSessions: ActiveAdminSessionRecord[];
  notifications: SecurityNotificationRecord[];
  auditLogs: AdminAuditActionRecord[];
  suspiciousAlerts: SecurityEventRecord[];
  configStatus: SecurityConfigurationStatus;
}

