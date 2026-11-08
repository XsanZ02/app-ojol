# RideFlow — Modern Skeuomorphic Ride-Hailing Web Application

A ride-hailing web prototype designed with **Modern Skeuomorphism**: tactile raised cards, subtle physical depth, realistic pressed button states, inset form surfaces, smooth rounded corners (14–18px), and responsive mobile/desktop layouts.

The application serves two distinct user roles:
- **Penumpang (Customer)**
- **Mitra Pengemudi (Driver)**

Built with **Next.js (App Router)**, **React**, **TypeScript**, and **Tailwind CSS**. Authentication, customer trips, driver availability, profile/vehicle reads, orders, and driver statistics use the **Java Quarkus REST API** and **PostgreSQL**. Customer profile editing remains prototype-backed.

---

## Panduan Menjalankan Frontend dan Backend (Windows)

Jalankan frontend dan backend di **dua jendela PowerShell terpisah**. Untuk
fitur login dan pemesanan, backend serta database PostgreSQL harus aktif.

### Prasyarat

- Node.js 18 atau lebih baru dan npm.
- JDK 21 atau lebih baru (`java -version` dan `javac -version`).
- PostgreSQL aktif di port `5432`, dengan database demo `rideflow_v4_test` dan
  user `rideflow` yang sudah dikonfigurasi. Database utama `rideflow` bukan
  target demo ini.
- Skema database yang diperlukan sudah tersedia. Backend tidak menjalankan
  migrasi Flyway otomatis; baca bagian database di
  [backend/README.md](./backend/README.md) sebelum menyiapkan database.

### 1. Siapkan dan jalankan backend

Buka PowerShell pertama:

```powershell
cd "C:\PUNYA AGAS\app-ojol\backend"
```

Buat kunci JWT development **satu kali saja**. Perintah ini menyimpan kunci di
folder profil pengguna, bukan di repository:

```powershell
$keys = Join-Path $env:USERPROFILE "rideflow-dev-keys"
$classes = Join-Path $env:TEMP "rideflow-keygen"
New-Item -ItemType Directory -Force -Path $keys, $classes | Out-Null
javac -d $classes .\GenerateRideFlowKeys.java
if ($LASTEXITCODE -ne 0) { throw "Gagal mengompilasi pembuat kunci JWT." }
java -cp $classes GenerateRideFlowKeys $keys
```

Atur password PostgreSQL dan lokasi kunci, lalu mulai Quarkus:

```powershell
$env:DB_HOST = 'localhost'
$env:DB_PORT = '5432'
$env:DB_NAME = 'rideflow_v4_test'
$env:DB_USERNAME = 'rideflow'
$env:DB_PASSWORD = 'password PostgreSQL untuk user rideflow'
$env:JWT_PRIVATE_KEY_LOCATION = Join-Path $env:USERPROFILE "rideflow-dev-keys\private.pem"
$env:JWT_PUBLIC_KEY = Get-Content -Raw (Join-Path $env:USERPROFILE "rideflow-dev-keys\public.pem")
.\mvnw.cmd quarkus:dev
```

Konfigurasi di atas memilih database demo `rideflow_v4_test`; ganti password
dengan password lokal Anda. Tanpa `DB_NAME`, backend menggunakan default
`rideflow`, yang mungkin memiliki versi schema berbeda. Biarkan jendela ini tetap
terbuka. Backend berjalan di `http://localhost:8080`; Dev UI ada di
`http://localhost:8080/q/dev/`. Hentikan dengan `Ctrl+C`. Jangan commit
password atau kunci dan jangan gunakan kunci development untuk produksi.

### 2. Siapkan dan jalankan frontend

Buka PowerShell kedua dari folder proyek:

```powershell
cd "C:\PUNYA AGAS\app-ojol"
npm install
```

Buat `.env.local` dari contoh jika file itu belum ada:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Pastikan `.env.local` berisi URL backend berikut:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Jangan isi secret, private key, atau password database pada variabel
`NEXT_PUBLIC_*`. Jalankan frontend:

```powershell
npm run dev
```

