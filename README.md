# RideFlow — Modern Skeuomorphic Ride-Hailing Web Application

A ride-hailing web prototype designed with **Modern Skeuomorphism**: tactile raised cards, subtle physical depth, realistic pressed button states, inset form surfaces, smooth rounded corners (14–18px), and responsive mobile/desktop layouts.

The application serves two distinct user roles:
- **Penumpang (Customer)**
- **Mitra Pengemudi (Driver)**

Built with **Next.js (App Router)**, **React**, **TypeScript**, and **Tailwind CSS**. Authentication, customer trips, driver availability, profile/vehicle reads, orders, and driver statistics use the **Java Quarkus REST API** and **PostgreSQL**. Customer profile editing remains prototype-backed.

---

## 🚀 Panduan Menjalankan Aplikasi

### 1. Prasyarat
- Node.js v18+ atau v20+ (diuji pada v24.13.1)
- NPM atau PNPM
- Untuk autentikasi: backend Quarkus aktif dan PostgreSQL yang dikonfigurasi untuk backend

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi API dan jalankan frontend
Salin `.env.example` ke `.env.local` dan pastikan URL menunjuk ke backend Quarkus:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Variabel ini hanya berisi URL publik; jangan menaruh secret, private key, atau
kredensial database pada variabel `NEXT_PUBLIC_*`.

```bash
npm run dev
```
Akses aplikasi melalui browser di: **[http://localhost:3000](http://localhost:3000)**

### 4. Jalankan backend
Ikuti [prasyarat database dan JWT backend](./backend/README.md#prerequisites).
Dari PowerShell pada direktori `backend`, atur `DB_PASSWORD`,
`JWT_PRIVATE_KEY_LOCATION`, dan `JWT_PUBLIC_KEY_LOCATION`, lalu jalankan:

```powershell
.\mvnw.cmd quarkus:dev
```

Backend mendengarkan pada `http://localhost:8080`. CORS dibatasi ke
`RIDEFLOW_FRONTEND_ORIGIN` yang default-nya `http://localhost:3000`; untuk
deployment, atur variabel itu ke satu origin frontend yang tepat. Credentials
CORS tidak diaktifkan karena autentikasi memakai bearer token.
Database harus sudah memiliki skema yang telah disetujui; petunjuk ini tidak
menjalankan migrasi development.

### 5. Build dan tes frontend
```bash
npm run lint
npm run test:auth
npm run build
npm start
```

Autentikasi memakai akun yang terdaftar pada backend, bukan akun demo lokal.
Tes frontend memakai Node.js test runner dan mock HTTP responses; ia tidak
membutuhkan backend aktif.

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
  - Peta ilustratif CSS/SVG dengan rute nyata kawasan Denpasar, Panjer, Renon, dan Sanur, Bali.

---

## 📱 Desain Responsif (Desktop & Mobile)

- **Desktop (1440 × 1024)**:
  - Sidebar navigasi tetap di sebelah kiri (`AppSidebar`).
  - Header dengan logo, indikator peran dari backend, dan menu profil.
  - Layout 2 kolom yang seimbang: formulir di sisi kiri, peta ilustratif di sisi kanan.
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
   - Layar konfirmasi pesanan dengan kalkulasi estimasi tarif Motor vs Mobil (`FareService`).
   - Pesanan disimpan lewat `POST /trips`; backend menghitung tarif dan mengembalikan status `PENDING`.
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
│   ├── fare-service.ts (Kalkulator tarif dan jarak Haversine)
│   ├── mock-data.ts    (Data rute Bali, driver, dan penumpang)
│   ├── mock-storage.ts (State persistence non-sensitif & reactive listener)
│   └── utils.ts        (Format IDR, format tanggal Indonesia, class merge)
└── types/
    ├── auth.ts
    ├── booking.ts
    ├── driver.ts
    └── user.ts
```
