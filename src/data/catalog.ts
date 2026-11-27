import type {
  CakeMenuItem,
  CheckoutChargeRecord,
  FoodCategory,
  FoodMenuItem,
  OrderRecord,
  OrderStatus,
  RefundStatus,
  RestaurantSettings,
} from '../types/index.ts';

export const BRAND_NAME = 'ZAIKORA KITCHENS';
export const BRAND_TAGLINE = 'TASTE. TRUST. REPEAT.';
export const OFFICIAL_LOGO_URL = '/assets/aistudio/zarik_3ef177e8.jpeg';

export const HERO_IMAGE_URL = '/src/assets/images/hero_zaikora_spread_1795258915804.jpg';
export const BIRYANI_TANDOORI_IMAGE_URL = '/src/assets/images/chicken_jeera_samba_biryani_1795700222756.jpg';
export const TANDOORI_STRIPS_IMAGE_URL = '/src/assets/images/food_tandoori_strips_1795631353640.jpg';
export const PERI_PERI_STRIPS_IMAGE_URL = '/src/assets/images/chicken_periperi_strips_1795667455294.jpg';
export const WHITE_RICE_IMAGE_URL = '/src/assets/images/plain_white_rice_1795667454574.jpg';
export const CHICKEN_TANDOORI_MASALA_IMAGE_URL = '/src/assets/images/chicken_tandoori_masala_1795667456366.jpg';
export const CHAPATI_IMAGE_URL = '/src/assets/images/plain_wheat_chapati_1795667456286.jpg';
export const SEAFOOD_COASTAL_IMAGE_URL = '/src/assets/images/food_seafood_coastal_1795258915801.jpg';
export const BANGUDE_FISH_TAWA_FRY_IMAGE_URL = '/src/assets/images/bangude_tawa_fry_1795667453803.jpg';
export const FISH_PULI_MUNCHI_IMAGE_URL = '/src/assets/images/bangda_fish_pulimunchu_1795700221595.jpg';
export const NEER_DOSA_IMAGE_URL = '/src/assets/images/plain_neer_dosa_1795667454378.jpg';
export const PIZZA_SNACKS_IMAGE_URL = '/src/assets/images/food_pizza_snacks_1795258915214.jpg';
export const CHICKEN_PIZZA_IMAGE_URL = '/src/assets/images/chicken_cheese_pizza_1795667457413.jpg';
export const VEG_PIZZA_IMAGE_URL = '/src/assets/images/veg_garden_pizza_1795667457424.jpg';
export const PANEER_PIZZA_IMAGE_URL = '/src/assets/images/paneer_tikka_pizza_1795667457184.jpg';
export const MINI_CHICKEN_PIZZA_IMAGE_URL = '/src/assets/images/mini_chicken_pizzas_1795667458220.jpg';
export const MINI_VEG_PIZZA_IMAGE_URL = '/src/assets/images/mini_veg_pizzas_1795667459092.jpg';
export const MINI_CHICKEN_BURGER_IMAGE_URL = '/src/assets/images/mini_chicken_sliders_1795667459911.jpg';
export const MINI_VEG_BURGER_IMAGE_URL = '/src/assets/images/mini_veg_sliders_1795667553387.jpg';
export const SALTED_FRIES_IMAGE_URL = '/src/assets/images/classic_salted_fries_1795667553544.jpg';
export const PERI_PERI_FRIES_IMAGE_URL = '/src/assets/images/peri_peri_fries_1795667527024.jpg';
export const LOADED_FRIES_IMAGE_URL = '/src/assets/images/food_loaded_fries_1795631354344.jpg';
export const CHICKEN_PASTA_IMAGE_URL = '/src/assets/images/chicken_alfredo_pasta_1795667553448.jpg';
export const VEG_PASTA_IMAGE_URL = '/src/assets/images/veg_alfredo_pasta_1795667554583.jpg';
export const VADA_PAV_IMAGE_URL = '/src/assets/images/mumbai_vada_pav_1795667461922.jpg';
export const GAJAR_HALWA_IMAGE_URL = '/src/assets/images/food_gajar_halwa_1795631354490.jpg';
export const SHAHI_FIRNI_IMAGE_URL = '/src/assets/images/shahi_firni_bowl_1795667527453.jpg';
export const ANDE_KI_MITHAI_IMAGE_URL = '/src/assets/images/ande_ki_mithai_1795667554561.jpg';
export const BROWNIE_IMAGE_URL = '/src/assets/images/food_chocolate_brownie_1795631356094.jpg';
export const CAKES_CELEBRATION_IMAGE_URL = '/src/assets/images/cakes_bento_celebration_1795258915347.jpg';
export const BENTO_CAKE_IMAGE_URL = '/src/assets/images/single_bento_cake_1795667464007.jpg';
export const CAKE_SICLES_IMAGE_URL = '/src/assets/images/chocolate_cake_sicles_1795667555228.jpg';
export const CUSTOM_PARTY_CAKE_IMAGE_URL = '/src/assets/images/bespoke_party_cake_1795667583679.jpg';

