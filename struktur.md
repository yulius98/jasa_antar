# Struktur Folder Backend — Aplikasi Jasa Angkut (Nest.js)

Dokumen ini jadi panduan struktur folder untuk migrasi backend dari Express.js ke Nest.js + Prisma 7. Sembilan modul mengikuti domain yang sudah ada di versi Express: auth, partners, vehicles, pricing, orders, tracking, ratings, payments, admin.

**Status saat ini:** `auth`, `partners`, `vehicles`, dan infrastruktur pendukung (`prisma`, `storage`) sudah dibangun dan lolos tes manual. Modul lain (ditandai 🔜) masih rencana.

```
Backend/
├── generated/                       # DIHAPUS — lokasi lama, sudah dipindah ke src/generated
│
├── prisma/
│   ├── schema.prisma                 # Definisi 18 model (lihat rincian di bawah)
│   └── migrations/
│       └── <timestamp>_init/
│           └── migration.sql
│
├── src/
│   ├── generated/
│   │   └── prisma/                   # Output prisma generate — JANGAN diedit manual, JANGAN di-commit
│   │       ├── client.ts
│   │       └── enums.ts
│   │
│   ├── common/                       # Tipe & util lintas modul
│   │   └── auth-user.ts              # Bentuk request.user setelah lolos JwtStrategy
│   │
│   ├── prisma/                       # Koneksi database, dipakai semua modul
│   │   ├── prisma.module.ts          # @Global — cukup diimpor sekali di app.module.ts
│   │   └── prisma.service.ts         # Wrapper PrismaClient + adapter-pg, lifecycle connect/disconnect
│   │
│   ├── storage/                      # Abstraksi penyimpanan file (disk lokal → nanti S3/R2)
│   │   ├── storage.module.ts         # @Global
│   │   ├── storage.service.ts        # save/remove/open — validasi file dari magic bytes, cegah path traversal
│   │   └── upload.config.ts          # Batas ukuran & jumlah file upload
│   │
│   ├── auth/                         # ✅ Register, login, refresh token, JWT guard
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts        # POST register/login/refresh/logout, GET me
│   │   ├── auth.service.ts           # bcrypt hash, token issue & rotation
│   │   ├── dto/
│   │   │   ├── register.dto.ts
│   │   │   ├── login.dto.ts
│   │   │   └── refresh-token.dto.ts
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts       # Verifikasi token + cek isActive ke DB
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts     # "Siapa kamu?"
│   │   │   └── roles.guard.ts        # "Boleh masuk atau tidak?"
│   │   └── decorators/
│   │       ├── roles.decorator.ts    # @Roles(UserRole.ADMIN)
│   │       └── current-user.decorator.ts  # @CurrentUser()
│   │
│   ├── partners/                     # ✅ Onboarding & verifikasi driver
│   │   ├── partners.module.ts
│   │   ├── partners.controller.ts    # apply, me, online, list/detail (admin), approve/reject/suspend, documents
│   │   ├── partners.service.ts
│   │   ├── partner-document-type.ts  # enum ktp | sim
│   │   └── dto/
│   │       ├── apply-partner.dto.ts
│   │       ├── partner-reason.dto.ts # dipakai reject & suspend
│   │       ├── set-online.dto.ts
│   │       └── list-partners.query.ts
│   │
│   ├── vehicles/                     # ✅ Data kendaraan partner
│   │   ├── vehicles.module.ts
│   │   ├── vehicles.controller.ts    # create, list mine, deactivate, files
│   │   ├── vehicles.service.ts
│   │   ├── vehicle-file-kind.ts      # enum stnk | photo
│   │   └── dto/
│   │       └── create-vehicle.dto.ts
│   │
│   ├── pricing/                      # 🔜 Estimasi harga & promo
│   │   ├── pricing.module.ts
│   │   ├── pricing.controller.ts     # POST estimate, CRUD zona & promo (admin)
│   │   ├── pricing.service.ts
│   │   ├── strategies/
│   │   │   └── haversine.strategy.ts # Hitung jarak dari koordinat pickup-dropoff
│   │   └── dto/
│   │       ├── estimate-price.dto.ts
│   │       └── apply-promo.dto.ts
│   │
│   ├── orders/                       # 🔜 Inti booking & lifecycle order — modul paling kompleks
│   │   ├── orders.module.ts
│   │   ├── orders.controller.ts
│   │   ├── orders.service.ts
│   │   ├── orders.gateway.ts         # WebSocket — update status order real-time
│   │   └── dto/
│   │       ├── create-order.dto.ts
│   │       ├── negotiate-price.dto.ts
│   │       └── update-order-status.dto.ts
│   │
│   ├── tracking/                     # 🔜 Lokasi live partner selama order berjalan
│   │   ├── tracking.module.ts
│   │   ├── tracking.gateway.ts       # WebSocket — terima update posisi dari app partner
│   │   └── tracking.service.ts       # Simpan TrackingPoint, ambil histori per order
│   │
│   ├── ratings/                      # 🔜 Rating & review setelah order selesai
│   │   ├── ratings.module.ts
│   │   ├── ratings.controller.ts
│   │   ├── ratings.service.ts
│   │   └── dto/
│   │       └── create-rating.dto.ts
│   │
│   ├── payments/                     # 🔜 Integrasi payment gateway + komisi
│   │   ├── payments.module.ts
│   │   ├── payments.controller.ts
│   │   ├── payments.service.ts
│   │   ├── commission.service.ts     # Hitung komisi otomatis saat order selesai
│   │   └── webhooks/
│   │       └── midtrans.webhook.controller.ts  # Endpoint publik, TANPA JwtAuthGuard
│   │
│   ├── admin/                        # 🔜 Endpoint khusus admin lintas modul
│   │   ├── admin.module.ts
│   │   ├── admin.controller.ts       # Dashboard summary, manajemen dispute
│   │   └── admin.service.ts
│   │
│   ├── notifications/                # 🔜 Push notification (belum ada di versi Express)
│   │   ├── notifications.module.ts
│   │   └── notifications.service.ts
│   │
│   ├── app.module.ts                 # Daftar semua module di atas masuk sini
│   ├── app.controller.ts
│   ├── app.service.ts
│   └── main.ts                       # Bootstrap + ValidationPipe global
│
├── test/                             # E2E test (vitest)
├── uploads/                          # Foto KTP/SIM/STNK — JANGAN di-commit
├── .env                              # DATABASE_URL, JWT_SECRET, dst — JANGAN di-commit
├── .gitignore
├── prisma7.config.ts                 # Config CLI Prisma: schema path, migrations path, datasource url
├── nest-cli.json
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── tsconfig.build.json
```

