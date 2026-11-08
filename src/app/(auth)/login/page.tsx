"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { TactileButton } from "@/components/ui/TactileButton";
import { InsetInput } from "@/components/ui/InsetInput";
import {
  Bike,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Compass,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastNotification";
import { getRoleHomePath } from "@/lib/auth-api";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Silakan masukkan email dan kata sandi.");
      return;
    }

    setIsLoading(true);
    try {
      const user = await login({ email, password, rememberMe });
      showToast(`Selamat datang kembali, ${user.name}!`, "success");
      router.push(getRoleHomePath(user));
    } catch (err: any) {
      setError(err?.message || "Gagal masuk. Periksa kembali email dan sandi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-rf-bg flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-white rounded-rf-xl border border-slate-200 shadow-tactile-float overflow-hidden">
        {/* Left Side: Modern Skeuomorphic Branding Panel (Visible on Desktop) */}
        <div className="hidden lg:flex lg:col-span-5 bg-gradient-to-br from-rf-navy via-[#1e2f56] to-rf-blue p-10 flex-col justify-between text-white relative overflow-hidden">
          {/* Subtle geometric & road contours in background */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20%" cy="30%" r="200" stroke="#ffffff" strokeWidth="2" fill="none" />
              <circle cx="90%" cy="80%" r="240" stroke="#ffffff" strokeWidth="2" fill="none" />
              <path d="M -50 200 Q 150 400 450 150" stroke="#ffffff" strokeWidth="8" fill="none" />
            </svg>
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-rf bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-tactile-btn">
                <Bike className="w-6 h-6" />
              </div>
              <span className="font-extrabold text-2xl tracking-tight">
                Ride<span className="text-blue-300">Flow</span>
              </span>
            </div>

            <div className="mt-12 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-blue-200">
                <Compass className="w-3.5 h-3.5" />
                <span>Layanan perjalanan di Bali</span>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight leading-tight">
                Layanan perjalanan untuk aktivitas Anda.
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Pesan perjalanan dengan mudah dan pantau perjalanan Anda di kawasan Denpasar, Panjer, Renon, dan Sanur.
              </p>
            </div>
          </div>

          {/* Bottom Testimonial/Badge */}
          <div className="relative z-10 p-4 rounded-rf bg-white/10 backdrop-blur-md border border-white/15 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Akun Anda terlindungi</span>
            </div>
            <p className="text-xs text-slate-300">
          Akses akun dan pantau perjalanan Anda dengan mudah.
            </p>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-rf bg-gradient-to-br from-rf-navy to-rf-blue flex items-center justify-center text-white shadow-tactile-btn">
              <Bike className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tight text-rf-navy">
              Ride<span className="text-rf-blue">Flow</span>
            </span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-extrabold text-rf-text">
              Masuk ke Akun Anda
            </h1>
            <p className="text-sm text-rf-text-secondary mt-1">
              Masuk menggunakan email dan kata sandi akun RideFlow Anda.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-rf text-xs font-medium text-rose-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <InsetInput
              label="Alamat Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@domain.com"
              leftIcon={<Mail className="w-4 h-4" />}
              required
            />

            <InsetInput
              label="Kata Sandi"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              }
              required
            />

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-rf-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rf-blue focus:ring-rf-blue/30"
                />
                <span>Ingat saya di tab ini</span>
              </label>

              <span className="text-xs text-rf-blue hover:underline cursor-pointer">
                Lupa sandi?
              </span>
            </div>

            <TactileButton
              type="submit"
              className="w-full mt-2"
              size="lg"
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Masuk Sekarang
            </TactileButton>
          </form>

          {/* Registration Link */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-rf-text-secondary">
            Belum memiliki akun RideFlow?{" "}
            <Link
              href="/register"
              className="font-bold text-rf-blue hover:underline"
            >
              Daftar akun baru di sini
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