const LEGACY_SEED_IMAGE_URLS = new Set([
  HERO_IMAGE_URL,
  BIRYANI_TANDOORI_IMAGE_URL,
  '/src/assets/images/food_biryani_tandoori_1795258915858.jpg',
  '/src/assets/images/chicken_jeera_samba_biryani_1795690079529.jpg',
  '/src/assets/images/chicken_basmati_biryani_1795696274757.jpg',
  '/src/assets/images/fish_puli_munchi_1795667454116.jpg',
  TANDOORI_STRIPS_IMAGE_URL,
  SEAFOOD_COASTAL_IMAGE_URL,
  PIZZA_SNACKS_IMAGE_URL,
  LOADED_FRIES_IMAGE_URL,
  GAJAR_HALWA_IMAGE_URL,
  CAKES_CELEBRATION_IMAGE_URL,
]);

export function getLocalThumbUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/^\/src\/assets\/images\/([^/]+)\.jpg$/i);
  if (!match) return undefined;
  if (match[1] === 'hero_zaikora_spread_1795258915804') return undefined;
  return `/src/assets/images/thumbs/${match[1]}.webp`;
}

function isUsableUrlString(raw?: string): raw is string {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('blob:')) return false;
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/assets/') ||
    trimmed.startsWith('/src/') ||
    trimmed.startsWith('data:image/')
  ) {
    return true;
  }
  return /^\/[^/].*\.[a-z0-9]{2,6}(\?.*)?$/i.test(trimmed);
}

