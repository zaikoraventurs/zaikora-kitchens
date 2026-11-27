import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Phone,
  User,
  UserPlus,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import { BRAND_NAME, BRAND_TAGLINE } from '../data/catalog';
import { auth } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';

type AuthMode = 'login' | 'register';

export function LoginPage() {
  const {
    isCustomerAuthenticated,
    setDltPhoneSession,
    ensureCustomerProfile,
  } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/account';
  const initialMode: AuthMode = searchParams.get('mode') === 'register' ? 'register' : 'login';

  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [customerName, setCustomerName] = useState('');
  const [mobileDigits, setMobileDigits] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [showPin, setShowPin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [needsAnonymousAuthHelp, setNeedsAnonymousAuthHelp] = useState(false);

  useEffect(() => {
    const paramMode = searchParams.get('mode');
    if (paramMode === 'register') {
      setAuthMode('register');
    } else if (paramMode === 'login') {
      setAuthMode('login');
    }
  }, [searchParams]);

  useEffect(() => {
    if (isCustomerAuthenticated) {
      navigate(redirectTarget, { replace: true });
    }
  }, [isCustomerAuthenticated, navigate, redirectTarget]);

  const isValidIndianMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);
  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim());

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setNeedsAnonymousAuthHelp(false);

    const cleanedName = customerName.trim();
    const cleanedMobile = mobileDigits.replace(/\D/g, '');
    const cleanedEmail = email.trim().toLowerCase();
    const cleanedPin = pin.replace(/\D/g, '');

    if (authMode === 'register' && !cleanedName) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    if (!isValidIndianMobile(cleanedMobile)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }

    if (authMode === 'register' && !isValidEmail(cleanedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!/^\d{4}$/.test(cleanedPin)) {
      setErrorMessage('Please enter a 4-digit numeric account password (e.g. 1234).');
      return;
    }

    setSubmitting(true);
    try {
      let fbUser;
      try {
        fbUser = auth.currentUser || (await signInAnonymously(auth)).user;
      } catch (fbErr) {
        const msg = fbErr instanceof Error ? fbErr.message : String(fbErr);
        if (
          msg.includes('operation-not-allowed') ||
          msg.includes('admin-restricted-operation')
        ) {
          setNeedsAnonymousAuthHelp(true);
          setErrorMessage(
            'Enable Anonymous sign-in in Firebase Console (₹0 free) to store customer accounts, orders, and coupons.'
          );
          return;
        }
        setErrorMessage(msg || 'Unable to connect to Firebase Authentication.');
        return;
      }

      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/auth/pin-login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          mode: authMode,
          name: cleanedName,
          mobile: `+91${cleanedMobile}`,
          email: authMode === 'register' ? cleanedEmail : undefined,
          marketingConsent: authMode === 'register' ? marketingConsent : undefined,
          pin: cleanedPin,
        }),
      });

      const rawBody = await res.text();
      let data: {
        verified?: boolean;
        mode?: 'registered' | 'logged_in';
        phone?: string;
        name?: string;
        email?: string;
        marketingConsent?: boolean;
        accountNotFound?: boolean;
        accountExists?: boolean;
        loginCount?: number;
        orderCount?: number;
        sessionToken?: string;
        error?: string;
      } = {};

      if (rawBody) {
        try {
          data = JSON.parse(rawBody);
        } catch {
          setErrorMessage(
            `Login server endpoint (/api/auth/pin-login) returned HTML instead of JSON (HTTP ${res.status}). Ensure backend API routes or Netlify Functions are deployed and running.`
          );
          return;
        }
      }

      if (!res.ok || !data.verified || !data.phone || !data.sessionToken) {
        setErrorMessage(
          data.error || `Unable to complete ${authMode === 'register' ? 'registration' : 'sign in'} (HTTP ${res.status}).`
        );
        return;
      }

      const resolvedName = data.name || cleanedName || 'ZAIKORA Customer';
      const resolvedEmail = data.email || (authMode === 'register' ? cleanedEmail : undefined);
      setDltPhoneSession({
        phone: data.phone,
        name: resolvedName,
        email: resolvedEmail,
        sessionToken: data.sessionToken,
      });

      try {
        await ensureCustomerProfile(
          fbUser,
          resolvedName,
          data.phone,
          resolvedEmail,
          typeof data.marketingConsent === 'boolean'
            ? data.marketingConsent
            : authMode === 'register'
              ? marketingConsent
              : undefined
        );
      } catch (profileErr) {
        console.warn('Customer profile sync notice:', profileErr);
      }
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Unable to reach the login server: ${err.message}`
          : 'Unable to reach the login server. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setErrorMessage('');
  };

  const renderModeTabs = (compact = false) => (
    <div
      className="grid grid-cols-2 p-1 bg-zinc-100 rounded-xl border border-zinc-200"
      role="tablist"
      aria-label="Account mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={authMode === 'login'}
        onClick={() => switchMode('login')}
        className={`${compact ? 'min-h-[40px] text-xs' : 'py-2 text-xs sm:text-sm'} font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 ${
          authMode === 'login'
            ? 'bg-[#0A0A0B] text-white shadow-xs'
            : 'text-zinc-600 hover:text-zinc-900'
        }`}
      >
        <KeyRound className="w-3.5 h-3.5" />
        <span>Sign In</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={authMode === 'register'}
        onClick={() => switchMode('register')}
        className={`${compact ? 'min-h-[40px] text-xs' : 'py-2 text-xs sm:text-sm'} font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 ${
          authMode === 'register'
            ? 'bg-[#0A0A0B] text-white shadow-xs'
            : 'text-zinc-600 hover:text-zinc-900'
        }`}
      >
        <UserPlus className="w-3.5 h-3.5" />
        <span>Create Account</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Login / Create Account View (< 768px) */}
      <div className="md:hidden px-3.5 pt-4 pb-8 space-y-4">
        <div className="bg-[#0A0A0B] text-white rounded-2xl p-5 text-center border border-zinc-800">
          <BrandLogo className="h-14 w-auto mx-auto mb-2.5" />
          <h1 className="text-lg font-bold tracking-tight">
            {authMode === 'register' ? `Create ${BRAND_NAME} Account` : `${BRAND_NAME} Sign In`}
          </h1>
          <p className="text-[11px] tracking-widest text-[#E88D14] mt-0.5">{BRAND_TAGLINE}</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-4">
          {renderModeTabs(true)}

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">{errorMessage}</p>
                {needsAnonymousAuthHelp && (
                  <p className="text-[11px]">
                    Enable Anonymous sign-in in Firebase Console Authentication settings.
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-3.5">
            {authMode === 'register' && (
              <div>
                <label htmlFor="m-customer-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Full Name *
                </label>
                <div className="flex items-center border border-zinc-300 rounded-xl overflow-hidden focus-within:border-[#E88D14]">
                  <span className="pl-3 text-zinc-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    id="m-customer-name"
                    type="text"
                    required
                    maxLength={100}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your full name"
                    className="flex-1 min-h-[46px] px-3 py-2 text-base focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="m-mobile-number" className="block text-xs font-semibold text-zinc-700 mb-1">
                Indian Mobile Number (+91) *
              </label>
              <div className="flex items-center border border-zinc-300 rounded-xl overflow-hidden focus-within:border-[#E88D14]">
                <span className="px-3 min-h-[46px] bg-zinc-100 text-zinc-700 font-mono text-sm border-r border-zinc-300 select-none inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-zinc-500" />
                  +91
                </span>
                <input
                  id="m-mobile-number"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  value={mobileDigits}
                  onChange={(e) => setMobileDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98XXXXXXXX"
                  className="flex-1 min-h-[46px] px-3 py-2 text-base font-mono tabular-nums focus:outline-none"
                />
              </div>
            </div>

            {authMode === 'register' && (
              <div>
                <label htmlFor="m-customer-email" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Email Address *
                </label>
                <div className="flex items-center border border-zinc-300 rounded-xl overflow-hidden focus-within:border-[#E88D14]">
                  <span className="pl-3 text-zinc-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    id="m-customer-email"
                    type="email"
                    required
                    maxLength={160}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 min-h-[46px] px-3 py-2 text-base focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="m-login-pin" className="block text-xs font-semibold text-zinc-700">
                  4-Digit Account Password *
                </label>
                <button
                  type="button"
                  onClick={() => setShowPin((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#D97706] min-h-[32px]"
                >
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPin ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <div className="flex items-center border border-zinc-300 rounded-xl overflow-hidden focus-within:border-[#E88D14]">
                <span className="pl-3 text-zinc-400">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  id="m-login-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4-digit password"
                  className="flex-1 min-h-[46px] px-3 py-2 text-base font-mono tracking-[0.35em] tabular-nums focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5">
                {authMode === 'register'
                  ? 'Choose any 4-digit password. No mobile OTP or email verification is required.'
                  : 'Enter your registered mobile number and 4-digit password.'}
              </p>
            </div>

            {authMode === 'register' && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-300 text-[#E88D14] focus:ring-[#E88D14]"
                />
                <span>
                  Optional: Send me promotional offers, discounts, and updates via WhatsApp, phone calls, and email.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] py-3 px-4 bg-[#E88D14] text-black font-bold text-sm rounded-xl active:bg-[#f39c25] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? authMode === 'register'
                    ? 'Creating Account...'
                    : 'Signing In...'
                  : authMode === 'register'
                    ? 'Create Account'
                    : 'Sign In'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="text-[11px] text-center text-zinc-500 border-t border-zinc-100 pt-3 leading-relaxed">
            By creating an account and placing an order, you confirm you have read and understood the{' '}
            <Link to="/terms" className="font-semibold text-[#D97706] underline">
              ZAIKORA KITCHENS Terms and Conditions
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Desktop Login / Create Account View (>= 768px) */}
      <div className="hidden md:flex min-h-[80vh] items-center justify-center px-4 py-12 bg-[#FAFAFA]">
        <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#0A0A0B] text-white p-7 text-center border-b border-zinc-800">
            <BrandLogo className="h-20 w-auto mx-auto mb-4" />
            <h1 className="text-xl font-bold tracking-tight">
              {authMode === 'register'
                ? `Create ${BRAND_NAME} Account`
                : `${BRAND_NAME} Customer Sign In`}
            </h1>
            <p className="text-xs tracking-widest text-[#E88D14] mt-1">{BRAND_TAGLINE}</p>
          </div>

          <div className="p-7 space-y-5">
            {renderModeTabs(false)}

            {errorMessage && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="font-medium">{errorMessage}</p>
                  {needsAnonymousAuthHelp && (
                    <div className="text-xs text-red-800 leading-relaxed space-y-1.5 pt-1.5 border-t border-red-200/70">
                      <p className="font-semibold">Quick 1-time free setup (₹0, no billing card):</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>
                          Open{' '}
                          <a
                            href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-semibold"
                          >
                            Firebase Console → Authentication → Sign-in method
                          </a>
                        </li>
                        <li>Click <strong>Add new provider</strong> → select <strong>Anonymous</strong></li>
                        <li>Turn ON the <strong>Enable</strong> toggle and click <strong>Save</strong></li>
                        <li>Return here and submit the form again</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label htmlFor="customer-name" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Full Name *
                  </label>
                  <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                    <span className="pl-3.5 text-zinc-400">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      id="customer-name"
                      type="text"
                      required
                      maxLength={100}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Enter your full name"
                      className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="mobile-number" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Indian Mobile Number (+91) *
                </label>
                <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                  <span className="px-3.5 py-2.5 bg-zinc-100 text-zinc-700 font-mono text-sm border-r border-zinc-300 select-none inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-zinc-500" />
                    +91
                  </span>
                  <input
                    id="mobile-number"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    value={mobileDigits}
                    onChange={(e) => setMobileDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="98XXXXXXXX"
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono tabular-nums focus:outline-none"
                  />
                </div>
              </div>

              {authMode === 'register' && (
                <div>
                  <label htmlFor="customer-email" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Email Address *
                  </label>
                  <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                    <span className="pl-3.5 text-zinc-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      id="customer-email"
                      type="email"
                      required
                      maxLength={160}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-pin" className="block text-xs font-semibold text-zinc-700">
                    4-Digit Account Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPin((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D97706] hover:underline"
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPin ? 'Hide Password' : 'Show Password'}</span>
                  </button>
                </div>
                <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                  <span className="pl-3.5 text-zinc-400">
                    <KeyRound className="w-4 h-4" />
                  </span>
                  <input
                    id="login-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit password (e.g. 2468)"
                    className="flex-1 px-3 py-2.5 text-base font-mono tracking-[0.35em] tabular-nums focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  {authMode === 'register'
                    ? 'Choose any 4-digit numeric password. No mobile OTP or email verification is required.'
                    : 'Enter your registered +91 mobile number and 4-digit account password.'}
                </p>
              </div>

              {authMode === 'register' && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-200 bg-zinc-50 text-xs text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-300 text-[#E88D14] focus:ring-[#E88D14]"
                  />
                  <span>
                    Optional: I agree to receive promotional offers, discounts, and restaurant updates via WhatsApp, phone calls, and email.
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? authMode === 'register'
                      ? 'Creating Account...'
                      : 'Signing In...'
                    : authMode === 'register'
                      ? 'Create Customer Account'
                      : 'Sign In to Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <p className="text-xs text-center text-zinc-500 border-t border-zinc-100 pt-4 leading-relaxed">
              By creating an account and placing an order, you confirm you have read and understood the{' '}
              <Link to="/terms" className="font-semibold text-[#D97706] hover:underline">
                ZAIKORA KITCHENS Terms and Conditions
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
