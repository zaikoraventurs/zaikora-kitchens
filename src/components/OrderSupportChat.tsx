import React, { useEffect, useRef, useState } from 'react';
import { Bot, ExternalLink, Headphones, MessageCircle, Phone, Send, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BRAND_NAME } from '../data/catalog';
import { parseApiResponse } from '../lib/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  escalationSuggested?: boolean;
}

const INITIAL_GREETING =
  'Hello! Welcome to ZAIKORA KITCHENS Customer Support. How can I help you with your order today?';

const QUICK_PROMPTS = [
  'Where is my order?',
  'What is my current order status?',
  'Check my payment status',
  'Why is my order delayed?',
  'Missing or incorrect item',
  'Delivery & collection rules',
];

export function OrderSupportChat({ activeOrderId }: { activeOrderId?: string }) {
  const { user, settings, cart } = useApp();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: INITIAL_GREETING,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [contactInfo, setContactInfo] = useState({
    whatsappNumber: settings.whatsappNumber || '918970007665',
    contactPhone: settings.contactPhone || '+91 8970007665',
    contactEmail: settings.contactEmail || 'contact.zaikoraventures@gmail.com',
  });

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setContactInfo({
      whatsappNumber: settings.whatsappNumber || '918970007665',
      contactPhone: settings.contactPhone || '+91 8970007665',
      contactEmail: settings.contactEmail || 'contact.zaikoraventures@gmail.com',
    });
  }, [settings.whatsappNumber, settings.contactPhone, settings.contactEmail]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, sending]);

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    setErrorMsg('');
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      };

      if (user) {
        const idToken = await user.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch('/api/support/chat', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          message: trimmed,
          orderId: activeOrderId || undefined,
          history: nextHistory
            .filter((m) => m.id !== 'welcome')
            .slice(-10)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const parsed = await parseApiResponse<{
        reply?: string;
        escalationSuggested?: boolean;
        contact?: {
          whatsappNumber?: string;
          contactPhone?: string;
          contactEmail?: string;
        };
        error?: string;
      }>(res);

      if (!parsed.isJson || !parsed.data) {
        setErrorMsg('Support service is temporarily unavailable. Please reach us on WhatsApp or phone below.');
        return;
      }

      const data = parsed.data;

      if (data.contact) {
        setContactInfo({
          whatsappNumber: data.contact.whatsappNumber || settings.whatsappNumber || '918970007665',
          contactPhone: data.contact.contactPhone || settings.contactPhone || '+91 8970007665',
          contactEmail: data.contact.contactEmail || settings.contactEmail || 'contact.zaikoraventures@gmail.com',
        });
      }

      if (!res.ok || !data.reply) {
        setErrorMsg(data.error || 'Support assistant could not reply right now.');
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: data.reply!,
          escalationSuggested: Boolean(data.escalationSuggested),
        },
      ]);
    } catch {
      setErrorMsg('Unable to connect to support right now. Please use WhatsApp or call us below.');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const cleanWaDigits = contactInfo.whatsappNumber.replace(/\D/g, '');
  const waPrefill = activeOrderId
    ? `Hello ZAIKORA KITCHENS Support, I need assistance with Order ID: ${activeOrderId}.`
    : 'Hello ZAIKORA KITCHENS Support, I need help with my order.';
  const whatsappHref = cleanWaDigits
    ? `https://wa.me/${cleanWaDigits}?text=${encodeURIComponent(waPrefill)}`
    : '';

  const mobileBottomClass =
    cart.length > 0
      ? 'bottom-[calc(132px+env(safe-area-inset-bottom))]'
      : 'bottom-[calc(76px+env(safe-area-inset-bottom))]';

  return (
    <div className={`fixed ${mobileBottomClass} right-3.5 md:bottom-5 md:right-5 z-50 flex flex-col items-end`}>
      {open && (
        <div
          className="mb-3 w-[calc(100vw-1.75rem)] sm:w-[390px] h-[480px] sm:h-[540px] max-h-[68vh] sm:max-h-[78vh] bg-white border border-zinc-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="AI Customer Support Chat"
        >
          {/* Header */}
          <div className="bg-[#0A0A0B] text-white px-4 py-3.5 flex items-center justify-between gap-3 border-b border-zinc-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#E88D14] text-black flex items-center justify-center shrink-0">
                <Headphones className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">AI Customer Support</p>
                <p className="text-[11px] text-zinc-400 truncate">
                  {BRAND_NAME}
                  {activeOrderId ? ` · Order ${activeOrderId}` : ' · Order Help'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              aria-label="Close customer support chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#FAFAFA]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#0A0A0B] text-white rounded-br-sm'
                      : 'bg-white border border-zinc-200 text-zinc-800 rounded-bl-sm shadow-xs'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#D97706] mb-1">
                      <Bot className="w-3 h-3" />
                      <span>ZAIKORA Support</span>
                    </div>
                  )}
                  <p>{msg.text}</p>

                  {msg.role === 'assistant' && msg.escalationSuggested && whatsappHref && (
                    <div className="mt-2.5 pt-2.5 border-t border-zinc-100 flex flex-wrap gap-2">
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E88D14] text-black font-semibold text-[11px] rounded-lg hover:bg-[#f39c25] transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Chat on WhatsApp</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={`tel:${contactInfo.contactPhone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 text-zinc-900 font-semibold text-[11px] rounded-lg hover:bg-zinc-200 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call Kitchen</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-start">
                <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs text-zinc-500">
                  Checking your order details...
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-2">
                <p>{errorMsg}</p>
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-[#D97706] underline"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Contact us directly on WhatsApp</span>
                  </a>
                )}
              </div>
            )}

            {/* Quick Help Prompts when conversation just started */}
            {messages.length <= 2 && !sending && (
              <div className="pt-1 space-y-1.5">
                <p className="text-[11px] font-medium text-zinc-500">Quick topics:</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="text-left text-[11px] font-medium px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 hover:border-[#E88D14] hover:text-zinc-900 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Persistent Direct Escalation Footer Strip */}
          <div className="px-3 py-1.5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between text-[11px] text-zinc-600">
            <span>Need direct kitchen help?</span>
            <div className="flex items-center gap-3">
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#D97706] hover:underline"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>WhatsApp</span>
                </a>
              )}
              <a
                href={`tel:${contactInfo.contactPhone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1 font-semibold text-zinc-700 hover:underline"
              >
                <Phone className="w-3 h-3" />
                <span>Call</span>
              </a>
            </div>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSubmit}
            className="p-3 bg-white border-t border-zinc-200 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your order status, delivery, items..."
              maxLength={400}
              disabled={sending}
              className="flex-1 px-3 py-2 text-xs sm:text-sm border border-zinc-300 rounded-xl focus:outline-none focus:border-[#E88D14]"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send support message"
              className="p-2.5 bg-[#E88D14] text-black rounded-xl hover:bg-[#f39c25] disabled:opacity-50 transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Support Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2.5 px-5 py-3.5 bg-[#0A0A0B] text-white border border-zinc-700 rounded-full shadow-xl hover:bg-[#E88D14] hover:text-black hover:border-[#E88D14] transition-colors font-semibold text-sm"
      >
        <Headphones className="w-4 h-4 text-[#E88D14] group-hover:text-black" />
        <span>AI Customer Support</span>
      </button>
    </div>
  );
}
