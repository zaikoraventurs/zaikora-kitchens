const FSSAI_LICENCE_NUMBER = '21226189000544';

export function FoodLicencePage() {
  return (
    <div className="bg-white min-h-[75vh] flex items-center justify-center px-4 sm:px-6 py-16">
      <div className="w-full max-w-md mx-auto text-center flex flex-col items-center justify-center space-y-6">
        <img
          src="/assets/fssai-logo.png"
          alt="FSSAI Logo"
          className="h-24 sm:h-32 w-auto mx-auto object-contain"
        />
        <p className="text-lg sm:text-2xl font-semibold tracking-tight text-zinc-900">
          Licence Number:{' '}
          <span
            className="font-mono font-bold tabular-nums"
            data-testid="fssai-licence-number"
          >
            {FSSAI_LICENCE_NUMBER}
          </span>
        </p>
      </div>
    </div>
  );
}
