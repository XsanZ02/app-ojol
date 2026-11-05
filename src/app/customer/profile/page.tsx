"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { InsetInput } from "@/components/ui/InsetInput";
import { profileApi } from "@/lib/api";
import { useToast } from "@/components/ui/ToastNotification";
import {
  User,
  Mail,
  Phone,
  Shield,
  Save,
  LogOut,
  Calendar,
  CheckCircle2,
} from "lucide-react";

export default function CustomerProfilePage() {
  const { user, logout, refresh } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "0812-3456-7890");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Nama tidak boleh kosong.", "error");
      return;
    }

    setIsSaving(true);
    try {
      if (user) {
        await profileApi.updateProfile(user.id, { name, phone });
        refresh();
        showToast("Profil berhasil diperbarui!", "success");
      }
    } catch {
      showToast("Gagal memperbarui profil.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout allowedRole="CUSTOMER">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="pb-2 border-b border-slate-200">
          <h1 className="text-2xl font-extrabold text-rf-navy">Profil Saya</h1>
          <p className="text-xs text-rf-text-secondary mt-0.5">
            Kelola identitas dan informasi akun penumpang RideFlow Anda
          </p>
        </div>

        {/* User Card */}
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
            <div className="w-16 h-16 rounded-full bg-slate-100 border-2 border-rf-blue overflow-hidden shadow-tactile-btn flex items-center justify-center shrink-0">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-8 h-8 text-slate-400" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-rf-text">{user?.name}</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-rf-blue border border-blue-200">
                  Penumpang
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                <span>Bergabung sejak 2026</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="pt-6 space-y-4">
            <InsetInput
              label="Nama Lengkap"
              value={name}
              onChange={(e) => setName(e.target.value)}
              leftIcon={<User className="w-4 h-4" />}
              required
            />

            <InsetInput
              label="Alamat Email (Akun)"
              type="email"
              value={email}
              disabled
              helperText="Email terhubung dengan kredensial login utama Anda."
              leftIcon={<Mail className="w-4 h-4" />}
            />

            <InsetInput
              label="Nomor Telepon / WhatsApp"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              helperText="Digunakan oleh pengemudi untuk mengonfirmasi titik jemput."
              leftIcon={<Phone className="w-4 h-4" />}
            />

            <div className="pt-4 flex items-center justify-between">
              <TactileButton
                type="submit"
                size="md"
                isLoading={isSaving}
                icon={<Save className="w-4 h-4" />}
              >
                Simpan Perubahan
              </TactileButton>

              <TactileButton
                type="button"
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => logout()}
                icon={<LogOut className="w-4 h-4" />}
              >
                Keluar Akun
              </TactileButton>
            </div>
          </form>
        </SurfaceCard>
      </div>
    </AppLayout>
  );
}