export function getDishAuthenticDefaultImage(
  id: string,
  name: string,
  category: string
): string | null {
  const lowerId = (id || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();

  // Starters
  if (lowerId === 'chicken-tandoori-strips' || lowerName.includes('tandoori strip')) {
    return TANDOORI_STRIPS_IMAGE_URL;
  }
  if (lowerId === 'chicken-peri-peri-strips' || lowerName.includes('peri peri strip')) {
    return PERI_PERI_STRIPS_IMAGE_URL;
  }

  // Main Course
  if (lowerId === 'chicken-biryani' || lowerName.includes('biryani')) {
    return BIRYANI_TANDOORI_IMAGE_URL;
  }
  if (
    lowerId === 'white-rice-main' ||
    lowerId === 'white-rice-seafood' ||
    lowerName.includes('white rice')
  ) {
    return WHITE_RICE_IMAGE_URL;
  }
  if (lowerId === 'chicken-tandoori-masala' || lowerName.includes('tandoori masala')) {
    return CHICKEN_TANDOORI_MASALA_IMAGE_URL;
  }
  if (lowerId === 'chapati' || lowerName.includes('chapati')) {
    return CHAPATI_IMAGE_URL;
  }

  // Seafood Specials
  if (lowerId === 'bangude-fish-tawa-fry' || lowerName.includes('bangude')) {
    return BANGUDE_FISH_TAWA_FRY_IMAGE_URL;
  }
  if (
    lowerId === 'fish-puli-munchi' ||
    lowerName.includes('puli munchi') ||
    lowerName.includes('pulimunchu')
  ) {
    return FISH_PULI_MUNCHI_IMAGE_URL;
  }
  if (lowerId === 'neer-dosa' || lowerName.includes('neer dosa')) {
    return NEER_DOSA_IMAGE_URL;
  }

  // Pizza Corner (check mini variants before full-size variants)
  if (lowerId === 'mini-chicken-pizza' || lowerName.includes('mini chicken pizza')) {
    return MINI_CHICKEN_PIZZA_IMAGE_URL;
  }
  if (lowerId === 'mini-veg-pizza' || lowerName.includes('mini veg pizza')) {
    return MINI_VEG_PIZZA_IMAGE_URL;
  }
  if (lowerId === 'paneer-pizza' || lowerName.includes('paneer pizza')) {
    return PANEER_PIZZA_IMAGE_URL;
  }
  if (lowerId === 'chicken-pizza' || lowerName.includes('chicken pizza')) {
    return CHICKEN_PIZZA_IMAGE_URL;
  }
  if (lowerId === 'veg-pizza' || lowerName.includes('veg pizza')) {
    return VEG_PIZZA_IMAGE_URL;
  }

  // Burger Corner
  if (lowerId === 'mini-chicken-burger' || lowerName.includes('mini chicken burger')) {
    return MINI_CHICKEN_BURGER_IMAGE_URL;
  }
  if (lowerId === 'mini-veg-burger' || lowerName.includes('mini veg burger')) {
    return MINI_VEG_BURGER_IMAGE_URL;
  }

  // Fries Corner
  if (lowerId === 'loaded-chicken-fries' || lowerName.includes('loaded chicken fries')) {
    return LOADED_FRIES_IMAGE_URL;
  }
  if (lowerId === 'peri-peri-fries' || lowerName.includes('peri peri fries')) {
    return PERI_PERI_FRIES_IMAGE_URL;
  }
  if (lowerId === 'salted-fries' || lowerName.includes('salted fries')) {
    return SALTED_FRIES_IMAGE_URL;
  }

  // Pasta Corner
  if (lowerId === 'chicken-white-sauce-pasta' || lowerName.includes('chicken white sauce pasta')) {
    return CHICKEN_PASTA_IMAGE_URL;
  }
  if (lowerId === 'veg-white-sauce-pasta' || lowerName.includes('veg white sauce pasta')) {
    return VEG_PASTA_IMAGE_URL;
  }

  // Additional Snacks
  if (lowerId === 'vada-pav' || lowerName.includes('vada pav')) {
    return VADA_PAV_IMAGE_URL;
  }

  // Desserts
  if (lowerId.includes('brownie') || lowerName.includes('brownie')) {
    return BROWNIE_IMAGE_URL;
  }
  if (lowerId === 'gajar-ka-halwa' || lowerName.includes('gajar')) {
    return GAJAR_HALWA_IMAGE_URL;
  }
  if (lowerId === 'shahi-firni' || lowerName.includes('firni')) {
    return SHAHI_FIRNI_IMAGE_URL;
  }
  if (lowerId === 'ande-ki-mithai' || lowerName.includes('ande ki mithai')) {
    return ANDE_KI_MITHAI_IMAGE_URL;
  }

  // Category-level fallbacks for any custom admin items
  if (category === 'Starters') return TANDOORI_STRIPS_IMAGE_URL;
  if (category === 'Fries Corner') return SALTED_FRIES_IMAGE_URL;
  if (category === 'Burger Corner') return MINI_CHICKEN_BURGER_IMAGE_URL;
  if (category === 'Pasta Corner') return CHICKEN_PASTA_IMAGE_URL;
  if (category === 'Additional Snacks') return VADA_PAV_IMAGE_URL;
  if (category === 'Evening Snacks – Pizza Corner') return CHICKEN_PIZZA_IMAGE_URL;
  if (category === 'Seafood Specials') return BANGUDE_FISH_TAWA_FRY_IMAGE_URL;
  if (category === 'Desserts') return GAJAR_HALWA_IMAGE_URL;

  return null;
}

export function getCakeAuthenticDefaultImage(
  id: string,
  name: string,
  cakeType?: string
): string {
  const lowerId = (id || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();

  if (cakeType === 'bento' || lowerId.includes('bento') || lowerName.includes('bento')) {
    return BENTO_CAKE_IMAGE_URL;
  }
  if (cakeType === 'sicle' || lowerId.includes('sicle') || lowerName.includes('sicle')) {
    return CAKE_SICLES_IMAGE_URL;
  }
  if (cakeType === 'party' || lowerId.includes('party') || lowerName.includes('party')) {
    return CUSTOM_PARTY_CAKE_IMAGE_URL;
  }
  return BENTO_CAKE_IMAGE_URL;
}

export function resolveFoodItemImage<
  T extends Pick<FoodMenuItem, 'id' | 'name' | 'category' | 'imageUrl' | 'imageDerivativeUrl' | 'mediaId'>,
>(item: T): T {
  const authenticDefault = getDishAuthenticDefaultImage(item.id, item.name, item.category);
  const categoryFallback = getCategoryImage(item.category);
  const rawUrl = item.imageUrl?.trim() || '';

  if (!isUsableUrlString(rawUrl)) {
    const { imageDerivativeUrl: _omitDeriv, ...rest } = item;
    return {
      ...(rest as T),
      imageUrl: authenticDefault || categoryFallback,
    };
  }

  if (
    !item.mediaId &&
    authenticDefault &&
    LEGACY_SEED_IMAGE_URLS.has(rawUrl) &&
    rawUrl !== authenticDefault
  ) {
    const { imageDerivativeUrl: _omitDeriv, ...rest } = item;
    return {
      ...(rest as T),
      imageUrl: authenticDefault,
    };
  }

  if ('imageDerivativeUrl' in item && item.imageDerivativeUrl === undefined) {
    const { imageDerivativeUrl: _omitDeriv, ...rest } = item;
    return rest as T;
  }

  return item;
}

export function resolveCakeItemImage<
  T extends Pick<CakeMenuItem, 'id' | 'name' | 'cakeType' | 'imageUrl' | 'imageDerivativeUrl' | 'mediaId'>,
>(cake: T): T {
  const authenticDefault = getCakeAuthenticDefaultImage(cake.id, cake.name, cake.cakeType);
  const rawUrl = cake.imageUrl?.trim() || '';

  if (!isUsableUrlString(rawUrl)) {
    const { imageDerivativeUrl: _omitDeriv, ...rest } = cake;
    return {
      ...(rest as T),
      imageUrl: authenticDefault,
    };
  }

  if (
    !cake.mediaId &&
    LEGACY_SEED_IMAGE_URLS.has(rawUrl) &&
    rawUrl !== authenticDefault
  ) {
    const { imageDerivativeUrl: _omitDeriv, ...rest } = cake;
    return {
      ...(rest as T),
      imageUrl: authenticDefault,
    };
  }

  if ('imageDerivativeUrl' in cake && cake.imageDerivativeUrl === undefined) {
    const { imageDerivativeUrl: _omitDeriv, ...rest } = cake;
    return rest as T;
  }

  return cake;
}

export const AUTO_DISCOUNT_PER_ITEM = 10;
export const DEFAULT_DELIVERY_CHARGE = 10;
export const DEFAULT_HANDLING_CHARGE = 20;
export const DEFAULT_PREP_MINUTES = 60;

export const COLLECTION_NOTICE =
  'Your order will be available for collection at Brigade Eldorado Main Gate.';

export const DELIVERY_RULES = [
  'Deliver within Brigade Eldorado.',
  'Outside Brigade Eldorado, deliver only to the customer\'s apartment main gate.',
  'Delivery staff must not enter apartment premises outside Brigade Eldorado.',
  'Customers may collect orders at Brigade Eldorado Main Gate.',
];

export const PENDING_APPROVAL_CUSTOMER_MESSAGE =
  'Your order request has been received successfully. Our kitchen team will review your order and confirm it shortly. Please wait for confirmation.';

export const ORDER_ACCEPTED_NOTIFICATION_MESSAGE =
  'Your order has been accepted by ZAIKORA KITCHENS and preparation will begin shortly.';

export const ORDER_REJECTED_NOTIFICATION_MESSAGE =
  'Unfortunately, ZAIKORA KITCHENS could not accept your order. Your refund has been initiated through the original payment method. You can check the refund status on our website.';

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'PAYMENT PENDING',
  'PAYMENT VERIFIED',
  'PENDING ADMIN APPROVAL',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT FOR DELIVERY',
  'READY FOR COLLECTION',
  'DELIVERED',
  'COLLECTED',
];

export const LEGACY_ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'Order Placed Successfully',
  'Payment Successful / Confirmed',
  'Preparing Your Order',
  'Order Ready',
  'Out for Delivery',
  'Ready for Collection',
  'Delivered / Collected',
];

