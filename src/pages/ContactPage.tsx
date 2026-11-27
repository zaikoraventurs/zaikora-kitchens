import { Link } from 'react-router-dom';
import { Clock, Mail, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { FssaiLicenceSection } from '../components/FssaiLicenceSection';
import { useApp } from '../context/AppContext';
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  COLLECTION_NOTICE,
  DELIVERY_RULES,
} from '../data/catalog';
import { buildPartyCakeWhatsAppUrl } from '../lib/pricing';

export function ContactPage() {
  const { settings } = useApp();
  const whatsappUrl = buildPartyCakeWhatsAppUrl(settings.whatsappNumber || '');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="bg-[#0A0A0B] text-white rounded-2xl border border-zinc-800 p-8 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-widest text-[#E88D14]">{BRAND_TAGLINE}</p>
          <h1 className="text-3xl font-bold tracking-tight">Contact {BRAND_NAME}</h1>
          <p className="text-sm text-zinc-300 max-w-xl">
            Reach out for order enquiries, Brigade Eldorado delivery or Main Gate collection support, and custom party cake consultations.
          </p>
        </div>
        <BrandLogo className="h-20 w-auto shrink-0" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-zinc-900">Kitchen Contact Details</h2>
          <div className="space-y-3 text-sm text-zinc-700">
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-[#D97706] shrink-0 mt-1" />
              <div>
                <p className="font-semibold text-zinc-900">Phone</p>
                <p className="font-mono text-zinc-600">
                  {settings.contactPhone || 'Configured via Admin Dashboard → Settings'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-[#D97706] shrink-0 mt-1" />
              <div>
                <p className="font-semibold text-zinc-900">Email</p>
                <p className="text-zinc-600">
                  {settings.contactEmail || 'Configured via Admin Dashboard → Settings'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-[#D97706] shrink-0 mt-1" />
              <div>
                <p className="font-semibold text-zinc-900">Preparation & Collection Point</p>
                <p className="text-zinc-600">
                  Standard preparation time: {settings.defaultPrepMinutes} minutes. {COLLECTION_NOTICE}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100">
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E88D14] text-black text-sm font-semibold rounded-lg hover:bg-[#f39c25] transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp Party Cake Desk</span>
              </a>
            ) : (
              <p className="text-xs text-zinc-500">
                WhatsApp number can be set by the restaurant administrator in Admin Dashboard → Settings.
              </p>
            )}
          </div>
        </section>

        <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#D97706]" />
            <h2 className="text-lg font-bold text-zinc-900">Delivery & Collection Policy</h2>
          </div>
          <ul className="space-y-2.5 text-sm text-zinc-700">
            {DELIVERY_RULES.map((rule) => (
              <li key={rule}>• {rule}</li>
            ))}
          </ul>
          <div className="pt-3 border-t border-zinc-100 flex flex-wrap gap-3">
            <Link
              to="/menu"
              className="px-4 py-2 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg"
            >
              Order Food Menu
            </Link>
            <Link
              to="/cakes"
              className="px-4 py-2 border border-zinc-300 text-zinc-800 text-xs font-semibold rounded-lg"
            >
              Enquire on Cakes Page
            </Link>
          </div>
        </section>
      </div>

      <FssaiLicenceSection
        id="food-licence-contact"
        testId="fssai-licence-number-contact"
      />
    </div>
  );
}
