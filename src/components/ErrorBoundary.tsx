import React from 'react';
import { BRAND_NAME, BRAND_TAGLINE, OFFICIAL_LOGO_URL } from '../data/catalog';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#141416] border border-zinc-800 rounded-xl p-8 text-center">
            <img
              src={OFFICIAL_LOGO_URL}
              alt={BRAND_NAME}
              className="h-24 w-auto mx-auto mb-6 object-contain"
            />
            <h1 className="text-xl font-semibold tracking-tight mb-2">
              {BRAND_NAME} encountered an issue
            </h1>
            <p className="text-xs tracking-widest text-[#E88D14] mb-4">{BRAND_TAGLINE}</p>
            <p className="text-sm text-zinc-400 mb-6 break-words">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="px-5 py-2.5 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors"
            >
              Return Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