export const ALL_VALID_ORDER_STATUSES: OrderStatus[] = [
  'PAYMENT PENDING',
  'PAYMENT FAILED',
  'PAYMENT VERIFIED',
  'PENDING ADMIN APPROVAL',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT FOR DELIVERY',
  'READY FOR COLLECTION',
  'DELIVERED',
  'COLLECTED',
  'REJECTED',
  'REFUND PROCESSING',
  'REFUNDED',
  ...LEGACY_ORDER_STATUS_SEQUENCE,
  'Cancelled',
];

export const REFUND_STATUS_SEQUENCE: RefundStatus[] = [
  'Refund Requested',
  'Under Investigation',
  'Refund Approved',
  'Refund Processing',
  'Refund Completed',
  'Refund Rejected',
];

export function isOrderCompletedOrClosed(status: string | undefined): boolean {
  return (
    status === 'DELIVERED' ||
    status === 'COLLECTED' ||
    status === 'Delivered / Collected' ||
    status === 'REJECTED' ||
    status === 'REFUNDED' ||
    status === 'Cancelled' ||
    status === 'PAYMENT FAILED'
  );
}

export function isOrderPendingAdminApproval(order: Pick<OrderRecord, 'status' | 'paymentStatus' | 'adminAccepted' | 'adminRejected'>): boolean {
  if (order.adminAccepted === true || order.adminRejected === true) {
    return false;
  }
  if (isOrderCompletedOrClosed(order.status) || order.status === 'REFUND PROCESSING') {
    return false;
  }
  if (order.status === 'PENDING ADMIN APPROVAL' || order.status === 'PAYMENT VERIFIED') {
    return true;
  }
  return order.paymentStatus === 'successful' || order.paymentStatus === 'verified';
}

