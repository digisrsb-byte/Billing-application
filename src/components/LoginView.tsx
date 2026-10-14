import React, { useState } from 'react';
import logoImg from '../assets/images/srk_enterprises_logo.jpg';
import { verifyAndStartSession } from '../services/auth';
import { Eye, EyeOff, Lock, Phone, ArrowRight } from 'lucide-react';

interface LoginViewProps {
  onSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone.trim() || !password) {
      setError('Enter phone number and password');
      return;
    }

    setBusy(true);
    try {
      const ok = await verifyAndStartSession(phone, password);
      if (ok) {
        onSuccess();
      } else {
        setError('Invalid phone number or password');
        setBusy(false);
      }
    } catch {
      setError('Unable to sign in. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col lg:flex-row overflow-hidden">
      {/* Left — water-themed brand panel */}
      <div className="relative lg:w-[46%] min-h-[240px] lg:min-h-screen bg-[#081C2D] flex items-center justify-center px-8 py-12 overflow-hidden">
        {/* Soft water glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(78, 180, 210, 0.28) 0%, transparent 55%), radial-gradient(circle at 20% 30%, rgba(31, 122, 99, 0.18) 0%, transparent 40%)'
          }}
        />

        {/* Wave layers */}
        <svg
          className="absolute bottom-0 left-0 w-full h-[42%] pointer-events-none opacity-90"
          viewBox="0 0 800 320"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0 180 C120 120, 220 240, 360 170 C500 100, 600 220, 800 150 L800 320 L0 320 Z"
            fill="rgba(70, 190, 220, 0.22)"
          />
          <path
            d="M0 210 C140 150, 260 250, 400 190 C540 130, 660 240, 800 180 L800 320 L0 320 Z"
            fill="rgba(55, 170, 200, 0.28)"
          />
          <path
            d="M0 240 C160 200, 280 280, 420 230 C560 180, 680 270, 800 220 L800 320 L0 320 Z"
            fill="rgba(40, 150, 185, 0.35)"
          />
        </svg>

        {/* Bubbles */}
        <div className="absolute bottom-[18%] left-[12%] w-3 h-3 rounded-full bg-sky-300/40 blur-[1px]" />
        <div className="absolute bottom-[28%] left-[28%] w-2 h-2 rounded-full bg-sky-200/50" />
        <div className="absolute bottom-[22%] right-[18%] w-4 h-4 rounded-full bg-cyan-300/30 blur-[0.5px]" />
        <div className="absolute bottom-[38%] right-[30%] w-2.5 h-2.5 rounded-full bg-sky-200/40" />
        <div className="absolute bottom-[45%] left-[42%] w-1.5 h-1.5 rounded-full bg-white/35" />

        {/* Company logo */}
        <div className="relative z-10 flex flex-col items-center gap-5">
          <div className="bg-white rounded-2xl p-4 w-[220px] h-[220px] sm:w-[240px] sm:h-[240px] flex items-center justify-center shadow-[0_12px_40px_rgba(0,0,0,0.25)] overflow-hidden">
            <img
              src={logoImg}
              alt="SRK Enterprises"
              className="w-full h-full object-contain object-center scale-[1.12]"
            />
          </div>
          <p className="text-white/70 text-xs font-semibold tracking-[0.2em] uppercase m-0">
            Pure Water · Reliable Supply
          </p>
        </div>
      </div>

      {/* Right — sign in form */}
      <div className="relative flex-1 bg-[#F3F6F8] flex items-center justify-center px-5 py-10 sm:px-10 overflow-hidden">
        {/* Soft concentric accents */}
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full border border-[#1F7A63]/10 pointer-events-none"
          aria-hidden
        />
        <div
          className="absolute -top-12 -right-12 w-48 h-48 rounded-full border border-[#1F7A63]/10 pointer-events-none"
          aria-hidden
        />
        <div
          className="absolute -bottom-28 -right-16 w-80 h-80 rounded-full border border-[#1F7A63]/10 pointer-events-none"
          aria-hidden
        />

        <form
          onSubmit={handleSubmit}
          className="relative z-10 w-full max-w-[400px] bg-white rounded-2xl shadow-[0_12px_40px_rgba(8,28,45,0.08)] border border-[#E8ECEF] p-7 sm:p-8 space-y-5"
        >
          <h2 className="text-[1.75rem] font-bold text-[#081C2D] m-0 tracking-tight">Sign In</h2>

          <div>
            <label className="block text-sm font-bold text-[#081C2D] mb-2">Phone number</label>
            <div className="relative">
              <Phone className="w-[18px] h-[18px] text-[#9AA3A8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                autoFocus
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your phone number"
                className="w-full h-12 pl-11 pr-3 rounded-xl border border-[#D5DBDF] bg-[#F8FAFB] text-[#081C2D] text-[15px] font-medium placeholder:text-[#B0B7BC] focus:outline-none focus:border-[#1F7A63] focus:ring-2 focus:ring-[#1F7A63]/20 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-[#081C2D] mb-2">Password</label>
            <div className="relative">
              <Lock className="w-[18px] h-[18px] text-[#9AA3A8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your password"
                className="w-full h-12 pl-11 pr-11 rounded-xl border border-[#D5DBDF] bg-[#F8FAFB] text-[#081C2D] text-[15px] font-medium placeholder:text-[#B0B7BC] focus:outline-none focus:border-[#1F7A63] focus:ring-2 focus:ring-[#1F7A63]/20 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9AA3A8] hover:text-[#081C2D] cursor-pointer p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-xl bg-[#1F7A63] hover:bg-[#186351] disabled:opacity-60 text-white font-bold text-[15px] flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {busy ? 'Signing in…' : 'Sign In'}
            {!busy && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};