## Aturan yang berlaku di semua modul

1. **Semua import relatif pakai ekstensi `.js` eksplisit** (`'./auth.service.js'`, bukan `'./auth.service'`), karena `tsconfig` memakai `moduleResolution: nodenext`. Ini termasuk import dari `src/generated/prisma/`.
2. **Satu domain = satu folder.** Kalau butuh DTO, taruh di subfolder `dto/` domain itu — jangan bikin folder `dto/` global di root `src/`.
3. **`PrismaModule` dan `StorageModule` bersifat `@Global()`.** Cukup diimpor sekali di `app.module.ts`, lalu `PrismaService` dan `StorageService` bisa langsung di-inject di modul mana pun tanpa impor ulang.
4. **Guard urutannya tetap:** `@UseGuards(JwtAuthGuard, RolesGuard)` — `JwtAuthGuard` dulu, karena `RolesGuard` bergantung pada `request.user` yang diisi `JwtAuthGuard`.
5. **Field sensitif (foto dokumen, password hash) tidak pernah keluar di response biasa.** Query Prisma pakai `omit` untuk field itu; akses file lewat endpoint khusus yang mengecek kepemilikan/role, bukan folder static.
6. **Webhook payment gateway (`payments/webhooks/`) tidak pakai `JwtAuthGuard`**, karena dipanggil server Midtrans/Xendit, bukan user login. Verifikasi keasliannya pakai signature dari provider, bukan JWT.

## 18 model di `schema.prisma`, per domain

| Domain | Model |
|---|---|
| Auth/Users | User, RefreshToken, CustomerProfile, CustomerAddress, AdminProfile |
| Partners/Vehicles | Partner, Vehicle |
| Pricing | PricingZone, PromoCode |
| Orders | Order, OrderStatusHistory |
| Tracking | TrackingPoint |
| Ratings | Rating |
| Payments | Payment, Payout |
| Admin | Dispute |

## Urutan pembangunan modul yang disarankan

```
✅ auth        → fondasi login & role, semua modul lain bergantung ini
✅ partners    → butuh auth (role CUSTOMER → PARTNER)
✅ vehicles    → butuh partners
🔜 pricing     → berdiri sendiri, tidak bergantung modul lain
🔜 orders      → butuh partners, vehicles, DAN pricing (dipanggil saat create order)
🔜 tracking    → butuh orders (order harus ada dulu sebelum ada titik tracking)
🔜 ratings     → butuh orders (rating dikaitkan ke satu order yang selesai)
🔜 payments    → butuh orders
🔜 admin       → mengonsumsi data dari semua modul di atas, dibangun terakhir
🔜 notifications → bisa disisipkan kapan saja, tidak bergantung modul lain
```
