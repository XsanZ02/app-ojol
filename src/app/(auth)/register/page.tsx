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
  User,
  Phone,
  Car,
  FileText,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastNotification";
import { UserRole } from "@/types/user";
import { VehicleType } from "@/types/driver";
import { cn } from "@/lib/utils";
import { getRoleHomePath } from "@/lib/auth-api";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const { showToast } = useToast();

  const [role, setRole] = useState<Exclude<UserRole, "ADMIN">>("CUSTOMER");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [phone, setPhone] = useState("");

  // Driver fields
  const [vehicleType, setVehicleType] = useState<VehicleType>("MOTOR");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Nama lengkap harus diisi.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Alamat email tidak valid.");
      return;
    }
    const passwordBytes = new TextEncoder().encode(password).length;
    if (passwordBytes < 12 || passwordBytes > 72) {
      setError("Kata sandi harus sepanjang 12–72 byte UTF-8.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    if (role === "DRIVER") {
      if (!phone.trim()) {
        setError("Nomor telepon pengemudi harus diisi.");
        return;
      }
      if (!vehiclePlate.trim()) {
        setError("Nomor plat kendaraan (misal: DK 1234 AB) harus diisi.");
        return;
      }
      if (!vehicleModel.trim()) {
        setError("Model kendaraan (misal: Honda Vario 160) harus diisi.");
        return;
      }
    }

    setIsLoading(true);
    try {
      const user = await register({
        name,
        email,
        password,
        role,
        phone,
      });

      showToast("Pendaftaran berhasil! Selamat datang di RideFlow.", "success");
      router.push(getRoleHomePath(user));
    } catch (err: any) {
      setError(err?.message || "Terjadi kesalahan saat pendaftaran.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-rf-bg flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-white rounded-rf-xl border border-slate-200 shadow-tactile-float overflow-hidden">
        {/* Left Side: Branding Panel */}
        <div className="hidden lg:flex lg:col-span-5 bg-gradient-to-br from-rf-navy via-[#1e2f56] to-rf-blue p-10 flex-col justify-between text-white relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-rf bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-tactile-btn">
              <Bike className="w-6 h-6" />
            </div>
            <span className="font-extrabold text-2xl tracking-tight">
              Ride<span className="text-blue-300">Flow</span>
            </span>
          </div>

          <div className="my-10 space-y-4">
            <h2 className="text-3xl font-extrabold tracking-tight leading-tight">
              Bergabung dengan Ekosistem RideFlow
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Daftar sebagai Penumpang untuk menikmati perjalanan aman dan nyaman, atau bergabung sebagai Mitra Pengemudi untuk penghasilan fleksibel di Bali.
            </p>

            <div className="pt-4 space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Estimasi tarif transparan tanpa biaya tersembunyi</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Pilihan kendaraan motor gesit dan mobil ber-AC</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Navigasi rute optimal kawasan Denpasar & Sanur</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-rf bg-white/10 backdrop-blur-md border border-white/15 text-xs text-slate-300 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Data Anda tersimpan dengan aman pada arsitektur terisolasi.</span>
          </div>
        </div>

        {/* Right Side: Registration Form */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h1 className="text-2xl font-extrabold text-rf-text">
              Daftar Akun Baru
            </h1>
            <p className="text-sm text-rf-text-secondary mt-1">
              Pilih peran Anda dan lengkapi formulir di bawah ini.
            </p>
          </div>

          {/* Role Selector Tabs (Tactile) */}
          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-rf-text-secondary mb-2">
              Pilih Peran Pengguna
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("CUSTOMER")}
                className={cn(
                  "p-3.5 rounded-rf text-left transition-all border flex items-center gap-3",
                  role === "CUSTOMER"
                    ? "bg-blue-50/80 border-rf-blue text-rf-blue shadow-[0_2px_4px_rgba(37,99,235,0.12),inset_0_1px_0_#ffffff]"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                    role === "CUSTOMER"
                      ? "bg-rf-blue text-white shadow-tactile-btn"
                      : "bg-slate-100 text-slate-500"
                  )}
                >
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-sm">Penumpang</div>
                  <div className="text-[11px] text-rf-text-secondary">
                    Pesan perjalanan
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole("DRIVER")}
                className={cn(
                  "p-3.5 rounded-rf text-left transition-all border flex items-center gap-3",
                  role === "DRIVER"
                    ? "bg-amber-50/80 border-amber-500 text-amber-800 shadow-[0_2px_4px_rgba(245,158,11,0.15),inset_0_1px_0_#ffffff]"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                    role === "DRIVER"
                      ? "bg-amber-500 text-white shadow-tactile-btn"
                      : "bg-slate-100 text-slate-500"
                  )}
                >
                  <Bike className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-sm">Mitra Pengemudi</div>
                  <div className="text-[11px] text-rf-text-secondary">
                    Terima order tarikan
                  </div>
                </div>
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-rf text-xs font-medium text-rose-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <InsetInput
              label="Nama Lengkap"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              leftIcon={<User className="w-4 h-4" />}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                label="Nomor Telepon"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812-xxxx-xxxx"
                leftIcon={<Phone className="w-4 h-4" />}
                required={role === "DRIVER"}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InsetInput
                label="Kata Sandi"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="12–72 byte UTF-8"
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />

              <InsetInput
                label="Konfirmasi Sandi"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Ulangi kata sandi"
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />
            </div>

            {/* Additional Driver Fields */}
            {role === "DRIVER" && (
              <div className="p-4 bg-amber-50/50 rounded-rf border border-amber-200/80 space-y-3.5 animate-in fade-in duration-150">
                <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Bike className="w-4 h-4 text-amber-600" />
                  <span>Informasi Kendaraan Pengemudi</span>
                </div>
                <p className="text-xs text-amber-900">
                  Informasi kendaraan belum disimpan oleh endpoint autentikasi backend.
                  Pendaftaran kendaraan perlu dilakukan setelah login.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Jenis Kendaraan
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setVehicleType("MOTOR")}
                      className={cn(
                        "h-10 px-3 rounded-rf-sm flex items-center justify-center gap-2 text-xs font-bold border transition-colors",
                        vehicleType === "MOTOR"
                          ? "bg-white text-rf-blue border-rf-blue shadow-sm"
                          : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-white"
                      )}
                    >
                      <Bike className="w-4 h-4" />
                      <span>Sepeda Motor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVehicleType("MOBIL")}
                      className={cn(
                        "h-10 px-3 rounded-rf-sm flex items-center justify-center gap-2 text-xs font-bold border transition-colors",
                        vehicleType === "MOBIL"
                          ? "bg-white text-rf-blue border-rf-blue shadow-sm"
                          : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-white"
                      )}
                    >
                      <Car className="w-4 h-4" />
                      <span>Mobil (Car)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InsetInput
                    label="Nomor Plat Kendaraan"
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="DK 1234 XX"
                    leftIcon={<FileText className="w-4 h-4" />}
                    required
                  />

                  <InsetInput
                    label="Model & Warna Kendaraan"
                    type="text"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="Honda Vario 160 Hitam"
                    leftIcon={<Car className="w-4 h-4" />}
                    required
                  />
                </div>
              </div>
            )}

            <TactileButton
              type="submit"
              className="w-full mt-3"
              size="lg"
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Daftar Sekarang
            </TactileButton>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-rf-text-secondary">
            Sudah memiliki akun?{" "}
            <Link href="/login" className="font-bold text-rf-blue hover:underline">
              Masuk di sini
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
