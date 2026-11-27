import { ArrowLeft, ExternalLink, Instagram, Mail, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const PIXEL_CRAFT_LOGO_URL = '/assets/aistudio/nh_76ca642b.png';
const DEFAULT_INSTAGRAM_URL = 'https://www.instagram.com/pixel_craft1studio/';

const SERVICES = [
  'Website Designing and Development',
  'Business Website Development',
  'E-commerce Website Development',
  'Brand Management',
  'Social Media Management',
  'Graphic Design',
  'Google Ads Management',
  'Meta Ads Management',
  'Website Deployment',
  'Digital Advertising',
  'Creative Solutions',
];

export function PixelCraftStudioPage() {
  const { settings } = useApp();

  const studioPhone = settings.studioPhone?.trim() || '';
  const studioEmail = settings.studioEmail?.trim() || '';
  const studioInstagram = settings.studioInstagram?.trim() || DEFAULT_INSTAGRAM_URL;
  const telHref = studioPhone ? `tel:${studioPhone.replace(/[^\d+]/g, '')}` : '';
  const mailHref = studioEmail ? `mailto:${studioEmail}` : '';

  return (
    <div className="bg-white min-h-[82vh] py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-12">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to ZAIKORA KITCHENS</span>
          </Link>
        </div>

        {/* Brand Identity & Unmodified Uploaded Logo */}
        <section className="border border-zinc-200 rounded-2xl p-8 sm:p-10 bg-white text-center space-y-6">
          <div className="flex justify-center">
            <img
              src={PIXEL_CRAFT_LOGO_URL}
              alt="PIXEL CRAFT STUDIO Official Logo"
              className="w-full max-w-[300px] h-auto object-contain"
            />
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
              Digital Design &amp; Development Studio
            </p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-900">
              PIXEL CRAFT STUDIO
            </h1>
            <p className="text-sm font-medium text-zinc-700">
              Founder: <span className="font-semibold text-zinc-900">MOHAMMED AATIF SHARIFF</span>
            </p>
            <p className="text-sm text-zinc-600">
              Instagram:{' '}
              <a
                href={studioInstagram}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-zinc-900 underline underline-offset-4 hover:text-[#D97706]"
              >
                @pixel_craft1studio
              </a>
            </p>
          </div>
        </section>

        {/* Studio Introduction */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900">About the Studio</h2>
          <p className="text-base text-zinc-700 leading-relaxed">
            Pixel Craft Studio is a creative digital studio specialising in professional website
            designing and development, brand management, digital advertising and creative digital
            solutions. We help businesses establish a strong online presence through modern websites,
            professional branding and digital experiences.
          </p>
        </section>

        {/* Services List */}
        <section className="space-y-5">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900">Services Offered</h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SERVICES.map((service, index) => (
              <li
                key={service}
                className="flex items-start gap-3 p-4 rounded-xl border border-zinc-200 bg-[#FAFAFA]"
              >
                <span className="text-xs font-mono font-semibold text-zinc-500 pt-0.5 tabular-nums">
                  {String(index + 1).padStart(2, '0')}.
                </span>
                <span className="text-sm font-medium text-zinc-900">{service}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Configurable Contact Section */}
        <section className="border border-zinc-200 rounded-2xl p-6 sm:p-8 bg-[#FAFAFA] space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold tracking-tight text-zinc-900">
              Contact PIXEL CRAFT STUDIO
            </h2>
            <p className="text-sm text-zinc-600">
              Connect for website development, branding, and digital campaign enquiries.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="p-4 bg-white border border-zinc-200 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase">
                <Phone className="w-3.5 h-3.5" />
                <span>Business Mobile</span>
              </div>
              <p className="font-mono font-semibold text-zinc-900 break-words">
                {studioPhone || 'Not configured yet'}
              </p>
            </div>

            <div className="p-4 bg-white border border-zinc-200 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase">
                <Mail className="w-3.5 h-3.5" />
                <span>Business Email</span>
              </div>
              <p className="font-medium text-zinc-900 break-all">
                {studioEmail || 'Not configured yet'}
              </p>
            </div>

            <div className="p-4 bg-white border border-zinc-200 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase">
                <Instagram className="w-3.5 h-3.5" />
                <span>Instagram</span>
              </div>
              <p className="font-semibold text-zinc-900">@pixel_craft1studio</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {telHref && (
              <a
                href={telHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span>Call Now</span>
              </a>
            )}
            {mailHref && (
              <a
                href={mailHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-zinc-300 text-zinc-900 text-sm font-semibold rounded-lg hover:border-zinc-500 transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span>Email Us</span>
              </a>
            )}
            <a
              href={studioInstagram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E88D14] text-black text-sm font-semibold rounded-lg hover:bg-[#f39c25] transition-colors"
            >
              <Instagram className="w-4 h-4" />
              <span>Visit Instagram</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