Buka `http://localhost:3000`. Pertahankan kedua jendela PowerShell tetap
berjalan selama aplikasi digunakan. CORS backend mengizinkan origin ini secara
default.

### Perintah frontend lainnya

```powershell
npm run lint
npm test
npm run build
npm start
```

`npm start` menjalankan hasil build produksi, jadi jalankan `npm run build`
terlebih dahulu. Autentikasi menggunakan akun yang terdaftar di backend.
Pengaturan database, JWT, routing, dan tarif backend dijelaskan lebih lengkap
di [backend/README.md](./backend/README.md).

---

## 🎨 Karakteristik Desain: Modern Skeuomorphism

- **Palet Warna Transportasi Premium**:
  - Primary Navy: `#14213D`
  - Primary Blue: `#2563EB`
  - Background: `#F3F6FA`
  - Surface: `#FFFFFF`
  - Text Primary: `#172033`
  - Secondary Text: `#64748B`
  - Status Success: `#16A34A`, Warning: `#F59E0B`, Danger: `#DC2626`
- **Kedalaman Taktil (Tactile Depth)**:
  - Tombol dengan bevel halus, highlight atas (`inset 0 1px 0 rgba(255,255,255,0.3)`), dan depresi saat ditekan (`active:translate-y-px`).
  - Permukaan inset (`tactile-inset-input`) untuk kontrol formulir.
  - Sakelar fisik taktil (`AvailabilityToggle`) untuk status online/offline pengemudi.
  - Kartu sedikit terangkat dengan bayangan lembut dan sudut membulat 14–18px.
  - Format mata uang Rupiah Indonesia (`Rp25.000`) dan copywriting bahasa Indonesia yang alami.
  - Peta Leaflet/OpenStreetMap dengan titik lokasi dan geometri rute dari Valhalla.

---

## 📱 Desain Responsif (Desktop & Mobile)

- **Desktop (1440 × 1024)**:
  - Sidebar navigasi tetap di sebelah kiri (`AppSidebar`).
  - Header dengan logo, indikator peran dari backend, dan menu profil.
  - Layout 2 kolom yang seimbang: formulir di sisi kiri, peta interaktif di sisi kanan.
- **Mobile (390 × 844)**:
  - Header ringkas dengan logo dan indikator role akun.
  - Navigasi bawah taktil (`MobileBottomNavigation`) dengan target sentuh ≥ 48px.
  - Kartu selebar layar, form tersusun vertikal tanpa horizontal overflow.

---

## 🔄 Alur Kerja End-to-End yang Diimplementasikan

1. **Autentikasi & Registrasi**:
   - Login dan registrasi melalui Quarkus, validasi sesi lewat `/auth/me`.
   - Role navigasi berasal dari identitas backend; pilihan role saat registrasi hanya meminta role akun.
2. **Pemesanan Perjalanan (Customer)**:
   - Dashboard dengan hero "Mau ke mana hari ini?".
   - Pilihan rute preset Denpasar/Sanur.
   - Layar konfirmasi pesanan meminta estimasi rute Motor/Mobil dari `POST /routes/estimate`.
   - Valhalla menghitung rute jalan; backend menentukan tarif dan menghitung ulang saat `POST /trips`.
   - Route distance, durasi, geometri, provider, dan snapshot tarif disimpan bersama order.
3. **Penerimaan Pesanan (Driver)**:
   - Dashboard mitra dengan sakelar online/offline fisik dan ringkasan pendapatan.
   - Radar pesanan masuk (`/drivers/me/orders`) menampilkan pesanan yang sesuai dengan status online, verifikasi, dokumen, dan kendaraan driver.
   - Pengemudi menerima pesanan melalui backend (`PENDING` → `ACCEPTED`).
4. **Progresi Status Perjalanan**:
   - `ACCEPTED` → `PICKING_UP` (Pengemudi menuju titik jemput).
   - `PICKING_UP` → `IN_PROGRESS` (Penumpang naik, perjalanan dimulai).
   - `IN_PROGRESS` → `COMPLETED` melalui endpoint backend; status dan riwayat transisi tersimpan di PostgreSQL.
