import { Flame, HeartHandshake, Leaf, ShieldCheck } from 'lucide-react';

const QUALITY_PILLARS = [
  {
    label: 'HOMEMADE MASALAS',
    detail: 'Prepared fresh in-house — never outside ready-made masala mixes.',
    icon: Flame,
  },
  {
    label: 'PREMIUM QUALITY',
    detail: 'Carefully selected ingredients chosen for flavour and consistency.',
    icon: ShieldCheck,
  },
  {
    label: 'PREPARED WITH CARE',
    detail: 'Small-batch cooking focused on taste, hygiene, and customer care.',
    icon: HeartHandshake,
  },
  {
    label: 'FRESH INGREDIENTS',
    detail: 'Cooked fresh to order to preserve each dish’s authentic character.',
    icon: Leaf,
  },
] as const;

export function QualityPhilosophySection({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="Homemade masalas and quality philosophy"
      className={compact ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 pb-8'}
    >
      <div
        className={`bg-[#0A0A0B] text-white border border-zinc-800 rounded-2xl ${
          compact ? 'p-4 space-y-4' : 'p-8 sm:p-10 space-y-8'
        }`}
      >
        <div className={compact ? 'space-y-2' : 'max-w-3xl space-y-3'}>
          <p
            className={`font-semibold tracking-widest text-[#E88D14] ${
              compact ? 'text-[11px]' : 'text-xs'
            }`}
          >
            OUR QUALITY PHILOSOPHY · IN-HOUSE MASALAS
          </p>
          <h2
            className={`font-bold tracking-tight text-white text-balance ${
              compact ? 'text-lg leading-snug' : 'text-2xl sm:text-3xl'
            }`}
          >
            PREMIUM QUALITY. HOMEMADE MASALAS. FOOD MADE WITH CARE.
          </h2>
          <p
            className={`text-zinc-300 leading-relaxed ${
              compact ? 'text-xs' : 'text-sm sm:text-base'
            }`}
          >
            At ZAIKORA KITCHENS, we believe great food begins with quality ingredients and thoughtful preparation. Our masalas are prepared in-house, and we focus on premium-quality ingredients, freshness, and authentic flavours in every dish we serve.
          </p>
        </div>

        <div
          className={`grid gap-3 ${
            compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
          }`}
        >
          {QUALITY_PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.label}
                className={`bg-[#141416] border border-zinc-800 rounded-xl flex flex-col justify-between ${
                  compact ? 'p-3.5 gap-1.5' : 'p-5 gap-2.5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#E88D14]/15 border border-[#E88D14]/30 text-[#E88D14] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-bold tracking-wider text-white">
                    {pillar.label}
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{pillar.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
