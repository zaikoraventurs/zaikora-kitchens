import { BRAND_NAME, OFFICIAL_LOGO_URL } from '../data/catalog';
export {
  FoodImage,
  MediaVideo,
  SiteMediaDisplay,
  preloadHeroImage,
} from './ReliableMedia';

export function BrandLogo({
  className = 'h-12 w-auto',
  alt = BRAND_NAME,
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={OFFICIAL_LOGO_URL}
      alt={alt}
      referrerPolicy="no-referrer"
      className={`object-contain select-none ${className}`}
    />
  );
}