export const DELIVERY_TRANSIT_MESSAGE =
  'Your order is on the way. Please get ready to receive it.';

export const COLLECTION_READY_MESSAGE =
  'Your order is ready. Please collect it at Brigade Eldorado Main Gate.';

export const PARTY_CAKE_WHATSAPP_MESSAGE = `Hello ZAIKORA KITCHENS, I would like to enquire about a customizable party cake.

Required weight:
Flavour:
Design:
Occasion:
Required date:
Delivery or collection:

I will share my cake reference pictures and other requirements here.`;

export const FOOD_CATEGORIES: FoodCategory[] = [
  'Starters',
  'Main Course – Lunch & Dinner',
  'Seafood Specials',
  'Evening Snacks – Pizza Corner',
  'Burger Corner',
  'Fries Corner',
  'Pasta Corner',
  'Additional Snacks',
  'Desserts',
];

export const DEFAULT_SETTINGS: RestaurantSettings = {
  brandName: BRAND_NAME,
  tagline: BRAND_TAGLINE,
  whatsappNumber: '918970007665',
  contactPhone: '+91 8970007665',
  contactEmail: 'contact.zaikoraventures@gmail.com',
  defaultPrepMinutes: DEFAULT_PREP_MINUTES,
  deliveryCharge: DEFAULT_DELIVERY_CHARGE,
  handlingCharge: DEFAULT_HANDLING_CHARGE,
  autoDiscountPerItem: AUTO_DISCOUNT_PER_ITEM,
  isAcceptingOrders: true,
  collectionNotice: COLLECTION_NOTICE,
  studioPhone: '',
  studioEmail: '',
  studioInstagram: 'https://www.instagram.com/pixel_craft1studio/',
};

export const DEFAULT_CHECKOUT_CHARGES: CheckoutChargeRecord[] = [
  {
    id: 'delivery',
    name: 'Delivery Charge',
    description: 'Doorstep / Main Gate delivery fee (₹0 on self-collection)',
    amount: DEFAULT_DELIVERY_CHARGE,
    type: 'fixed',
    appliesOn: 'delivery_only',
    enabled: true,
    displayOrder: 1,
  },
  {
    id: 'handling',
    name: 'Handling Charge',
    description: 'Packaging & hygienic order handling fee',
    amount: DEFAULT_HANDLING_CHARGE,
    type: 'fixed',
    appliesOn: 'all',
    enabled: true,
    displayOrder: 2,
  },
];

export function buildFallbackCheckoutCharges(
  settings?: Partial<RestaurantSettings>
): CheckoutChargeRecord[] {
  const deliveryAmt =
    typeof settings?.deliveryCharge === 'number' && Number.isFinite(settings.deliveryCharge)
      ? Math.max(0, Math.round(settings.deliveryCharge))
      : DEFAULT_DELIVERY_CHARGE;
  const handlingAmt =
    typeof settings?.handlingCharge === 'number' && Number.isFinite(settings.handlingCharge)
      ? Math.max(0, Math.round(settings.handlingCharge))
      : DEFAULT_HANDLING_CHARGE;
  return [
    {
      ...DEFAULT_CHECKOUT_CHARGES[0],
      amount: deliveryAmt,
    },
    {
      ...DEFAULT_CHECKOUT_CHARGES[1],
      amount: handlingAmt,
    },
  ];
}

export function normalizeCheckoutCharge(
  raw: Partial<CheckoutChargeRecord>,
  fallbackOrder = 10
): CheckoutChargeRecord | null {
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 64) : '';
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || !name) {
    return null;
  }
  const type = raw.type === 'percentage' ? 'percentage' : 'fixed';
  const appliesOn = raw.appliesOn === 'delivery_only' ? 'delivery_only' : 'all';
  const numAmount = Number(raw.amount);
  const safeRawAmount = Number.isFinite(numAmount) && numAmount >= 0 ? numAmount : 0;
  const amount =
    type === 'percentage'
      ? Math.min(100, Math.round(safeRawAmount * 100) / 100)
      : Math.min(100000, Math.round(safeRawAmount));
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true;
  const orderNum = Number(raw.displayOrder);
  const displayOrder =
    Number.isFinite(orderNum) && orderNum >= 0
      ? Math.min(10000, Math.round(orderNum))
      : fallbackOrder;
  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, 240)
      : undefined;

  return {
    id,
    name,
    ...(description ? { description } : {}),
    amount,
    type,
    appliesOn,
    enabled,
    displayOrder,
    ...(raw.createdAt !== undefined ? { createdAt: raw.createdAt } : {}),
    ...(raw.updatedAt !== undefined ? { updatedAt: raw.updatedAt } : {}),
  };
}

