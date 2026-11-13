# LEMOON KAFE POS — Kapsamlı Proje Özeti, Kullanım Haritası ve Temizlik Raporu

**Proje Adı:** LEMOON KAFE POS (`eco-coffee-pos`)  
**Sürüm:** v1.6.0  
**Rapor Tarihi:** 13 Kasım 2026  
**Platform / Hedef:** Windows POS Dokunmatik Terminalleri & Masaüstü (Electron) / Modern Web  
**Uygulama Tipi:** Çevrimdışı Öncelikli (Offline-First) Kafe & Restoran Kasa, Masa ve Adisyon Otomasyon Sistemi

---

## İçindekiler
1. [Projenin Amacı ve Güncel Mimari Durumu](#1-projenin-amacı-ve-güncel-mimari-durumu)
2. [Teknoloji Yığını ve Paket Bağımlılıkları](#2-teknoloji-yığını-ve-paket-bağımlılıkları)
3. [Sistem Mimarisi ve Veri Otoritesi (Source of Truth)](#3-sistem-mimarisi-ve-veri-otoritesi-source-of-truth)
4. [Proje Dizin Yapısı ve Disk Kullanımı](#4-proje-dizin-yapısı-ve-disk-kullanımı)
5. [Modüller ve "Nerede Ne Kullanıldı?" Haritası](#5-modüller-ve-nerede-ne-kullanıldı-haritası)
   - [5.1. Electron Ana Süreç, Güvenlik ve Donanım Katmanı](#51-electron-ana-süreç-güvenlik-ve-donanım-katmanı)
   - [5.2. Yerel SQLite Veritabanı ve Kalıcılık Katmanı](#52-yerel-sqlite-veritabanı-ve-kalıcılık-katmanı)
   - [5.3. Yedekleme, Çökme Kurtarma ve Dosya Loglama](#53-yedekleme-çökme-kurtarma-ve-dosya-loglama)
   - [5.4. Masa, Sipariş, Ödeme, İade ve Gün Sonu (Z Raporu)](#54-masa-sipariş-ödeme-iade-ve-gün-sonu-z-raporu)
   - [5.5. Kimlik Doğrulama, PIN, Granüler İzinler ve Hash Zincirli Loglar](#55-kimlik-doğrulama-pin-granüler-izinler-ve-hash-zincirli-loglar)
   - [5.6. Müşteri İkinci Ekranı, Yazdırma (PrintPortal) ve Dokunmatik Optimizasyon](#56-müşteri-ikinci-ekranı-yazdırma-printportal-ve-dokunmatik-optimizasyon)
   - [5.7. Test Altyapısı ve CI/CD](#57-test-altyapısı-ve-cicd)
6. [Kullanılmayan, Ölü ve Arka Planda Boş Yer Kaplayan Öğeler (Denetim Bulguları)](#6-kullanılmayan-ölü-ve-arka-planda-boş-yer-kaplayan-öğeler-denetim-bulguları)
   - [6.1. Diskte / Depoda Yer Kaplayan Gereksiz veya Kalıntı Klasör & Dosyalar](#61-diskte--depoda-yer-kaplayan-gereksiz-veya-kalıntı-klasör--dosyalar)
   - [6.2. Yinelenen (Duplicate) İkon Klasörü](#62-yinelenen-duplicate-i̇kon-klasörü)
   - [6.3. Kod Tabanında Kullanılmayan (Ölü) UI Bileşenleri](#63-kod-tabanında-kullanılmayan-ölü-ui-bileşenleri)
   - [6.4. Yarım Bağlı Modüller ve Eski FastAPI (`localhost:8000`) Kalıntıları](#64-yarım-bağlı-modüller-ve-eski-fastapi-localhost8000-kalıntıları)
   - [6.5. Kullanılmayan Export Edilmiş Fonksiyonlar ve Sabitler](#65-kullanılmayan-export-edilmiş-fonksiyonlar-ve-sabitler)
   - [6.6. Eski Backend Paket Bağımlılığı](#66-eski-backend-paket-bağımlılığı)
7. [Önerilen Sonraki İyileştirme Eylem Planı](#7-önerilen-sonraki-i̇yileştirme-eylem-planı)

---

## 1. Projenin Amacı ve Güncel Mimari Durumu

**LEMOON KAFE POS**, kafe ve restoran işletmelerinin yoğun kasa ve servis trafiğini internet bağlantısına ihtiyaç duymadan yönetmek üzere geliştirilmiş, dokunmatik ekran ve Windows POS terminallerine uyarlanmış masaüstü/web otomasyon sistemidir.

### Temel Yetenekler:
- **Tam Çevrimdışı (Offline-First) Çalışma:** Electron masaüstü paketinde veriler doğrudan yerel SQLite veritabanında (`better-sqlite3`, WAL modu, `synchronous=FULL`) ve kuruş tamsayı (integer) hassasiyetiyle tutulur. Tarayıcı modunda ise `localStorage` üzerinden çalışır.
- **Kasa & Masa Operasyonları:** Salon/Bahçe masa yerleşimi, tur (batch) bazlı sipariş takibi, ürün opsiyonları, masa taşıma/birleştirme/bölme, parçalı/karma ödeme (Nakit, Kart, IBAN), ürün/adisyon iadesi ve kapatılmış adisyonu geri açma (`reopen`).
- **Gün Başı / Gün Sonu ve Z Raporu:** Tek açık gün değişmezi, 23:57 devri ve `Europe/Istanbul` saat dilimi desteği, nakit ve fiziki POS Z toplamı mutabakatı, mükerrer ciro engelleme (`!reopened && !cancelled`).
- **Kurumsal Dayanıklılık:** Otomatik `localStorage` → SQLite göçü (30 günlük eski veri koruma penceresi), çift konumlu otomatik JSON yedekleme (`Documents\LemoonYedek` + isteğe bağlı ikinci/USB klasör), pre-restore snapshot, çökme kurtarma yöneticisi ve SHA-256 hash zincirli işlem logları.

---

## 2. Teknoloji Yığını ve Paket Bağımlılıkları

[`package.json`](package.json) içinde tanımlı teknolojiler ve gerçek kullanım durumları:

| Katman | Teknoloji / Paket | Sürüm | Nerede Kullanılıyor? |
|---|---|---|---|
| **UI Çerçevesi** | `react`, `react-dom` | `^19.2.8` | Tüm arayüz bileşenleri, [`BodyPortal`](src/components/BodyPortal.tsx) (`createPortal`), `PrintPortal` (`createPortal`), `TopBar` dropdown portalı. |
| **İkonlar** | `lucide-react` | `^1.34.0` | `src/App.tsx` ve 35+ bileşende SVG ikonlar. |
| **Masaüstü DB** | `better-sqlite3` | `^13.1.1` | [`electron/db/connection.cjs`](electron/db/connection.cjs), [`schema.cjs`](electron/db/schema.cjs), [`migrator.cjs`](electron/db/migrator.cjs). `asarUnpack` ile paketlenir. |
| **Masaüstü Çekirdeği** | `electron` | `^39.0.0` | [`electron/main.cjs`](electron/main.cjs), [`preload.cjs`](electron/preload.cjs) (Tam ekran/pencere yönetimi, çoklu ekran, IPC, güvenlik). |
| **Paketleyici** | `electron-builder` | `^26.18.1` | `package.json` `"build"` bloğu; Windows NSIS `.exe` ve macOS `.dmg` üretimi. |
| **Dil & Derleyici** | `typescript`, `vite`, `@vitejs/plugin-react` | `~6.0.2` / `^8.2.2` / `^6.1.0` | Çok sayfalı (`index.html` + `customer-display.html`) build ve üretim CSP enjeksiyonu ([`vite.config.ts`](vite.config.ts)). |
| **Stil** | `tailwindcss`, `postcss`, `autoprefixer` | `^3.4.17` / `^8.5.26` / `^10.5.4` | [`tailwind.config.js`](tailwind.config.js), [`postcss.config.js`](postcss.config.js), [`src/index.css`](src/index.css). |
| **Kalite & Test** | `vitest`, `@vitest/coverage-v8`, `jsdom`, `oxlint` | `^5.1.0` / `^5.1.0` / `^29.1.1` / `^1.79.0` | [`vitest.config.ts`](vitest.config.ts), [`.oxlintrc.json`](.oxlintrc.json), `tests/` altındaki tüm testler. |
| **Geliştirme Yard.** | `concurrently`, `wait-on` | `^9.1.0` / `^8.0.0` | `npm run electron:dev` script'inde Vite ve Electron'u eşzamanlı başlatmak için. |
| **Eski Opsiyonel Backend** | Python (`fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `python-dateutil`) | [`backend/requirements.txt`](backend/requirements.txt) | Üretim masaüstü paketinde **kullanılmıyor** (bkz. Bölüm 6.1 ve 6.4). |

---

## 3. Sistem Mimarisi ve Veri Otoritesi (Source of Truth)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LEMOON KAFE POS v1.6.0                           │
├───────────────────────────────────┬─────────────────────────────────────┤
│   Ana Kasa Ekranı (workArea max.) │   Müşteri İkinci Ekranı             │
│   index.html -> src/main.tsx      │   customer-display.html             │
│   (Maksimize / Dokunmatik UI)     │   (Canlı Sepet & Karşılama)         │
└─────────────────┬─────────────────┴──────────────────┬──────────────────┘
                  │  contextBridge (sandbox: true)     │
                  │  window.electronAPI (preload.cjs)  │
                  └─────────────────┬──────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Electron Ana Süreci (electron/main.cjs)                │
│  • security.cjs (CSP, navigasyon/kısayol kilidi, IPC payload doğrulama) │
│  • backupManager.cjs (Documents\LemoonYedek + ikincil klasör + retention)│
│  • crashRecovery.cjs (3 çökme koruması, beklenmedik kapanma bildirimi)  │
│  • logger.cjs (PII/parola maskelemeli dönen dosya logu + .zip dışa akt.)│
│  • db/* (better-sqlite3: WAL, FULL sync, FK=ON, kuruş tamsayı sütunları)│
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            Kalıcılık Sınırı (src/lib/storage/) & İş Mantığı             │
│  • repository.ts -> Electron'da sqliteClient.ts (IPC db:sync)           │
│                  -> Web tarayıcıda localStorage + safe parsing          │
│  • sqliteMigration.ts (localStorage -> SQLite tek seferlik aktarım)     │
│  • validators.ts, quarantine.ts, migrations.ts, checksum.ts, backup.ts  │
└─────────────────────────────────────────────────────────────────────────┘
```

> **Not:** Eski `PROJE_OZET_RAPORU.md` sürümünde veri kaynağı yalnızca `localStorage / LevelDB` olarak belirtilmişti. Güncel kod tabanında Electron ortamındaki birincil veri otoritesi **`%APPDATA%\...\lemoon-pos.sqlite`** dosyasıdır; `localStorage` verileri açılışta otomatik olarak SQLite'a göç ettirilir (`migrateLocalStorageToSqliteIfNeeded`) ve tarayıcı ortamı için yedek/uyumluluk katmanı olarak korunur.

---

## 4. Proje Dizin Yapısı ve Disk Kullanımı

Çalışma dizini (`/Users/macboookpro15/Desktop/adisyonapp`) toplam ölçüm özeti:

| Dizin / Dosya | Ölçülen Boyut | İçerik ve Durum |
|---|---|---|
| `node_modules/` | **612 MB** | npm bağımlılıkları (`.gitignore`'da). En büyükler: `electron`, `lucide-react`, `electron-winstaller`, `better-sqlite3`, `typescript`. |
| `backend/` | **25 MB** | Eski Python FastAPI sunucusu. Boyutun neredeyse tamamı `backend/venv/` (25 MB), ayrıca `eco_coffee.db` (60 KB), `__pycache__/` (48 KB), kaynak `.py` dosyaları (~48 KB) ve boş `uploads/` klasörü. |
| `.git/` | **17 MB** | Git sürüm geçmişi. |
| `src/` | **1.3 MB** | React + TypeScript uygulama kaynak kodları. |
| `dist/` | **956 KB** | Vite production derleme çıktısı (`.gitignore`'da; `npm run build` ile üretilir). |
| `coverage/` | **816 KB** | Vitest V8 kapsama HTML/JSON raporu (`.gitignore`'da; `npm run test:coverage` ile üretilir). |
| `package-lock.json` | **260 KB** | npm kilit dosyası. |
| `electron/` | **236 KB** | Electron ana süreç, güvenlik, logger, çökme kurtarma, yedek yöneticisi ve SQLite motoru (`electron/db/`). |
| `tests/` | **188 KB** | 12 test dosyası + setup + fixtures (toplam 4.460 satır, 91 test). |
| `PROJE_OZET_RAPORU.md` | **~45 KB** | Proje özet raporu (bu belge). |
| `public/` & `docs/` & `build/` | **16 KB / 24 KB / 16 KB** | Statik varlıklar (`favicon.svg`, `logo.svg`), denetim/kurulum belgeleri ve paketleme ikonları. |
| Kök ayarlar | **~28 KB** | Yapılandırma dosyaları (`vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `tailwind.config.js`, `.oxlintrc.json`). |

---

## 5. Modüller ve "Nerede Ne Kullanıldı?" Haritası

### 5.1. Electron Ana Süreç, Güvenlik ve Donanım Katmanı

| Dosya | Satır | Kullanılan Teknoloji / API | Sorumluluğu |
|---|---:|---|---|
| [`electron/main.cjs`](electron/main.cjs) | 634 | Electron `app`, `BrowserWindow`, `ipcMain`, `screen`, `dialog`, `session`, `Menu` | Tekil örnek kilidi (`requestSingleInstanceLock`), GPU ivmelendirme ve 1:1 DPI sabitleme (`force-device-scale-factor=1`), `primaryDisplay.workArea` sınırlarında maksimize pencere (görev çubuğu görünür, kiosk kilidi yok, `Alta Al` / minimize açık), yönetici şifreli kapanış koruması, ikinci müşteri monitörü yönetimi, tüm IPC kanallarının orkestrasyonu. |
| [`electron/preload.cjs`](electron/preload.cjs) | 194 | Electron `contextBridge`, `ipcRenderer` | `Object.freeze` edilmiş, giriş doğrulamalı `window.electronAPI` köprüsü (`sandbox: true`, `contextIsolation: true`). |
| [`electron/security.cjs`](electron/security.cjs) | 538 | Node `path`, `fs`, `child_process.execFile` | Sertleştirilmiş `webPreferences`, üretimde DevTools/reload/Alt+F4/Ctrl+W/Ctrl+Q/F11 engelleme (`Ctrl+M` / `Ctrl+H` küçültmeye izinli, yönetici çıkışı `Ctrl+Shift+Q` hariç), CSP başlığı üretimi, Windows `TabTip.exe` / `osk.exe` sanal klavye başlatma, tüm IPC payload & dosya yolu doğrulayıcıları. |

### 5.2. Yerel SQLite Veritabanı ve Kalıcılık Katmanı

#### Electron Ana Süreç SQLite Motoru (`electron/db/`)
| Dosya | Satır | Görevi |
|---|---:|---|
| [`electron/db/index.cjs`](electron/db/index.cjs) | 17 | Alt modülleri tek arayüzde toplar (`openDatabase`, `executeDbAction` vb.). |
| [`electron/db/currency.cjs`](electron/db/currency.cjs) | 81 | TL ↔ kuruş (`toKurus`, `fromKurus`, `checkKurusPrecision`) dönüşümleri; tüm parasal sütunlar SQLite'da tam sayı kuruş olarak saklanır. |
| [`electron/db/schema.cjs`](electron/db/schema.cjs) | 399 | `PRAGMA user_version` tabanlı şema sürümleme (v1); 13+ ilişkisel tablo (`products`, `tables`, `business_days`, `z_reports`, `orders`, `order_items`, `payments`, `refunds`, `users`, `user_permissions`, `settings`, `activity_logs` vb.). |
| [`electron/db/connection.cjs`](electron/db/connection.cjs) | 234 | `%APPDATA%/.../lemoon-pos.sqlite` açılışı, `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`, `PRAGMA integrity_check` ve bozuk DB karantinası + son geçerli yedek önerisi. |
| [`electron/db/repository.cjs`](electron/db/repository.cjs) | 1529 | Tüm tablolar için CRUD, hash zincirli `activity_logs` ekleme/arşivleme (`computeActivityLogHashCjs`), `kv_store` ve `schema_meta` erişimi. |
| [`electron/db/transactions.cjs`](electron/db/transactions.cjs) | 326 | 7 adet çok adımlı atomik SQLite transaction fonksiyonu (`completeOrderTransaction`, `updateTablePaymentsTransaction`, `refundTransaction`, `reopenOrderTransaction`, `openBusinessDayTransaction`, `closeBusinessDayTransaction`, `transferMergeSplitTableTransaction`). |
| [`electron/db/migrator.cjs`](electron/db/migrator.cjs) | 459 | `localStorage` JSON payload'ını atomik olarak SQLite tablolarına aktaran göç motoru. |
| [`electron/db/ipcHandler.cjs`](electron/db/ipcHandler.cjs) | 227 | `db:sync` ve `db:invoke` IPC aksiyon yönlendiricisi (`status`, `getTables`, `saveTables`, `tx:*` vb.). |

#### Frontend Kalıcılık Sınırı (`src/lib/storage/`)
| Dosya | Satır | Görevi |
|---|---:|---|
| [`repository.ts`](src/lib/storage/repository.ts) | 742 | Tek giriş noktası. Electron'da `sqliteClient.ts` üzerinden SQLite'a, tarayıcıda `localStorage`'a yazar/okur; yazma hatalarında `pos-storage-error` olayı yayar. |
| [`sqliteClient.ts`](src/lib/storage/sqliteClient.ts) | 493 | `window.electronAPI.dbSync` sarmalayıcıları ve test enjeksiyon kancası (`setCustomSqliteDispatcher`). |
| [`sqliteMigration.ts`](src/lib/storage/sqliteMigration.ts) | 533 | Açılışta eski `localStorage` verilerini doğrular, ön-yedek alır, SQLite'a geçirir ve 30 günlük saklama işareti (`migrated_to_sqlite`) bırakır. |
| [`validators.ts`](src/lib/storage/validators.ts) | 353 | `Table`, `CompletedOrder`, `BusinessDay`, `Product`, `Refund`, `ActivityLog`, `User` ve yedek dosyası çalışma zamanı doğrulaması. |
| [`backup.ts`](src/lib/storage/backup.ts) | 379 | Tam JSON yedek (`POSBackupFile` v1), pre-restore snapshot/rollback, `backup:write` / `backup:list` / `backup:restore-read` / `backup:select-dir` IPC çağrıları. |
| [`migrations.ts`](src/lib/storage/migrations.ts) | 94 | Eski anahtar göçü (`eco_coffee_*`) ve kullanıcı ürünlerini ezmeden menü kataloğunu güncelleme (`migrateMenuProductsSafely`). |
| [`quarantine.ts`](src/lib/storage/quarantine.ts) | 71 | Bozuk JSON yüklerini silmek yerine `storage_quarantine_*` altına yalıtır. |
| [`checksum.ts`](src/lib/storage/checksum.ts) | 46 | 64-bit FNV-1a + Murmur karıştırmalı deterministik checksum (`electron/backupManager.cjs` ile birebir uyumlu). |
| [`types.ts`](src/lib/storage/types.ts) & [`index.ts`](src/lib/storage/index.ts) | 99 / 9 | Depolama ve yedekleme tip tanımları ile barrel export. |

### 5.3. Yedekleme, Çökme Kurtarma ve Dosya Loglama

| Dosya | Satır | Görevi |
|---|---:|---|
| [`electron/backupManager.cjs`](electron/backupManager.cjs) | 521 | `Documents\LemoonYedek\` (birincil) ve seçili USB/bulut klasörüne (ikincil) atomik `.tmp` + rename yedek yazımı; checksum doğrulama; saatlik (48 saat / 48 adet) ve günlük (30 gün / 30 adet) otomatik temizleme. |
| [`electron/crashRecovery.cjs`](electron/crashRecovery.cjs) | 544 | `session-state.json` ile temiz kapanış takibi, arka arkaya 3 renderer çökmesinde güvenli kurtarma HTML ekranı, `render-process-gone` / `unresponsive` yakalama ve yeniden başlatma bildirim bayrağı. |
| [`electron/logger.cjs`](electron/logger.cjs) | 381 | `%APPDATA%/.../logs/lemoon-pos.log` dosya logu (5 MB × 10 dosya rotasyonu), parola/PIN/PBKDF2 hash sansürleme ve Store/zlib destekli tek tık `.zip` dışa aktarma. |
| [`src/lib/systemHealth.ts`](src/lib/systemHealth.ts) | 535 | Renderer hata yakalama (`recordSystemLog`), log zip indirme (`exportErrorLogsToFile`) ve sistem sağlığı değerlendirme kuralları (`evaluateSystemHealth`). |

### 5.4. Masa, Sipariş, Ödeme, İade ve Gün Sonu (Z Raporu)

| Bileşen / Modül | Satır | Görevi |
|---|---:|---|
| [`src/App.tsx`](src/App.tsx) | 2773 | Ana orkestratör: oturum, tema, masalar, açık gün, saatlik/günlük/açılış/kapanış otomatik yedek zamanlayıcıları, modallar, hata/kurtarma banner'ları. |
| [`src/hooks/useHomeStats.ts`](src/hooks/useHomeStats.ts) | 53 | `HomePage` için günlük ciro, sipariş sayısı, ortalama sepet ve dolu masa hesaplama hook'u. |
| [`src/components/HomePage.tsx`](src/components/HomePage.tsx) | 295 | Karşılama ekranı, hızlı istatistik kartları ve ana geçişler. |
| [`src/components/BodyPortal.tsx`](src/components/BodyPortal.tsx) | 10 | Modal ve toast katmanlarını doğrudan `document.body` altına portal ederek ancestor transform/animasyon/`overflow: hidden` kırpılmasını önler. |
| [`src/components/TableLayout.tsx`](src/components/TableLayout.tsx) | 1021 | Salon & Bahçe masa grid'i, süre/tutar göstergeleri, `BodyPortal` üzerinden masa taşıma/birleştirme/kapalı adisyon açma modalları (`Escape` destekli) ve toast bildirimi. |
| [`src/components/TableOrderView.tsx`](src/components/TableOrderView.tsx) | 173 | Masa içi sipariş görünümü (`ProductExplorer` + `CartPanel`). |
| [`src/components/ProductExplorer.tsx`](src/components/ProductExplorer.tsx) | 307 | Kategori sekmeli ve aramalı ürün matrisi (`F2` kısayolu destekli). |
| [`src/components/ProductOptionModal.tsx`](src/components/ProductOptionModal.tsx) & [`ProductDetailModal.tsx`](src/components/ProductDetailModal.tsx) | 219 / 228 | Boyut/süt/şurup varyasyon seçimi ve ürün detay/iskonto görünümü. |
| [`src/components/CartPanel.tsx`](src/components/CartPanel.tsx) & [`cart/CartItemRow.tsx`](src/components/cart/CartItemRow.tsx) | 336 / 290 | Sipariş turları (batches), satır ve genel iskonto, not/müşteri adı, ödeme tetikleme. |
| [`src/components/SplitTableModal.tsx`](src/components/SplitTableModal.tsx) | 576 | `BodyPortal` üzerinden render edilen masalar arası ürün aktarma, birleştirme ve hesap bölme modalı. |
| [`src/components/PaymentModal.tsx`](src/components/PaymentModal.tsx) & [`ReceiptPreview.tsx`](src/components/ReceiptPreview.tsx) | 1305 / 11 | Nakit, Kart, IBAN, hızlı banknotlar, ürün bazlı/kısmi ödeme ve fiş önizleme. |
| [`src/components/AdisyonModal.tsx`](src/components/AdisyonModal.tsx) | 290 | Masaya ait yazdırılabilir adisyon önizlemesi. |
| [`src/components/OpenDayModal.tsx`](src/components/OpenDayModal.tsx) & [`CloseDayModal.tsx`](src/components/CloseDayModal.tsx) | 243 / 728 | Gün açılış avansı, gün sonu nakit sayımı, POS Z cihazı tutar karşılaştırması. |
| [`src/components/ReportsModal.tsx`](src/components/ReportsModal.tsx), [`reports/ReceiptsTable.tsx`](src/components/reports/ReceiptsTable.tsx), [`ZReportPrintView.tsx`](src/components/ZReportPrintView.tsx) | 1850 / 182 / 461 | Ciro/saatlik/ürün analizleri, fiş listesi, Z raporu dökümü ve yazıcı çıktısı. |
| [`src/components/RefundModal.tsx`](src/components/RefundModal.tsx) & [`ReopenOrderModal.tsx`](src/components/ReopenOrderModal.tsx) | 305 / 297 | Neden/yöntem kayıtlı ürün ve adisyon iadeleri ile kapalı adisyonu masaya geri açma. |
| [`src/components/ProductManager.tsx`](src/components/ProductManager.tsx), [`TableManager.tsx`](src/components/TableManager.tsx), [`ManagementModalLayout.tsx`](src/components/ManagementModalLayout.tsx) | 631 / 188 / 112 | Ürün/kategori/fiyat yönetimi ve masa düzenleme modalları. |
| [`src/lib/businessDay.ts`](src/lib/businessDay.ts) & [`src/lib/format.ts`](src/lib/format.ts) | 829 / 639 | İş günü motoru, `Europe/Istanbul` 23:57 devri, Z raporu hesaplama, `roundCurrency`, IBAN doğrulama ve masa/sepet saf fonksiyonları. |
| [`src/data/products.ts`](src/data/products.ts) & [`src/data/tables.ts`](src/data/tables.ts) | 683 / 15 | Varsayılan başlangıç menüsü ve masalar. |

### 5.5. Kimlik Doğrulama, PIN, Granüler İzinler ve Hash Zincirli Loglar

| Dosya | Satır | Görevi |
|---|---:|---|
| [`src/lib/crypto.ts`](src/lib/crypto.ts) | 399 | Web Crypto API ile PBKDF2-SHA256 (`100.000` iterasyon, tuzlanmış hash) + senkron `sha256HexSync`. |
| [`src/lib/auth.ts`](src/lib/auth.ts) | 1181 | Yönetici şifre doğrulama (10+ karakter), garson 4 haneli hızlı PIN, 5 hatalı denemede 60 sn kilitleme, oturum zaman aşımı. |
| [`src/lib/permissions.ts`](src/lib/permissions.ts) | 770 | 27 izin anahtarı, rol şablonu, kullanıcıya özel yetki ezme ve yetkisiz deneme loglama. |
| [`src/lib/activityLog.ts`](src/lib/activityLog.ts) | 750 | Her işlem kaydını `prevHash` üzerinden SHA-256 hash zincirine bağlar (`verifyChainAndReport`, arşivleme ve mühürleme). |
| [`src/components/LoginScreen.tsx`](src/components/LoginScreen.tsx), [`ForceChangePasswordModal.tsx`](src/components/ForceChangePasswordModal.tsx), [`AdminExitModal.tsx`](src/components/AdminExitModal.tsx) | 799 / 169 / 197 | Giriş ekranı (`-webkit-text-security` maskeli), ilk girişte zorunlu şifre değişimi ve yönetici şifreli çıkış modalı. |
| [`src/components/UserManagementView.tsx`](src/components/UserManagementView.tsx), [`TemplatePermissionsModal.tsx`](src/components/TemplatePermissionsModal.tsx), [`UserPermissionsModal.tsx`](src/components/UserPermissionsModal.tsx), [`PermissionDeniedModal.tsx`](src/components/PermissionDeniedModal.tsx) | 1285 / 352 / 666 / 70 | Personel CRUD, PIN atama, garson şablon izinleri, kişiye özel yetkiler ve yetki engeli uyarısı. |
| [`src/components/ActivityLogsView.tsx`](src/components/ActivityLogsView.tsx) | 777 | Arama, filtreleme, bütünlük zinciri doğrulama durumu ve işlem denetim ekranı. |

### 5.6. Müşteri İkinci Ekranı, Yazdırma (PrintPortal) ve Dokunmatik Optimizasyon

| Dosya | Satır | Görevi |
|---|---:|---|
| [`customer-display.html`](customer-display.html), [`src/customer-display-entry.tsx`](src/customer-display-entry.tsx), [`src/components/CustomerDisplay.tsx`](src/components/CustomerDisplay.tsx) | 248 | İkinci monitör için canlı sepet ve karşılama penceresi (`IPC: cart-update`). |
| [`src/components/PrintPortal.tsx`](src/components/PrintPortal.tsx) | 48 | `index.html`'deki `#print-portal` düğümüne `createPortal` ile basar; `beforeprint`/`afterprint` sınıflarıyla çok sayfalı A4 ve 58/80mm termal yazdırma taşma sorunlarını çözer. |
| [`src/components/SettingsModal.tsx`](src/components/SettingsModal.tsx), [`LogoSettingsModal.tsx`](src/components/LogoSettingsModal.tsx), [`AppLogo.tsx`](src/components/AppLogo.tsx), [`TopBar.tsx`](src/components/TopBar.tsx), [`SplashScreen.tsx`](src/components/SplashScreen.tsx), [`KeyboardHelpModal.tsx`](src/components/KeyboardHelpModal.tsx), [`ErrorBoundary.tsx`](src/components/ErrorBoundary.tsx) | Çeşitli | Ayarlar (tema, mağaza, yedekleme, log export), logo yönetimi, üst bar (Electron `Alta Al` pencere küçültme butonu ve 5 gizli dokunuşla yönetici çıkışı), açılış splash ekranı, kısayol yardımı ve güvenli çökme yakalayıcı. |

### 5.7. Test Altyapısı ve CI/CD

| Dosya | Satır | Kapsam |
|---|---:|---|
| [`tests/setup.ts`](tests/setup.ts) & [`tests/fixtures/factories.ts`](tests/fixtures/factories.ts) | 89 / 125 | JSDOM + gerçek SQLite test dispatcher kurulumu ve test veri fabrikaları. |
| [`tests/unit/financial_invariants.test.ts`](tests/unit/financial_invariants.test.ts) | 585 | Kuruş yuvarlama, tek açık gün, reopen mükerrer ciro engeli. |
| [`tests/unit/persistence.test.ts`](tests/unit/persistence.test.ts) | 533 | Safe storage, karantina, tahribatsız menü migration, backup/restore. |
| [`tests/unit/sqlite_migration_and_chaos.test.ts`](tests/unit/sqlite_migration_and_chaos.test.ts) | 884 | `localStorage` → SQLite göçü, rollback, WAL/FULL/FK pragma'ları, bozuk DB kurtarma. |
| [`tests/unit/activity_log_hash_chain.test.ts`](tests/unit/activity_log_hash_chain.test.ts) | 331 | SHA-256 hash zinciri, kurcalama (tamper) tespiti ve arşiv mühürleme. |
| [`tests/unit/auto_backup.test.ts`](tests/unit/auto_backup.test.ts) | 277 | Çift klasör yedekleme, dosya isimlendirme ve saklama (retention) politikaları. |
| [`tests/unit/system_health_and_crash.test.ts`](tests/unit/system_health_and_crash.test.ts) | 281 | Sistem sağlığı değerlendirmesi, dosya log sansürleme ve 3 çökme koruması. |
| [`tests/unit/electron_security.test.ts`](tests/unit/electron_security.test.ts) | 189 | Güvenlik kısayol engeli, küçültme kısayol izinleri (`Ctrl+M`/`Ctrl+H`), navigasyon kilidi, path traversal ve IPC doğrulamaları. |
| [`tests/unit/topbar_minimize.test.tsx`](tests/unit/topbar_minimize.test.tsx) | 128 | `TopBar` `Alta Al` butonunun Electron/web görünürlüğü ve `minimizeApp` IPC çağrısı. |
| [`tests/unit/table_layout_modals_portal.test.tsx`](tests/unit/table_layout_modals_portal.test.tsx) | 156 | `TableLayout` ve `SplitTableModal` modallarının `document.body` portalında açılması ve `Escape` ile kapanması. |
| [`tests/unit/payment_modal_button.test.tsx`](tests/unit/payment_modal_button.test.tsx) | 235 | `PaymentModal` tahsilat/kısmi ödeme buton davranışları. |
| [`tests/unit/print_portal.test.tsx`](tests/unit/print_portal.test.tsx) | 176 | `PrintPortal` DOM izole yazdırma ve `beforeprint`/`afterprint` sınıfları. |
| [`tests/integration/critical_journeys.test.ts`](tests/integration/critical_journeys.test.ts) | 471 | Uçtan uca sipariş → ödeme → iade → reopen → Z raporu yolculukları. |
| [`.github/workflows/build.yml`](.github/workflows/build.yml) | 53 | `main` push veya `v*` etiketinde `windows-latest` üzerinde `npm run electron:build` ile NSIS `.exe` ve GitHub Release üretir. |

---

## 6. Kullanılmayan, Ölü ve Arka Planda Boş Yer Kaplayan Öğeler (Denetim Bulguları)

> **v1.6.0 Güncellemesi:** Bu denetimde ilk tespit edilen boş kalıntı klasörler (`.pnpm-store/`, `node_modules 2/`, `release/win-unpacked/`, `src/context/`), kök dizindeki 5 adet eski renk/CSS scripti (`apply_dark_mode.cjs`, `fix_colors.cjs`, `replace_colors.js`, `revert_to_light.cjs`, `restore_css.cjs`), kullanılmayan başlangıç görselleri (`src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg`) ve gereksiz dev bağımlılıkları (`terser`, `@types/better-sqlite3`) depodan **temizlenmiştir**. Aşağıda hâlen mevcut olan diğer bulgular özetlenmektedir.

### 6.1. Diskte / Depoda Yer Kaplayan Gereksiz veya Kalıntı Klasör & Dosyalar

| Öğe | Boyut | Durumu & Neden Boş Yer Kaplıyor? |
|---|---:|---|
| `backend/` (özellikle `backend/venv/`) | **25 MB** | Eski FastAPI + SQLAlchemy sunucusu. Electron masaüstü uygulamasında çalıştırılmıyor ve `package.json` `"files"` listesine dahil edilmiyor. `backend/venv/` (25 MB), `backend/eco_coffee.db` (60 KB), `backend/__pycache__/` (48 KB) ve boş `backend/uploads/` klasörü diskte atıl duruyor. |
| `dist/` | **956 KB** | Vite build çıktısı (`.gitignore`'da). `npm run build` / `electron:build` her çalıştığında yeniden üretilir. |
| `coverage/` | **816 KB** | Vitest V8 HTML/JSON test kapsama raporu çıktısı (`.gitignore`'da). `npm run test:coverage` ile yeniden üretilir. |
| `.DS_Store` dosyaları | **~14 KB+** | macOS Finder metadata dosyaları (`.gitignore`'da). |
| `node_modules/` (bilgi amaçlı) | **612 MB** | Aktif geliştirme için gerekli; büyük kısmını Electron binary'si ve Windows paketleyici bileşenleri oluşturur. |

### 6.2. Yinelenen (Duplicate) İkon Klasörü

- [`build/icons/`](build/icons) (32 KB) ve [`electron/icons/`](electron/icons) (32 KB) içindeki 4 dosya (`128x128.png`, `128x128@2x.png`, `icon.ico`, `icon.png`) **MD5 özetlerine kadar birebir aynıdır**.
- `package.json` `"build"` yapılandırması `build/icons/*` kullanırken, `electron/main.cjs` `electron/icons/icon.png` yolunu okumaktadır; bu nedenle paketleme sırasında hem `electron/**/*` hem `extraResources` üzerinden `build/icons` iki kez kopyalanmaktadır.

### 6.3. Kod Tabanında Kullanılmayan (Ölü) UI Bileşenleri

| Bileşen | Satır | Durum |
|---|---:|---|
| [`src/components/SystemHealthIndicator.tsx`](src/components/SystemHealthIndicator.tsx) | 244 | **Hiçbir yerde import edilmiyor ve render edilmiyor.** Disk doluluğu, son yedek yaşı, saat kayması ve hash zinciri durumunu gösteren popover bileşeni yazılmış ancak `TopBar.tsx` veya `App.tsx`'e bağlanmamış. |
| [`src/components/reports/SalesTrendChart.tsx`](src/components/reports/SalesTrendChart.tsx) | 87 | **Hiçbir yerde import edilmiyor.** Eski FastAPI `/api/reports/sales-trend` yanıt formatına göre yazılmış ölü bileşen. |
| [`src/components/reports/SummaryCards.tsx`](src/components/reports/SummaryCards.tsx) | 81 | **Hiçbir yerde import edilmiyor.** Eski FastAPI `/api/reports/summary` yanıt formatına göre yazılmış ölü bileşen (`ReportsModal.tsx` artık yalnızca `ReceiptsTable.tsx`'i kullanıyor). |

### 6.4. Yarım Bağlı Modüller ve Eski FastAPI (`localhost:8000`) Kalıntıları

1. **Aktif Kodda Unutulmuş `http://localhost:8000` Çağrıları:**
   - [`src/App.tsx`](src/App.tsx) açılışta `getProducts()`, ürün kaydetmede `apiSaveProduct()`, ürün silmede `deleteProductApi()` fonksiyonlarını [`src/lib/api.ts`](src/lib/api.ts) üzerinden `http://localhost:8000/api`'ye çağırıyor.
   - [`src/components/LogoSettingsModal.tsx`](src/components/LogoSettingsModal.tsx) logo yüklerken `uploadLogo()` çağrısı yapıyor.
   - [`ProductExplorer.tsx`](src/components/ProductExplorer.tsx), [`ProductOptionModal.tsx`](src/components/ProductOptionModal.tsx) ve [`ProductDetailModal.tsx`](src/components/ProductDetailModal.tsx) `/uploads/...` görsellerini `http://localhost:8000` ön ekiyle çözümlüyor.
   - **Risk / Etki:** Masaüstünde backend kapalıyken bu istekler konsola ağ hatası düşürüp yutuluyor; eğer aynı bilgisayarda port 8000'de eski FastAPI sunucusu tesadüfen açıksa `getProducts()` yanıtı yerel SQLite menüsünün üzerine yazılabilir (`setMenuProducts(data)`). Ayrıca CSP kurallarında ([`vite.config.ts`](vite.config.ts) ve [`electron/security.cjs`](electron/security.cjs)) `http://localhost:8000` izni sırf bu kalıntı yüzünden açık tutuluyor.
2. **Yazılmış Ama UI'da Çağrılmayan Atomik SQLite Transaction'ları:**
   - [`electron/db/transactions.cjs`](electron/db/transactions.cjs) içinde 7 adet çok adımlı atomik işlem (`tx:completeOrder`, `tx:updateTablePayments`, `tx:refund`, `tx:reopenOrder`, `tx:openBusinessDay`, `tx:closeBusinessDay`, `tx:transferMergeSplitTable`) geliştirilmiş, `ipcHandler.cjs` ve `security.cjs`'ye eklenmiş ve [`sqliteClient.ts`](src/lib/storage/sqliteClient.ts) içinde `execute*SqliteTx` sarmalayıcıları yazılmış.
   - Ancak `src/App.tsx` ve `src/components/*` bu `execute*SqliteTx` fonksiyonlarını **henüz çağırmıyor**; operasyonlar hâlâ `repository.ts`'deki `saveTablesSafe`, `saveCompletedOrdersSafe`, `saveBusinessDaysSafe` toplu kayıtları üzerinden yürüyor (`execute*SqliteTx` fonksiyonları şu an yalnızca `tests/unit/sqlite_migration_and_chaos.test.ts` içinde test ediliyor).
3. **UI'a Bağlanmamış Sistem Sağlığı Değerlendirmesi:**
   - [`electron/preload.cjs`](electron/preload.cjs) içindeki `getSystemHealthMetrics` (`system:health-metrics`) ve [`src/lib/systemHealth.ts`](src/lib/systemHealth.ts) içindeki `evaluateSystemHealth` gerçek UI'da çağrılmıyor (sadece `recordSystemLog`, `exportErrorLogsToFile` ve `getStartupRecoveryStatus` aktif bağlı).

### 6.5. Kullanılmayan Export Edilmiş Fonksiyonlar ve Sabitler

`src/lib/` altında dışarıya `export` edilip hiçbir kaynak dosya tarafından kullanılmayan başlıca semboller:
- [`src/lib/api.ts`](src/lib/api.ts): `createOrder`, `toggleFullscreen` (ve buna bağlı olarak `backend/main.py` içindeki `/api/reports/*` uç noktaları).
- [`src/lib/businessDay.ts`](src/lib/businessDay.ts): `calculateCartItemsGrossRevenue`, `formatOptionsLabel`, `getOrderItemNetRevenues`, `exportReportToCsv`.
- [`src/lib/format.ts`](src/lib/format.ts): `mergeCartItems`.
- [`src/lib/crypto.ts`](src/lib/crypto.ts): `generateSalt`, `PASSWORD_BLACKLIST`, `generateRandomPin`.
- [`src/lib/permissions.ts`](src/lib/permissions.ts): `getPermissionLabel`, `buildDefaultTemplate`, `getAllUserOverrides`, `hasPermission`.
- [`src/lib/auth.ts`](src/lib/auth.ts): `DEFAULT_SESSION_TIMEOUT_MINUTES`, `MAX_FAILED_ATTEMPTS`, `LOCKOUT_DURATION_MS`, `initializeDefaultAdmin`, `saveActiveSession`, `clearActiveSession`.
- [`src/lib/activityLog.ts`](src/lib/activityLog.ts): `ARCHIVE_ANCHOR_META_KEY`, `CHAIN_HEAD_META_KEY`, `ARCHIVE_STORAGE_KEY`, `getArchiveAnchorHash`, `setArchiveAnchorHash`, `sealLegacyActivityLogsIfNeeded`.
- [`src/lib/systemHealth.ts`](src/lib/systemHealth.ts): `BACKUP_CRITICAL_AGE_MS`, `BACKUP_WARNING_AGE_MS`, `DISK_FREE_WARNING_RATIO`, `DISK_FREE_CRITICAL_RATIO`, `CLOCK_DRIFT_THRESHOLD_MS`, `formatBytes`, `formatRelativeAge`, `getRendererLogBuffer`.
- [`src/lib/storage/backup.ts`](src/lib/storage/backup.ts): `getFullBackupPayload` (dosya içinde kullanılıyor, dışarıdan import edilmiyor).
- [`src/lib/storage/sqliteClient.ts`](src/lib/storage/sqliteClient.ts): `getActiveSqliteDispatcher` (dosya içinde kullanılıyor, dışarıdan import edilmiyor) ve 7 adet `execute*SqliteTx` (yalnızca test dosyasında kullanılıyor).
- [`src/lib/storage/sqliteMigration.ts`](src/lib/storage/sqliteMigration.ts): `LEGACY_RETENTION_DAYS`, `LEGACY_RETENTION_MS`, `extractAndValidateLocalStorageData`.

### 6.6. Eski Backend Paket Bağımlılığı

- [`backend/requirements.txt`](backend/requirements.txt):
  - **`python-dateutil`:** `backend/*.py` dosyalarının hiçbirinde import edilmiyor.

---

## 7. Önerilen Sonraki İyileştirme Eylem Planı

1. **Eski Python / Build Artığı Temizliği (~26.5 MB+ yerel disk kazancı):**
   - Eski Python ortamı kullanılmıyorsa `backend/venv/` (25 MB) ve `backend/__pycache__/` klasörlerini kaldırın; `backend/` tamamen arşivlenecekse depodan çıkarın.
   - Tekrar üretilebilir çıktıları gerekmiyorsa temizleyin: `coverage/`, `dist/`.
2. **İkon Tekilleştirme:**
   - `electron/main.cjs`'nin `build/icons/icon.png` kullanmasını sağlayıp yinelenen `electron/icons/` klasörünü kaldırın.
3. **Ölü Bileşen ve Eski API Temizliği:**
   - Eski rapor bileşenlerini (`SalesTrendChart.tsx`, `SummaryCards.tsx`) ve `SystemHealthIndicator.tsx` hakkında karar verin (ya `SystemHealthIndicator`'ı `TopBar`'a bağlayıp `getSystemHealthMetrics` ile aktif edin ya da ölü kodu kaldırın).
   - `App.tsx`, `LogoSettingsModal.tsx` ve ürün modallarındaki `http://localhost:8000` (`getProducts`, `apiSaveProduct`, `deleteProductApi`, `uploadLogo`) kalıntılarını temizleyerek tamamen SQLite + yerel dosya/base64 akışına geçin; ardından CSP'deki `http://localhost:8000` istisnasını kaldırın.
4. **Atomik SQLite Transaction Entegrasyonu:**
   - `electron/db/transactions.cjs` içinde zaten hazır ve test edilmiş olan `execute*SqliteTx` (`completeOrder`, `refund`, `reopenOrder`, `openBusinessDay`, `closeBusinessDay`, `transferMergeSplitTable`) çağrılarını `App.tsx` akışına bağlayarak çok tablolu işlemlerde tam atomiklik sağlayın.
