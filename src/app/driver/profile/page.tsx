"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { InsetInput } from "@/components/ui/InsetInput";
import { driverApi, DriverDocument, DriverVehicle, DriverApiProfile } from "@/lib/api";
import { useToast } from "@/components/ui/ToastNotification";
import {
  User,
  Phone,
  Bike,
  Car,
  FileText,
  Star,
  Save,
  LogOut,
  Palette,
  Wrench,
  AlertCircle,
  Clock,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { VehicleType } from "@/types/driver";

export default function DriverProfilePage() {
  const { user, driverProfile, logout, refreshSession, refresh } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || driverProfile?.phone || "");
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    (driverProfile?.vehicleType as VehicleType) || "MOTOR"
  );
  const [vehiclePlate, setVehiclePlate] = useState(
    driverProfile?.vehiclePlate || ""
  );
  const [make, setMake] = useState("");
  const [model, setModel] = useState(driverProfile?.vehicleModel || "");
  const [color, setColor] = useState("");

  const [existingVehicle, setExistingVehicle] = useState<DriverVehicle | null>(null);
  const [backendProfile, setBackendProfile] = useState<DriverApiProfile | null>(null);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<DriverDocument["type"] | null>(null);

  const loadData = useCallback(async (): Promise<boolean> => {
    setIsLoadingData(true);
    setLoadError(null);
    try {
      const [profileRes, vehiclesRes, documentsRes] = await Promise.all([
        driverApi.getProfile(),
        driverApi.getVehicles(),
        driverApi.getDocuments(),
      ]);

      setBackendProfile(profileRes);
      setDocuments(documentsRes);

      if (vehiclesRes && vehiclesRes.length > 0) {
        const veh = vehiclesRes[0];
        setExistingVehicle(veh);
        setVehicleType(veh.vehicleType || "MOTOR");
        setVehiclePlate(veh.vehiclePlate || "");
        setMake(veh.make || "");
        setModel(veh.model || "");
        setColor(veh.color || "");
      } else {
        setExistingVehicle(null);
        setVehicleType("MOTOR");
        setVehiclePlate("");
        setMake("");
        setModel("");
        setColor("");
      }
      return true;
    } catch (err) {
      console.error("Gagal memuat profil atau kendaraan dari server:", err);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Data profil dan kendaraan tidak dapat dimuat dari server."
      );
      return false;
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.phone) setPhone(user.phone);
    loadData();
  }, [loadData, user?.name, user?.phone]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedPlate = vehiclePlate.trim().toUpperCase().replace(/[\s-]/g, "");
    const trimmedMake = make.trim();
    const trimmedModel = model.trim();
    const trimmedColor = color.trim();
    const shouldSaveVehicle =
      !existingVehicle ||
      existingVehicle.verificationStatus === "pending" ||
      existingVehicle.verificationStatus === "rejected";

    if (!trimmedName) {
      showToast("Nama lengkap tidak boleh kosong.", "error");
      return;
    }
    if (!trimmedPhone) {
      showToast("Nomor telepon tidak boleh kosong.", "error");
      return;
    }
    if (shouldSaveVehicle && !trimmedPlate) {
      showToast("Nomor plat kendaraan tidak boleh kosong.", "error");
      return;
    }
    if (shouldSaveVehicle && !trimmedMake) {
      showToast("Merek kendaraan tidak boleh kosong.", "error");
      return;
    }
    if (shouldSaveVehicle && !trimmedModel) {
      showToast("Model kendaraan tidak boleh kosong.", "error");
      return;
    }
    if (shouldSaveVehicle && !trimmedColor) {
      showToast("Warna kendaraan tidak boleh kosong.", "error");
      return;
    }

    setIsSaving(true);
    try {
      // 1. Simpan update profil pribadi (users table di backend)
      await driverApi.updateProfile({
        name: trimmedName,
        phone: trimmedPhone,
      });

      // 2. Simpan data kendaraan ke PostgreSQL via backend Quarkus
      if (shouldSaveVehicle) {
        const vehicle = {
          vehicleType,
          vehiclePlate: trimmedPlate,
          make: trimmedMake,
          model: trimmedModel,
          color: trimmedColor,
        };

        if (existingVehicle) {
          await driverApi.updateVehicle(existingVehicle.id, vehicle);
        } else {
          await driverApi.registerVehicle(vehicle);
        }
      }

      if (!(await loadData())) {
        throw new Error("Perubahan tersimpan, tetapi data terbaru gagal dimuat.");
      }
      if (refreshSession) {
        await refreshSession();
      } else if (refresh) {
        refresh();
      }

      showToast(
        shouldSaveVehicle
          ? "Profil dan data kendaraan berhasil disimpan ke server."
          : "Profil berhasil diperbarui. Data kendaraan yang telah diproses tidak diubah.",
        "success"
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Gagal memperbarui profil dan kendaraan.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isMotor = vehicleType === "MOTOR";
  const driverStatus = backendProfile?.status || "pending";
  const vehicleStatus = existingVehicle?.verificationStatus || "none";
  const isVehicleVerified = existingVehicle?.verificationStatus === "verified";
  const isVehicleEditable =
    !existingVehicle ||
    existingVehicle.verificationStatus === "pending" ||
    existingVehicle.verificationStatus === "rejected";
  const profileVerificationStatus = backendProfile?.verificationStatus || "pending";

  const uploadDocument = async (
    type: DriverDocument["type"],
    file: File | undefined
  ) => {
    if (!file) return;
    if (file.size > 10_000_000) {
      showToast("Ukuran file maksimal 10 MB.", "error");
      return;
    }
    if ((type === "stnk" || type === "vehicle_photo") && !existingVehicle) {
      showToast("Simpan data kendaraan terlebih dahulu.", "error");
      return;
    }
    setUploadingType(type);
    try {
      await driverApi.uploadDocument(
        type,
        file,
        type === "stnk" || type === "vehicle_photo" ? existingVehicle?.id : undefined
      );
      setDocuments(await driverApi.getDocuments());
      const updatedProfile = await driverApi.getProfile();
      setBackendProfile(updatedProfile);
      showToast(`${documentLabel(type)} berhasil diunggah untuk diverifikasi.`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Dokumen gagal diunggah.", "error");
    } finally {
      setUploadingType(null);
    }
  };

  const latestDocument = (type: DriverDocument["type"]) =>
    documents
      .filter((document) => document.type === type)
      .sort((left, right) => right.version - left.version)[0];

  return (
    <AppLayout allowedRole="DRIVER">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="pb-2 border-b border-slate-200">
          <h1 className="text-2xl font-extrabold text-rf-navy">
            Profil Mitra Pengemudi
          </h1>
          <p className="text-xs text-rf-text-secondary mt-0.5">
            Kelola data akun pengemudi dan armada kendaraan resmi Anda
          </p>
        </div>

        {/* Onboarding & Verification Status Banners */}
        {driverStatus === "pending" && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-rf-md flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-amber-900 block text-sm">
                Akun Menunggu Persetujuan Admin
              </span>
              <p className="text-amber-800 mt-0.5">
                Akun kemitraan Anda saat ini berstatus <strong>Pending</strong>. Anda dapat melengkapi profil dan armada di bawah ini sembari menunggu proses verifikasi akun dari admin.
              </p>
            </div>
          </div>
        )}

        {driverStatus === "suspended" && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-rf-md flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-rose-900 block text-sm">
                Akun Ditangguhkan
              </span>
              <p className="text-rose-800 mt-0.5">
                Akun Anda sedang ditangguhkan. Silakan hubungi pusat bantuan atau admin RideFlow untuk informasi lebih lanjut.
              </p>
            </div>
          </div>
        )}

        {profileVerificationStatus === "rejected" && (
          <div className="flex items-start gap-3 rounded-rf-md border border-rose-200 bg-rose-50 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="text-xs text-rose-900">
              <strong className="block text-sm">Verifikasi profil ditolak</strong>
              <p className="mt-1">{backendProfile?.rejectionReason || "Unggah ulang dokumen yang diminta untuk mengajukan verifikasi kembali."}</p>
            </div>
          </div>
        )}

        {loadError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-rf-md flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-rose-900 block text-sm">
                Data Profil Tidak Dapat Dimuat
              </span>
              <p className="text-rose-800 mt-0.5">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadData()}
                className="mt-2 font-semibold text-rose-900 underline"
              >
                Coba lagi
              </button>
            </div>
          </div>
        )}

        {!existingVehicle && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-rf-md flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rf-blue shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-blue-950 block text-sm">
                Pendaftaran Kendaraan Diperlukan
              </span>
              <p className="text-blue-900 mt-0.5">
                Anda belum memiliki armada yang terdaftar. Lengkapi formulir kendaraan di bawah untuk mengajukan verifikasi armada kendaraan.
              </p>
            </div>
          </div>
        )}

        {existingVehicle && existingVehicle.verificationStatus === "pending" && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-rf-md flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-amber-900 block text-sm">
                Kendaraan Menunggu Verifikasi
              </span>
              <p className="text-amber-800 mt-0.5">
                Armada kendaraan Anda ({existingVehicle.make} {existingVehicle.model} - {existingVehicle.vehiclePlate}) sedang dalam antrean verifikasi admin. Data masih dapat diperbarui sebelum diverifikasi.
              </p>
            </div>
          </div>
        )}

        {existingVehicle && existingVehicle.verificationStatus === "rejected" && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-rf-md flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-rose-900 block text-sm">
                Kendaraan Ditolak
              </span>
              <p className="text-rose-800 mt-0.5">
                {existingVehicle.rejectionReason || "Perbaiki data kendaraan yang ditolak."} Perbarui data di bawah lalu simpan untuk mengajukan verifikasi ulang.
              </p>
            </div>
          </div>
        )}

        {existingVehicle && existingVehicle.verificationStatus === "verified" && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-rf-md flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-emerald-950 block text-sm">
                Kendaraan Telah Terverifikasi
              </span>
              <p className="text-emerald-800 mt-0.5">
                Armada kendaraan Anda ({existingVehicle.make} {existingVehicle.model} - {existingVehicle.vehiclePlate}) telah terverifikasi resmi oleh admin. Status keaktifan:{" "}
                <strong>{existingVehicle.isActive ? "Aktif" : "Tidak Aktif"}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Profile Card Header */}
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
            <div className="w-16 h-16 rounded-full bg-slate-100 border-2 border-amber-500 overflow-hidden shadow-tactile-btn flex items-center justify-center shrink-0">
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

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-rf-text truncate">{user?.name}</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  Mitra {isMotor ? "Motor" : "Mobil"}
                </span>
                {driverStatus === "pending" && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    Akun: Pending
                  </span>
                )}
                {driverStatus === "active" && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Akun: Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{user?.email}</p>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 mt-1">
                <div className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{driverProfile?.rating ?? 5.0}</span>
                </div>
                <span>•</span>
                <span>{driverProfile?.completedTrips ?? 0} perjalanan selesai</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="pt-6 space-y-5">
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                Informasi Pengemudi
              </h3>
              <div className="space-y-4">
                <InsetInput
                  label="Nama Lengkap Pengemudi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  leftIcon={<User className="w-4 h-4" />}
                  placeholder="Contoh: Budi Santoso"
                  required
                />

                <InsetInput
                  label="Nomor Telepon Kontak"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  leftIcon={<Phone className="w-4 h-4" />}
                  placeholder="Contoh: 08123456789 atau +628123456789"
                  helperText="Format nomor telepon Indonesia (+62 atau 08...)"
                  required
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Data Armada Kendaraan
                </h3>
                {existingVehicle && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      existingVehicle.verificationStatus === "verified"
                        ? "bg-emerald-100 text-emerald-800"
                        : existingVehicle.verificationStatus === "rejected"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    Status: {existingVehicle.verificationStatus.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Vehicle Type Selector */}
              <div className="space-y-1.5 mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-rf-text-secondary">
                  Jenis Kendaraan
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={!isVehicleEditable || isLoadingData || Boolean(loadError)}
                    onClick={() => setVehicleType("MOTOR")}
                    className={`flex items-center justify-center gap-2 h-11 px-4 rounded-rf border text-sm font-bold transition-all ${
                      vehicleType === "MOTOR"
                        ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    } ${!isVehicleEditable ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <Bike className="w-4 h-4" />
                    <span>Sepeda Motor</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isVehicleEditable || isLoadingData || Boolean(loadError)}
                    onClick={() => setVehicleType("MOBIL")}
                    className={`flex items-center justify-center gap-2 h-11 px-4 rounded-rf border text-sm font-bold transition-all ${
                      vehicleType === "MOBIL"
                        ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    } ${!isVehicleEditable ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <Car className="w-4 h-4" />
                    <span>Mobil Penumpang</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InsetInput
                  label="Nomor Plat Kendaraan"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                  leftIcon={<FileText className="w-4 h-4" />}
                  placeholder="Contoh: DK 1234 AB"
                  disabled={!isVehicleEditable || isLoadingData || Boolean(loadError)}
                  required
                />

                <InsetInput
                  label="Merek Kendaraan (Make)"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  leftIcon={<Wrench className="w-4 h-4" />}
                  placeholder="Contoh: Honda / Toyota"
                  disabled={!isVehicleEditable || isLoadingData || Boolean(loadError)}
                  required
                />

                <InsetInput
                  label="Model / Seri Kendaraan"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  leftIcon={isMotor ? <Bike className="w-4 h-4" /> : <Car className="w-4 h-4" />}
                  placeholder="Contoh: Vario 160 / Avanza"
                  disabled={!isVehicleEditable || isLoadingData || Boolean(loadError)}
                  required
                />

                <InsetInput
                  label="Warna Kendaraan"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  leftIcon={<Palette className="w-4 h-4" />}
                  placeholder="Contoh: Hitam Metalik"
                  disabled={!isVehicleEditable || isLoadingData || Boolean(loadError)}
                  required
                />
              </div>

              {existingVehicle && !isVehicleEditable && (
                <p className="text-[11px] text-slate-500 mt-2 italic">
                  * Kendaraan yang telah terverifikasi tidak dapat diubah langsung. Hubungi admin untuk memperbarui data kendaraan.
                </p>
              )}
            </div>

            {/* Informasi Sistem Pengemudi Dinamis */}
            <div className="p-3.5 bg-slate-50 rounded-rf border border-slate-200 text-xs text-slate-600">
              <span className="font-bold text-slate-700 block mb-2">
                Informasi Sistem Pengemudi
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400">Status Akun:</span>{" "}
                  <strong className={driverStatus === "active" ? "text-emerald-700" : "text-amber-700"}>
                    {driverStatus === "active" ? "Aktif" : driverStatus === "suspended" ? "Ditangguhkan" : "Menunggu Persetujuan (Pending)"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Verifikasi profil:</span>{" "}
                  <strong className={profileVerificationStatus === "approved" ? "text-emerald-700" : profileVerificationStatus === "rejected" ? "text-rose-700" : "text-amber-700"}>
                    {profileVerificationStatus === "approved" ? "Disetujui" : profileVerificationStatus === "rejected" ? "Ditolak" : "Menunggu"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Verifikasi Kendaraan:</span>{" "}
                  <strong className={isVehicleVerified ? "text-emerald-700" : vehicleStatus === "rejected" ? "text-rose-700" : "text-amber-700"}>
                    {vehicleStatus === "verified"
                      ? "Terverifikasi"
                      : vehicleStatus === "rejected"
                      ? "Ditolak"
                      : vehicleStatus === "pending"
                      ? "Menunggu Verifikasi"
                      : "Belum Didaftarkan"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Kendaraan Aktif:</span>{" "}
                  <strong>{existingVehicle?.isActive ? "Ya" : "Tidak"}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Wilayah Operasi:</span>{" "}
                  <strong>Denpasar & Sanur</strong>
                </div>
              </div>
            </div>

            <section className="space-y-3 border-t border-slate-100 pt-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Dokumen verifikasi</h3>
                <p className="mt-1 text-[11px] text-slate-500">Format PDF/JPG/PNG, maksimal 10 MB. Unggah file baru untuk mengganti dokumen yang ditolak.</p>
              </div>
              {DOC_TYPES.map(({ type, label, vehicleScoped }) => {
                const document = latestDocument(type);
                const disabled = isLoadingData || Boolean(loadError) || uploadingType !== null || (vehicleScoped && !existingVehicle);
                return (
                  <div key={type} className="rounded-rf border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-rf-navy">{label}</p>
                        <p className="text-xs text-slate-500">
                          {document ? `Versi ${document.version} · ${document.status}` : "Belum diunggah"}
                          {document?.rejectionReason ? ` · Alasan: ${document.rejectionReason}` : ""}
                        </p>
                      </div>
                      <label className={`cursor-pointer rounded border border-rf-blue px-3 py-2 text-xs font-bold text-rf-blue ${disabled ? "pointer-events-none opacity-50" : ""}`}>
                        {uploadingType === type ? "Mengunggah..." : document ? "Unggah ulang" : "Pilih file"}
                        <input
                          type="file"
                          className="sr-only"
                          accept={type === "vehicle_photo" ? "image/jpeg,image/png,.jpg,.jpeg,.png" : "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"}
                          disabled={disabled}
                          onChange={(event) => {
                            void uploadDocument(type, event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
              {existingVehicle?.verificationStatus === "verified" && !existingVehicle.isActive && (
                <TactileButton
                  type="button"
                  size="sm"
                  disabled={isLoadingData || Boolean(loadError)}
                  onClick={async () => {
                    try {
                      await driverApi.setVehicleActive(existingVehicle.id, true);
                      await loadData();
                      showToast("Kendaraan aktif. Status online dapat diaktifkan jika seluruh verifikasi disetujui.", "success");
                    } catch (error) {
                      showToast(error instanceof Error ? error.message : "Kendaraan gagal diaktifkan.", "error");
                    }
                  }}
                >
                  Aktifkan kendaraan terverifikasi
                </TactileButton>
              )}
            </section>

            <div className="pt-4 flex items-center justify-between">
              <TactileButton
                type="submit"
                size="md"
                disabled={isLoadingData || Boolean(loadError)}
                isLoading={isSaving}
                icon={<Save className="w-4 h-4" />}
              >
                Simpan Profil
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

const DOC_TYPES: {
  type: DriverDocument["type"];
  label: string;
  vehicleScoped: boolean;
}[] = [
  { type: "ktp", label: "KTP", vehicleScoped: false },
  { type: "sim", label: "SIM", vehicleScoped: false },
  { type: "stnk", label: "STNK", vehicleScoped: true },
  { type: "vehicle_photo", label: "Foto kendaraan", vehicleScoped: true },
];

function documentLabel(type: DriverDocument["type"]): string {
  return DOC_TYPES.find((document) => document.type === type)?.label || type;
}