export function getCategoryImage(category: string): string {
  switch (category) {
    case 'Starters':
      return TANDOORI_STRIPS_IMAGE_URL;
    case 'Seafood Specials':
      return BANGUDE_FISH_TAWA_FRY_IMAGE_URL;
    case 'Fries Corner':
      return SALTED_FRIES_IMAGE_URL;
    case 'Evening Snacks – Pizza Corner':
      return CHICKEN_PIZZA_IMAGE_URL;
    case 'Burger Corner':
      return MINI_CHICKEN_BURGER_IMAGE_URL;
    case 'Pasta Corner':
      return CHICKEN_PASTA_IMAGE_URL;
    case 'Additional Snacks':
      return VADA_PAV_IMAGE_URL;
    case 'Desserts':
      return GAJAR_HALWA_IMAGE_URL;
    default:
      return BIRYANI_TANDOORI_IMAGE_URL;
  }
}

export const INITIAL_FOOD_MENU: FoodMenuItem[] = [
  // Starters
  {
    id: 'chicken-tandoori-strips',
    name: 'Chicken Tandoori Strips',
    category: 'Starters',
    quantityLabel: '6 pieces',
    originalPrice: 240,
    description: 'Tender chicken strips marinated in traditional tandoori spices and seared golden.',
    imageUrl: TANDOORI_STRIPS_IMAGE_URL,
    available: true,
    sortOrder: 1,
  },
  {
    id: 'chicken-peri-peri-strips',
    name: 'Chicken Peri Peri Strips',
    category: 'Starters',
    quantityLabel: '6 pieces',
    originalPrice: 270,
    description: 'Crispy spiced chicken strips dusted with house peri peri seasoning.',
    imageUrl: PERI_PERI_STRIPS_IMAGE_URL,
    available: true,
    sortOrder: 2,
  },

  // Main Course – Lunch & Dinner
  {
    id: 'chicken-biryani',
    name: 'Chicken Biryani',
    category: 'Main Course – Lunch & Dinner',
    quantityLabel: '2 chicken pieces',
    originalPrice: 150,
    description: 'Fragrant short-grain jeera samba rice layered with slow-cooked spiced chicken and caramelized onions.',
    imageUrl: BIRYANI_TANDOORI_IMAGE_URL,
    available: true,
    sortOrder: 3,
  },
  {
    id: 'white-rice-main',
    name: 'White Rice',
    category: 'Main Course – Lunch & Dinner',
    quantityLabel: '1 plate',
    originalPrice: 60,
    description: 'Steamed fluffy white rice prepared fresh to order.',
    imageUrl: WHITE_RICE_IMAGE_URL,
    available: true,
    sortOrder: 4,
  },
  {
    id: 'chicken-tandoori-masala',
    name: 'Chicken Tandoori Masala',
    category: 'Main Course – Lunch & Dinner',
    quantityLabel: '3 pieces',
    originalPrice: 140,
    description: 'Char-kissed tandoori chicken simmered in a rich aromatic masala.',
    imageUrl: CHICKEN_TANDOORI_MASALA_IMAGE_URL,
    available: true,
    sortOrder: 5,
  },
  {
    id: 'chapati',
    name: 'Chapati',
    category: 'Main Course – Lunch & Dinner',
    quantityLabel: '1 piece',
    originalPrice: 15,
    description: 'Soft whole-wheat homestyle chapati cooked fresh on the tawa.',
    imageUrl: CHAPATI_IMAGE_URL,
    available: true,
    sortOrder: 6,
  },

  // Seafood Specials
  {
    id: 'bangude-fish-tawa-fry',
    name: 'Bangude Fish Tawa Fry',
    category: 'Seafood Specials',
    quantityLabel: '1 serving',
    originalPrice: 130,
    description: 'Fresh mackerel marinated in coastal red masala and pan-seared on a hot tawa.',
    imageUrl: BANGUDE_FISH_TAWA_FRY_IMAGE_URL,
    available: true,
    sortOrder: 7,
  },
  {
    id: 'fish-puli-munchi',
    name: 'Bangda Fish Pulimunchu',
    category: 'Seafood Specials',
    quantityLabel: '1 serving',
    originalPrice: 150,
    description: 'Authentic tangy and spicy Mangalorean Bangda (mackerel) coastal fish curry.',
    imageUrl: FISH_PULI_MUNCHI_IMAGE_URL,
    available: true,
    sortOrder: 8,
  },
  {
    id: 'neer-dosa',
    name: 'Neer Dosa',
    category: 'Seafood Specials',
    quantityLabel: '1 piece',
    originalPrice: 12,
    description: 'Delicate, paper-thin lacy rice crepes pairing effortlessly with coastal curries.',
    imageUrl: NEER_DOSA_IMAGE_URL,
    available: true,
    sortOrder: 9,
  },
  {
    id: 'white-rice-seafood',
    name: 'White Rice',
    category: 'Seafood Specials',
    quantityLabel: '1 plate',
    originalPrice: 60,
    description: 'Steamed white rice ideal alongside Bangda Fish Pulimunchu.',
    imageUrl: WHITE_RICE_IMAGE_URL,
    available: true,
    sortOrder: 10,
  },

  // Evening Snacks – Pizza Corner
  {
    id: 'chicken-pizza',
    name: 'Chicken Pizza',
    category: 'Evening Snacks – Pizza Corner',
    quantityLabel: '8 inches',
    originalPrice: 220,
    description: 'Hand-stretched 8-inch crust topped with spiced roasted chicken and melted mozzarella.',
    imageUrl: CHICKEN_PIZZA_IMAGE_URL,
    available: true,
    sortOrder: 11,
  },
  {
    id: 'veg-pizza',
    name: 'Veg Pizza',
    category: 'Evening Snacks – Pizza Corner',
    quantityLabel: '8 inches',
    originalPrice: 180,
    description: '8-inch crisp pizza topped with fresh garden vegetables and rich tomato sauce.',
    imageUrl: VEG_PIZZA_IMAGE_URL,
    available: true,
    sortOrder: 12,
  },
  {
    id: 'paneer-pizza',
    name: 'Paneer Pizza',
    category: 'Evening Snacks – Pizza Corner',
    quantityLabel: '8 inches',
    originalPrice: 220,
    description: '8-inch pizza loaded with marinated cottage cheese cubes and mozzarella.',
    imageUrl: PANEER_PIZZA_IMAGE_URL,
    available: true,
    sortOrder: 13,
  },
  {
    id: 'mini-chicken-pizza',
    name: 'Mini Chicken Pizza',
    category: 'Evening Snacks – Pizza Corner',
    quantityLabel: '3 pieces',
    originalPrice: 220,
    description: 'Trio of bite-sized chicken pizzas baked golden for evening cravings.',
    imageUrl: MINI_CHICKEN_PIZZA_IMAGE_URL,
    available: true,
    sortOrder: 14,
  },
  {
    id: 'mini-veg-pizza',
    name: 'Mini Veg Pizza',
    category: 'Evening Snacks – Pizza Corner',
    quantityLabel: '3 pieces',
    originalPrice: 200,
    description: 'Three crisp mini vegetable pizzas topped with melted cheese.',
    imageUrl: MINI_VEG_PIZZA_IMAGE_URL,
    available: true,
    sortOrder: 15,
  },

  // Burger Corner
  {
    id: 'mini-chicken-burger',
    name: 'Mini Chicken Burger',
    category: 'Burger Corner',
    quantityLabel: '3 pieces/plate',
    originalPrice: 120,
    description: 'Three slider-sized crispy chicken burgers in toasted brioche buns.',
    imageUrl: MINI_CHICKEN_BURGER_IMAGE_URL,
    available: true,
    sortOrder: 16,
  },
  {
    id: 'mini-veg-burger',
    name: 'Mini Veg Burger',
    category: 'Burger Corner',
    quantityLabel: '3 pieces/plate',
    originalPrice: 100,
    description: 'Three golden vegetable patty sliders served with signature sauce.',
    imageUrl: MINI_VEG_BURGER_IMAGE_URL,
    available: true,
    sortOrder: 17,
  },

  // Fries Corner
  {
    id: 'salted-fries',
    name: 'Salted Fries',
    category: 'Fries Corner',
    quantityLabel: '1 serving',
    originalPrice: 70,
    description: 'Crisp golden potato fries lightly finished with sea salt.',
    imageUrl: SALTED_FRIES_IMAGE_URL,
    available: true,
    sortOrder: 18,
  },
  {
    id: 'peri-peri-fries',
    name: 'Peri Peri Fries',
    category: 'Fries Corner',
    quantityLabel: '1 serving',
    originalPrice: 80,
    description: 'Crispy fries tossed in tangy, smoky peri peri spice blend.',
    imageUrl: PERI_PERI_FRIES_IMAGE_URL,
    available: true,
    sortOrder: 19,
  },
  {
    id: 'loaded-chicken-fries',
    name: 'Loaded Chicken Fries',
    category: 'Fries Corner',
    quantityLabel: '1 serving',
    originalPrice: 160,
    description: 'Golden fries topped with seasoned chicken, creamy sauce, and melted cheese.',
    imageUrl: LOADED_FRIES_IMAGE_URL,
    available: true,
    sortOrder: 20,
  },

  // Pasta Corner
  {
    id: 'chicken-white-sauce-pasta',
    name: 'Chicken White Sauce Pasta',
    category: 'Pasta Corner',
    quantityLabel: '1 serving',
    originalPrice: 150,
    description: 'Penne tossed with tender chicken in a velvety garlic herb cream sauce.',
    imageUrl: CHICKEN_PASTA_IMAGE_URL,
    available: true,
    sortOrder: 21,
  },
  {
    id: 'veg-white-sauce-pasta',
    name: 'Veg White Sauce Pasta',
    category: 'Pasta Corner',
    quantityLabel: '1 serving',
    originalPrice: 120,
    description: 'Creamy white sauce pasta folded with sautéed seasonal vegetables.',
    imageUrl: VEG_PASTA_IMAGE_URL,
    available: true,
    sortOrder: 22,
  },

  // Additional Snacks
  {
    id: 'vada-pav',
    name: 'Vada Pav',
    category: 'Additional Snacks',
    quantityLabel: '1 piece',
    originalPrice: 40,
    description: 'Classic spiced potato fritter tucked inside soft pav with garlic chutney.',
    imageUrl: VADA_PAV_IMAGE_URL,
    available: true,
    sortOrder: 23,
  },

  // Desserts
  {
    id: 'gajar-ka-halwa',
    name: 'Gajar Ka Halwa',
    category: 'Desserts',
    quantityLabel: '100 grams',
    originalPrice: 100,
    description: 'Slow-simmered red carrot pudding enriched with khoya, ghee, and nuts.',
    imageUrl: GAJAR_HALWA_IMAGE_URL,
    available: true,
    sortOrder: 24,
  },
  {
    id: 'shahi-firni',
    name: 'Shahi Firni',
    category: 'Desserts',
    quantityLabel: '100 grams',
    originalPrice: 60,
    description: 'Silky saffron-cardamom rice pudding chilled in traditional style.',
    imageUrl: SHAHI_FIRNI_IMAGE_URL,
    available: true,
    sortOrder: 25,
  },
  {
    id: 'ande-ki-mithai',
    name: 'Ande Ki Mithai',
    category: 'Desserts',
    quantityLabel: '1 piece',
    originalPrice: 70,
    description: 'Rich baked Nawabi sweet crafted with slow-cooked milk solids and cardamom.',
    imageUrl: ANDE_KI_MITHAI_IMAGE_URL,
    available: true,
    sortOrder: 26,
  },
];

