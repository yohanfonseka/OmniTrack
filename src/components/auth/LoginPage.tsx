import React, { useState } from 'react';
import { ApiService } from '../../lib/api';
import { LogIn, AlertCircle, RefreshCw, Lock } from 'lucide-react';

interface LoginPageProps {
  onSignedIn: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await ApiService.login(email.trim(), password);
      onSignedIn();
    } catch (err: any) {
      setError(err.message || 'Could not sign in.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/omnitrack-logo.svg" alt="OmniTrack" className="h-9 mx-auto mb-3" />
          <p className="text-xs text-slate-500">Campaign monitoring for digital agencies</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Lock className="w-4 h-4 text-indigo-600" />
            <h1 className="text-sm font-bold text-slate-900">Sign in</h1>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Work email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-xs"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign in</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-500 text-center pt-1">
            Accounts are created by your agency administrator.
          </p>
        </form>
      </div>
    </div>
  );
};