5. **Visibilitas Real-time**:
   - Layar penumpang (`/customer/trips/[id]`) mengambil status terbaru dari API saat halaman dibuka; pembaruan push/polling otomatis belum tersedia.
   - Pembatalan pesanan hanya diizinkan pada saat status `PENDING` dengan konfirmasi modal.
6. **Riwayat & Profil**:
   - Riwayat dan status perjalanan berasal dari API. Perubahan profil pelanggan masih lokal/prototype; profil driver dan kendaraan tersimpan di backend.

---

## 🔐 Integrasi autentikasi Quarkus

Backend menyediakan:

- `POST /auth/register`: `{ name, email, password, role, phone? }`
- `POST /auth/login`: `{ email, password, rememberMe? }`
- `GET /auth/me`: bearer JWT pada header `Authorization`

Respons login/register dan `/auth/me` berbentuk `{ user, token }`. Backend
mengembalikan role aktual pada `user.role` (`CUSTOMER` atau `DRIVER`) dan
`user.roles`; frontend hanya menerima sesi setelah memverifikasi token melalui
`/auth/me`. Password pendaftaran harus 12–72 byte UTF-8. Registrasi kendaraan
belum didukung oleh endpoint autentikasi; data kendaraan yang tampil pada
formulir pengemudi tidak dikirim/disimpan oleh alur ini.

Backend saat ini tidak mengatur cookie `HttpOnly`, endpoint logout, refresh
token, atau pencabutan JWT. Untuk pemulihan sesi di tab yang sama, frontend
menyimpan access token sementara di `sessionStorage` jika “Ingat saya” dipilih;
tanpa pilihan itu token hanya berada di memori. `sessionStorage` masih dapat
dibaca oleh JavaScript dan karenanya tetap berisiko terhadap XSS; ini bukan
pengganti cookie `HttpOnly`. Flag `rememberMe` backend tidak memperpanjang masa
berlaku token. Logout menghapus token dan state lokal, tetapi tidak mencabut
JWT yang sudah diterbitkan (masa berlaku default 900 detik).

Data booking, status online, profil driver, kendaraan, dokumen, verifikasi,
dan alur perjalanan menggunakan API Quarkus. Profil pelanggan dan beberapa
data presentasi tetap prototype-backed; mock storage tidak menjadi sumber
kebenaran untuk eligibility maupun status perjalanan.

## 🏛️ Struktur Frontend

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── customer/
│   │   ├── dashboard/page.tsx
│   │   ├── bookings/new/page.tsx
│   │   ├── trips/page.tsx
│   │   ├── trips/[id]/page.tsx
│   │   └── profile/page.tsx
│   ├── driver/
│   │   ├── dashboard/page.tsx
│   │   ├── orders/page.tsx
│   │   ├── orders/[id]/page.tsx
│   │   ├── trips/active/page.tsx
│   │   ├── trips/page.tsx
│   │   └── profile/page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── booking/       (IllustrativeMap, BookingCard)
│   ├── layout/        (AppLayout shell)
│   ├── navigation/    (AppHeader, AppSidebar, MobileBottomNavigation)
│   ├── trip/          (TripTimeline)
│   └── ui/            (TactileButton, SurfaceCard, InsetInput, StatusBadge, AvailabilityToggle, ConfirmDialog, EmptyState, ToastNotification, LoadingSkeleton)
├── lib/
│   ├── auth-api.ts     (Client autentikasi Quarkus dan verifikasi /auth/me)
│   ├── api.ts          (Client API trip, driver, dan profil)
│   ├── auth-context.tsx(React Context untuk sesi dan autentikasi)
│   ├── api.ts         (API estimasi rute, perjalanan, dan akun)
│   ├── mock-data.ts    (Data rute Bali, driver, dan penumpang)
│   ├── mock-storage.ts (State persistence non-sensitif & reactive listener)
│   └── utils.ts        (Format IDR, format tanggal Indonesia, class merge)
└── types/
    ├── auth.ts
    ├── booking.ts
    ├── driver.ts
    └── user.ts
```