export const INITIAL_CAKE_MENU: CakeMenuItem[] = [
  {
    id: 'bento-cake',
    name: 'Bento Cake',
    cakeType: 'bento',
    quantityLabel: '250 grams',
    originalPrice: 130,
    priceUnit: '250g cake',
    flavours: ['Red Velvet', 'Chocolate', 'Pineapple', 'Vanilla'],
    notice: 'Minimum ordering notice: one hour before.',
    orderableOnline: true,
    eligibleForAutoDiscount: true,
    description: 'Handcrafted 250g celebration bento cake finished fresh to order in your choice of flavour.',
    imageUrl: BENTO_CAKE_IMAGE_URL,
    available: true,
    sortOrder: 1,
  },
  {
    id: 'cake-sicles',
    name: 'Cake Sicles',
    cakeType: 'sicle',
    quantityLabel: '1 piece',
    originalPrice: 40,
    priceUnit: 'per piece',
    flavours: [],
    notice: 'Freshly coated artisan cake popsicles ready for online ordering.',
    orderableOnline: true,
    eligibleForAutoDiscount: true,
    description: 'Rich sponge truffle coated in crisp chocolate shell with delicate garnish.',
    imageUrl: CAKE_SICLES_IMAGE_URL,
    available: true,
    sortOrder: 2,
  },
  {
    id: 'customizable-party-cakes',
    name: 'Customizable Party Cakes',
    cakeType: 'party',
    quantityLabel: 'Custom weight (per kg)',
    originalPrice: 500,
    priceUnit: 'per kg',
    flavours: [],
    notice: 'Party cakes and birthday cakes: order one day before.',
    orderableOnline: false,
    eligibleForAutoDiscount: false,
    description:
      'Bespoke birthday and celebration cakes crafted to your weight, flavour, and design references. Discussed and confirmed exclusively via WhatsApp.',
    imageUrl: CUSTOM_PARTY_CAKE_IMAGE_URL,
    available: true,
    sortOrder: 3,
  },
];
