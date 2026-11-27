export const FSSAI_LICENCE_NUMBER = '21226189000544';

export function FssaiLicenceSection({
  id,
  testId = 'fssai-licence-number',
  className = '',
}: {
  id?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      aria-label="FSSAI Food Licence"
      className={`bg-[#0A0A0B] text-white border border-zinc-800 rounded-xl px-4 py-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-center gap-3 sm:gap-4 ${className}`}
    >
      <div className="bg-white rounded-md px-2.5 py-1 shrink-0 flex items-center justify-center">
        <img
          src="/assets/fssai-logo.png"
          alt="FSSAI Logo"
          className="h-7 sm:h-8 w-auto object-contain"
        />
      </div>
      <p className="text-xs sm:text-sm font-semibold tracking-tight text-zinc-100">
        Licence Number:{' '}
        <span
          className="font-mono font-bold tabular-nums text-[#E88D14]"
          data-testid={testId}
        >
          {FSSAI_LICENCE_NUMBER}
        </span>
      </p>
    </div>
  );
}
