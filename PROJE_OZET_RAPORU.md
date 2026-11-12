# LEMOON KAFE POS — Kapsamlı Proje Özet ve Mimari Raporu

**Proje Adı:** LEMOON KAFE POS (Eco Coffee POS)  
**Sürüm:** v1.5.0  
**Tarih:** 11 Kasım 2026  
**Platform / Hedef:** Windows POS Dokunmatik Terminalleri & Masaüstü (Electron) / Modern Web  
**Uygulama Tipi:** Çevrimdışı Öncelikli (Offline-First) Cafe & Restoran Kasa, Masa ve Adisyon Otomasyon Sistemi  

---

## İçindekiler
1. [Projenin Amacı ve Vizyonu](#1-projenin-amacı-ve-vizyonu)
2. [Teknoloji Yığını ve Kullanılan Kütüphaneler](#2-teknoloji-yığını-ve-kullanılan-kütüphaneler)
3. [Sistem Mimarisi ve Veri Otoritesi (Source of Truth)](#3-sistem-mimarisi-ve-veri-otoritesi-source-of-truth)
4. [Proje Dizin Yapısı](#4-proje-dizin-yapısı)
5. [Modüller, Bileşenler ve Görev Dağılımı](#5-modüller-bileşenler-ve-görev-dağılımı)
   - [5.1. Masa, Sipariş ve Sepet Yönetimi](#51-masa-sipariş-ve-sepet-yönetimi)
   - [5.2. Ödeme, Adisyon ve Parçalı Tahsilat](#52-ödeme-adisyon-ve-parçalı-tahsilat)
   - [5.3. Gün Başı / Gün Sonu ve Mali Z Raporu](#53-gün-başı--gün-sonu-ve-mali-z-raporu)
   - [5.4. İadeler ve Adisyon Geri Açma (Reopen)](#54-iadeler-ve-adisyon-geri-açma-reopen)
   - [5.5. Güvenlik, Kimlik Doğrulama ve PIN Sistemi](#55-güvenlik-kimlik-doğrulama-ve-pin-sistemi)
   - [5.6. Granüler Yetkilendirme ve İzin Şablonları](#56-granüler-yetkilendirme-ve-izin-şablonları)
   - [5.7. Müşteri İkinci Ekranı (Customer Display)](#57-müşteri-ikinci-ekranı-customer-display)
   - [5.8. Kurumsal Kalıcılık, Yedekleme ve Kurtarma Katmanı](#58-kurumsal-kalıcılık-yedekleme-ve-kurtarma-katmanı)
   - [5.9. Denetim İzi (Audit Log) Takibi](#59-denetim-izi-audit-log-takibi)
   - [5.10. Termal Fiş ve Rapor Yazdırma](#510-termal-fiş-ve-rapor-yazdırma)
6. [Dokunmatik POS ve Kiosk Donanım Optimizasyonları](#6-dokunmatik-pos-ve-kiosk-donanım-optimizasyonları)
7. [Test Stratejisi ve Kalite Güvencesi](#7-test-stratejisi-ve-kalite-güvencesi)
8. [Nerede Ne Kullandık? (Detaylı Teknoloji & Dosya Eşleştirmesi)](#8-nerede-ne-kullandık-detaylı-teknoloji--dosya-eşleştirmesi)
9. [Sonuç ve Gelecek Geliştirmeler](#9-sonuç-ve-gelecek-geliştirmeler)

---

## 1. Projenin Amacı ve Vizyonu

**LEMOON KAFE POS**, cafe ve restoran işletmelerinin yoğun kasa ve servis trafiğini hatasız, hızlı ve dokunmatik ekran dostu bir deneyimle yönetmek üzere tasarlanmıştır.

### Ana Hedefler:
- **Sıfır Bulut Bağımlılığı (Offline-First):** İnternet veya sunucu kesintilerinden etkilenmeyen, yerel cihaz üzerinde %100 çevrimdışı çalışabilirlik.
- **Finansal Doğruluk & Kuruş Hassasiyeti:** Kasa nakiti, kredi kartı, IBAN ve fiziki POS cihazı gün sonu (Z Raporu) kesintileriyle tam mutabakat sağlayan hesaplama motoru.
- **Hızlı Servis Ergonomisi:** Garsonların 4 haneli hızlı PIN ile sipariş girmesi, tek tuşla ürün varyasyonları, parçalı ödeme ve masa taşıma/birleştirme yeteneği.
- **Veri Güvenliği ve Kayıp Önleme:** Beklenmedik elektrik kesintileri, tarayıcı çökmesi veya disk hatalarına karşı otomatik karantina, şema migrasyonu, pre-restore anlık görüntüleri ve tam sistem yedeklemesi.

---

## 2. Teknoloji Yığını ve Kullanılan Kütüphaneler

| Alan / Katman | Kullanılan Teknoloji / Kütüphane | Sürüm | Seçim Nedeni ve Kullanım Amacı |
|---|---|---|---|
| **Kullanıcı Arayüzü (UI)** | **React** | `^19.2.8` | Modern bileşen mimarisi, reaktif durum yönetimi ve yüksek performans. |
| **DOM Render** | **React DOM** | `^19.2.8` | React bileşenlerinin web ve Electron pencerelerine basılması. |
| **Tip Güvenliği** | **TypeScript** | `~6.0.2` | Tip hatalarını derleme zamanında yakalama, finansal ve veri modellerinde katı tip güvencesi. |
| **Derleme & Sunucu** | **Vite** | `^8.2.2` | Ultra hızlı HMR (Hot Module Replacement) ve optimize edilmiş production bundle derlemesi. |
| **Masaüstü Motoru** | **Electron** | `^39.0.0` | Node.js ve Chromium çekirdeği ile bağımsız masaüstü uygulaması ve çoklu monitör yönetimi. |
| **Paketleyici (Installer)**| **electron-builder** | `^26.18.1` | Windows NSIS (.exe) kurulum paketi, masaüstü kısayolu ve simge entegrasyonu. |
| **Stil ve Tasarım** | **Tailwind CSS** | `^3.4.17` | Utility-first CSS mimarisi, dokunmatik ekranlar için özel tipografi ve renk paletleri. |
| **CSS İşleme** | **PostCSS** & **Autoprefixer** | `^8.5.26` / `^10.5.4` | Çapraz tarayıcı CSS uyumluluğu ve modern CSS kuralları. |
| **İkon Seti** | **Lucide React** | `^1.34.0` | Hafif, tutarlı ve modern SVG ikon seti (masa, ödeme, rapor, kullanıcı vb.). |
| **Kriptografi** | **Web Crypto API** (Native) | Yerleşik | Parola ve PIN'lerin SHA-256 ve PBKDF2 ile güvenli tuzlanmış hash'lenmesi. |
| **Test Motoru** | **Vitest** | `^5.1.0` | Hızlı, TypeScript destekli birim, invaryant ve entegrasyon test koşucusu. |
| **Test Ortamı** | **JSDOM** | `^29.1.1` | Node.js üzerinde DOM ve localStorage simülasyonu. |
| **Test Kapsamı** | **@vitest/coverage-v8** | `^5.1.0` | V8 tabanlı detaylı test kapsama analizi. |
| **Hızlı Linter** | **Oxlint** | `^1.79.0` | Rust tabanlı ultra hızlı kod kalitesi ve statik analiz aracı. |
| **Süreç Yönetimi** | **Concurrently** & **Wait-on**| `^9.1.0` / `^8.0.0` | Geliştirme esnasında Vite ve Electron süreçlerinin senkronize başlatılması. |
| **Backend (Opsiyonel)** | **FastAPI + SQLAlchemy + SQLite**| Python 3.10+ | Opsiyonel REST API, menü tohumlama (seed) ve logo depolama servisi. |

---

## 3. Sistem Mimarisi ve Veri Otoritesi (Source of Truth)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LEMOON KAFE POS v1.5.0                          │
├──────────────────────────────────┬─────────────────────────────────────┤
│      Ana Kasa Ekranı (Dokunmatik) │      Müşteri İkinci Ekranı (Display) │
│      (1920x1080 Kiosk / Fullscreen)│      (İkinci Monitörde Canlı Sepet) │
└─────────────────┬────────────────┴──────────────────┬──────────────────┘
                  │                                   │
                  │         IPC Mesajlaşması          │
                  │ (open-customer-display / update)  │
                  └─────────────────┬─────────────────┘
                                    ▼
             ┌──────────────────────────────────────────────┐
             │         Electron Main Süreci (main.cjs)      │
             │   - Tekil Örnek Kilidi (Single Instance)     │
             │   - DPI 1:1 Sabitleme & GPU İvmelendirmesi   │
             │   - Windows Sanal Klavye Çağrısı (TabTip.exe)│
             └──────────────────────┬───────────────────────┘
                                    │
                                    ▼
             ┌──────────────────────────────────────────────┐
             │         React 19 Presentation Layer          │
             │  App.tsx, TableLayout, CartPanel, Modals...  │
             └──────────────────────┬───────────────────────┘
                                    │
                                    ▼
             ┌──────────────────────────────────────────────┐
             │      Kalıcılık Katmanı (Storage Boundary)    │
             │             (src/lib/storage/)               │
             │  ├─ repository.ts (In-memory fallback & IO)  │
             │  ├─ validators.ts (Runtime tip doğrulaması)  │
             │  ├─ quarantine.ts (Bozuk veriyi yalıtma)     │
             │  ├─ migrations.ts (Katalog/sürüm koruma)     │
             │  ├─ checksum.ts   (Veri bütünlüğü kontrolü)  │
             │  └─ backup.ts     (Tam JSON yedek / snapshot)│
             └──────────────────────┬───────────────────────┘
                                    │
                                    ▼
             ┌──────────────────────────────────────────────┐
             │   Chromium LevelDB / LocalStorage Kalıcılığı │
             │  (%APPDATA%\com.ecocoffee.pos\Local Storage) │
             └──────────────────────────────────────────────┘
```

> **Önemli Mimari Notu:**  
> Paketlenmiş Windows masaüstü uygulamasında uygulamanın **tek ve gerçek veri kaynağı (Source of Truth)**, Electron'un yerleşik Chromium depolama alanıdır (`localStorage` / `LevelDB`). Python FastAPI katmanı paket içerisine gömülmemiş olup, sistemin **harici hiçbir sunucuya ihtiyaç duymadan sıfır bağımlılıkla** çalışması garanti altına alınmıştır.

---

## 4. Proje Dizin Yapısı

```
adisyonapp/
├── electron/                   # Masaüstü çalışma ortamı (Electron)
│   ├── main.cjs                # Pencere yönetimi, donanım ayarları ve IPC handlers
│   ├── preload.cjs             # ContextIsolation güvenli köprü scripti
│   └── icons/                  # Windows (.ico) ve macOS (.png) uygulama simgeleri
├── src/                        # React frontend kaynak kodları
│   ├── assets/                 # Statik görseller, logolar ve SVG ikonlar
│   ├── components/             # React ekran, modal ve UI bileşenleri
│   │   ├── cart/               # Sepet ve sipariş satır bileşenleri (CartItemRow)
│   │   ├── reports/            # Raporlama alt bileşenleri (Grafik, Tablo, KPI kartları)
│   │   ├── ActivityLogsView.tsx# Sistem denetim izi ve hareket kayıtları
│   │   ├── AdisyonModal.tsx    # Masa adisyon fişi önizleme ve baskı
│   │   ├── AppLogo.tsx         # Dinamik logo yükleyici ve görüntüleyici
│   │   ├── CartPanel.tsx       # Masa sipariş sepet paneli
│   │   ├── CloseDayModal.tsx   # Gün sonu kapatma ve Z raporu uzlaştırma modalı
│   │   ├── CustomerDisplay.tsx # İkinci ekran müşteri sepet görünümü
│   │   ├── ErrorBoundary.tsx   # Güvenli çökme yakalama ve veri koruma bileşeni
│   │   ├── ForceChangePasswordModal.tsx # İlk girişte zorunlu şifre değiştirme
│   │   ├── HomePage.tsx        # Kasa karşılama paneli ve hızlı istatistikler
│   │   ├── LoginScreen.tsx     # Yönetici & PIN giriş ekranı
│   │   ├── OpenDayModal.tsx    # Gün başı kasa açılış avansı modalı
│   │   ├── PaymentModal.tsx    # Nakit, Kart, IBAN ve Parçalı ödeme motoru
│   │   ├── ProductExplorer.tsx # Kategori sekmeli ürün seçim matrisi
│   │   ├── ProductManager.tsx  # Ürün, fiyat, kategori ve varyasyon yönetim paneli
│   │   ├── RefundModal.tsx     # Ürün ve masa iade yönetim modalı
│   │   ├── ReopenOrderModal.tsx# Kapatılmış adisyonu geri açma modalı
│   │   ├── ReportsModal.tsx    # Kapsamlı ciro, ürün ve Z raporu analiz ekranı
│   │   ├── SettingsModal.tsx   # Sistem, yazıcı, tema ve yedekleme ayarları
│   │   ├── SplitTableModal.tsx # Masa taşıma, birleştirme ve hesap ayırma
│   │   ├── TableLayout.tsx     # İnteraktif salon ve bahçe masa yerleşimi
│   │   ├── TopBar.tsx          # Durum çubuğu (Kullanıcı, Gün, Saat, İkinci Ekran)
│   │   ├── UserManagementView.tsx # Personel tanımlama ve PIN belirleme
│   │   └── ZReportPrintView.tsx   # Termal Z Raporu yazdırma şablonu
│   ├── data/                   # Varsayılan başlangıç verileri (Ürünler ve masalar)
│   ├── hooks/                  # Özel React kancaları (useHomeStats)
│   ├── lib/                    # İş mantığı, finansal motor ve güvenlik kütüphaneleri
│   │   ├── storage/            # Kurumsal kalıcılık sınırı (Persistence Boundary)
│   │   ├── activityLog.ts      # Sistem hareketlerini kayıt altına alma servisi
│   │   ├── api.ts              # Opsiyonel FastAPI REST istemcisi
│   │   ├── auth.ts             # Oturum, parola, PIN ve güvenlik servisleri
│   │   ├── businessDay.ts      # İş günü, Z Raporu ve POS mutabakat motoru
│   │   ├── crypto.ts           # Web Crypto tabanlı hash algoritmaları
│   │   ├── format.ts           # Kuruş yuvarlama, para birimi ve KDV hesaplama
│   │   ├── permissions.ts      # Rol ve personel bazlı granüler izin matrisi
│   │   └── uuid.ts             # Benzersiz UUID v4 üretici
│   ├── types/                  # Ayarlar ve genel tip tanımları
│   ├── App.tsx                 # Ana uygulama orkestratörü ve durum yöneticisi
│   ├── customer-display-entry.tsx # İkinci ekran başlangıç noktası
│   ├── index.css               # Dokunmatik optimizasyonlu global CSS ve tema
│   ├── main.tsx                # React kök başlatıcı
│   └── types.ts                # Sistemin merkezi TypeScript tip tanımları
├── backend/                    # Opsiyonel Python FastAPI servisi
│   ├── main.py                 # FastAPI endpoint'leri ve dosya yükleme
│   ├── database.py             # SQLite veritabanı bağlantısı
│   ├── models.py               # SQLAlchemy ORM modelleri
│   └── schemas.py              # Pydantic doğrulama şemaları
├── docs/                       # Güvenilirlik denetimi ve canlıya geçiş belgeleri
│   ├── CAFE_PRE_GO_LIVE_CHECKLIST.md # İşletmeci kabul ve tatbikat kılavuzu
│   └── RELIABILITY_AUDIT.md          # Mimari ve güvenlik denetim raporu
├── tests/                      # Vitest test paketi
│   ├── fixtures/               # Test mock nesne fabrikaları (factories.ts)
│   ├── integration/            # Uçtan uca kullanıcı yolculuğu testleri
│   ├── unit/                   # Birim, finansal invaryant ve kalıcılık testleri
│   └── setup.ts                # JSDOM ortam kurulumu
└── package.json                # Bağımlılıklar, scriptler ve electron-builder konfigürasyonu
```

---

## 5. Modüller, Bileşenler ve Görev Dağılımı

### 5.1. Masa, Sipariş ve Sepet Yönetimi
- **Bileşenler:** [`TableLayout.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/TableLayout.tsx), [`TableOrderView.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/TableOrderView.tsx), [`CartPanel.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/CartPanel.tsx), [`CartItemRow.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/cart/CartItemRow.tsx), [`SplitTableModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/SplitTableModal.tsx).
- **Yetenekler:**
  - **Salon & Bahçe Alanları:** Masaların anlık doluluk durumu, açık kalma süresi ve güncel bakiye gösterimi.
  - **Sipariş Turları (Batches):** Masaya sonradan eklenen ürünlerin "1. Tur", "2. Tur" şeklinde gruplanması; mutfak ve servis takibini kolaylaştırma.
  - **Ürün Opsiyonları & Varyasyonlar:** Kahve boyutu, süt tercihi (Yulaf, Soya, Yağsız), şurup aromaları ve tatlı porsiyon seçimleri.
  - **Masa Operasyonları:** Masalar arası ürün taşıma, masa birleştirme (merge) ve hesabı ayrı masalara bölme (split).
  - **Satır ve Genel İskonto:** Ürün bazında veya toplam adisyonda yüzde (%) ve tutar (₺) bazlı indirim tanımlama.

### 5.2. Ödeme, Adisyon ve Parçalı Tahsilat
- **Bileşenler:** [`PaymentModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/PaymentModal.tsx), [`AdisyonModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/AdisyonModal.tsx).
- **Yetenekler:**
  - **Çoklu Ödeme Yöntemleri:** Nakit (Cash), Kredi Kartı (Card), Banka Havalesi/EFT (IBAN) ve Karma Ödeme.
  - **Hızlı Banknot Tuşları:** Nakit ödemelerde 50 ₺, 100 ₺, 200 ₺ butonları ve otomatik para üstü hesabı.
  - **Parçalı / Ürün Bazlı Tahsilat:** Masadaki misafirlerin yalnızca kendi içtikleri ürünleri seçip ayrı ayrı ödemesi veya serbest tutar girmesi.
  - **Kısmi Ödemelerin Masada Saklanması:** Masa henüz tamamen kapanmadan gün içinde alınan ara ödemelerin masada güvenle tutulması ve gün sonuna doğru işlenmesi.

### 5.3. Gün Başı / Gün Sonu ve Mali Z Raporu
- **Bileşenler:** [`OpenDayModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/OpenDayModal.tsx), [`CloseDayModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/CloseDayModal.tsx), [`businessDay.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/businessDay.ts), [`ZReportPrintView.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/ZReportPrintView.tsx).
- **Yetenekler:**
  - **Kasa Açılış Avansı:** Güne başlarken kasaya konulan madeni ve kağıt para tutarının kaydedilmesi (`openingCash`).
  - **Tek Açık Gün Kuralı:** Sistemde aynı anda yalnızca 1 iş gününün açık olabilmesi; açık gün varken mükerrer gün açılmasının engellenmesi.
  - **23:57 Gece Devri ve Europe/Istanbul Saat Dilimi:** Gece yarısına sarkan vardiyalarda POS cihazının gün sonu saati ile senkronizasyon.
  - **Z-Raporu Mutabakatı:** Kasa kapatılırken sayılan fiziki nakit ile beklenen nakit farkı; banka POS slipindeki Z toplamı ile sistemdeki kart toplamı farkının (`zDifference`) kuruşu kuruşuna analizi.
  - **Açık Masa Koruması:** Masalarda açık hesap varken günün yanlışlıkla kapatılmasının önlenmesi.

### 5.4. İadeler ve Adisyon Geri Açma (Reopen)
- **Bileşenler:** [`RefundModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/RefundModal.tsx), [`ReopenOrderModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/ReopenOrderModal.tsx).
- **Yetenekler:**
  - **Tekil Ürün ve Adisyon İadesi:** İptal edilen ürünlerin nedeni (`reason`), iade eden yetkili ve iade yöntemi belirtilerek kayıtlara geçmesi.
  - **Mükerrer Ciro Koruması (Anti-Duplication):** Kapatılmış bir adisyonun yetkili şifresiyle masaya geri açılması durumunda, eski adisyonun `reopened: true` olarak işaretlenmesi; ciro ve kart dökümlerinde aynı satışın **iki defa toplanmasının kesin olarak engellenmesi**.

### 5.5. Güvenlik, Kimlik Doğrulama ve PIN Sistemi
- **Bileşenler:** [`LoginScreen.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/LoginScreen.tsx), [`ForceChangePasswordModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/ForceChangePasswordModal.tsx), [`auth.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/auth.ts), [`crypto.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/crypto.ts).
- **Yetenekler:**
  - **İki Farklı Giriş Akışı:**
    1. *Yönetici (Admin):* Kullanıcı adı + Güçlü şifre (En az 10 karakter, harf ve rakam zorunluluğu).
    2. *Garson (Waitstaff):* Dokunmatik ekrandan 4 haneli hızlı PIN kodu ile anında giriş.
  - **Brute-Force & Hesap Kilitleme:** 5 hatalı deneme yapıldığında 60 saniyelik zorunlu soğuma süresi (lockout).
  - **Chrome Güvenlik Uyarısı Koruması:** Giriş alanlarında `autoComplete="off"`, CSS text maskelemesi (`-webkit-text-security: disc`) kullanılarak Chrome'un "Şifreniz sızdırıldı" uyarısı fırlatmasının engellenmesi.
  - **Kriptografik Güvenlik:** Düz metin (plaintext) parola saklanmaz. Web Crypto API ile tuzlanmış hash'ler oluşturulur.
  - **Otomatik Oturum Zaman Aşımı (Session Timeout):** Belirlenen hareketsizlik süresi sonunda ekranın otomatik kilitlenmesi.

### 5.6. Granüler Yetkilendirme ve İzin Şablonları
- **Bileşenler:** [`permissions.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/permissions.ts), [`TemplatePermissionsModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/TemplatePermissionsModal.tsx), [`UserPermissionsModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/UserPermissionsModal.tsx), [`PermissionDeniedModal.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/PermissionDeniedModal.tsx).
- **Yetenekler:**
  - 27 adet granüler yetki anahtarı (Sipariş alma, ikram/iskonto, gün açma/kapatma, iade yapma, menü fiyatlarını değiştirme vb.).
  - **Rol Şablonu:** Garson rolü için toplu varsayılan izinlerin yönetimi.
  - **Personel Bazlı Yetki Ezme (Override):** Belirli bir kıdemli garsona özel olarak iade veya masa aktarma yetkisi tanımlayabilme.

### 5.7. Müşteri İkinci Ekranı (Customer Display)
- **Bileşenler:** [`CustomerDisplay.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/CustomerDisplay.tsx), [`customer-display-entry.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/customer-display-entry.tsx), [`customer-display.html`](file:///Users/macboookpro15/Desktop/adisyonapp/customer-display.html), [`electron/main.cjs`](file:///Users/macboookpro15/Desktop/adisyonapp/electron/main.cjs).
- **Yetenekler:**
  - POS kasasına bağlı harici ikinci monitörün (müşteriye dönük ekran) otomatik tespiti.
  - Kasada eklenen her ürünün, porsiyon bilgisinin, indirimlerin ve toplam tutarın canlı olarak ikinci ekrana yansıtılması (`IPC: update-customer-display`).
  - Kasa boşta iken cafe karşılama görseli ve logosunun sergilenmesi.

### 5.8. Kurumsal Kalıcılık, Yedekleme ve Kurtarma Katmanı
- **Bileşenler:** `src/lib/storage/` ([`repository.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/storage/repository.ts), [`validators.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/storage/validators.ts), [`quarantine.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/storage/quarantine.ts), [`migrations.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/storage/migrations.ts), [`backup.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/storage/backup.ts), [`checksum.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/storage/checksum.ts)).
- **Yetenekler:**
  - **In-Memory Fallback:** `localStorage` disk kotası dolsa dahi satışların bellekte tutulması ve veri yazma hatası bildirimi fırlatılması.
  - **Safe Parsing & Karantina:** Bozuk veya yarım kalmış JSON tespit edildiğinde, veri kesinlikle silinmez; `storage_quarantine_<tarih>` anahtarına yedeklenip varsayılan güvenli duruma dönülür.
  - **Tahribatsız Menü Güncellemesi (Non-Destructive Migrations):** Yazılım güncellendiğinde veya yeni menü katalog versiyonu geldiğinde personelin eklediği özel ürünler ve fiyatlar ezilmez; güvenle harmanlanır.
  - **Tam Sistem Yedeği (Full POS Backup JSON v1):** Masalar, açık/kapalı iş günleri, Z raporları, satış arşivi, personel listesi ve ayarların tek bir JSON dosyası olarak USB belleğe veya diske indirilmesi.
  - **Pre-Restore Snapshot & Rollback:** Yedekten geri yükleme yapılmadan önce sistemin o anki durumunun anında güvenlik yedeği alınır. Yanlış yedek yüklenirse tek tuşla geri alınabilir.

### 5.9. Denetim İzi (Audit Log) Takibi
- **Bileşenler:** [`activityLog.ts`](file:///Users/macboookpro15/Desktop/adisyonapp/src/lib/activityLog.ts), [`ActivityLogsView.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/ActivityLogsView.tsx).
- **Yetenekler:**
  - Kasa üzerindeki tüm hassas hareketlerin (ürün silme, miktar azaltma, iskonto uygulama, hesap taşıma, yetkisiz buton tıklamaları, kasa açılışı/kapanışı) personel adı, rolü ve zaman damgasıyla saniyesi saniyesine kayıt altına alınması.
  - İşletme sahibinin şüpheli durumları filtreleyip inceleyebileceği arama ve filtreleme paneli.

### 5.10. Termal Fiş ve Rapor Yazdırma
- **Bileşenler:** [`ReceiptPreview.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/ReceiptPreview.tsx), [`ZReportPrintView.tsx`](file:///Users/macboookpro15/Desktop/adisyonapp/src/components/ZReportPrintView.tsx), [`index.css`](file:///Users/macboookpro15/Desktop/adisyonapp/src/index.css).
- **Yetenekler:**
  - 80mm ve 58mm standart termal POS fiş yazıcıları ile tam uyumlu CSS `@media print` tasarımı.
  - Fiş üstünde işletme logosu, adres, vergi dairesi/oranı, ürün detayları, dipnot mesajı ve mali olmayan adisyon bilgisi.
  - Gün sonu Z Raporunun ayrıntılı dökümü (Açılış, Brüt Ciro, İadeler, Net Ciro, Kart/Nakit/IBAN kırılımı, POS Z farkı).

---

## 6. Dokunmatik POS ve Kiosk Donanım Optimizasyonları

Sistem, cafe ortamındaki endüstriyel dokunmatik terminallerde (örn. AVAPOS, Elo, Posiflex) çalışacak şekilde optimize edilmiştir:

1. **DPI ve Çözünürlük Sabitleme:**
   - Windows ekran ölçeklendirmesinde (%125, %150) butonların kaymasını önlemek için Electron parametresi olarak `force-device-scale-factor=1` tanımlanmıştır.
2. **Donanım İvmelendirmesi (Hardware Acceleration):**
   - GPU ivmelendirmesi (`enable-gpu-rasterization`, `enable-zero-copy`) ile dokunmatik kaydırma ve animasyonlarda sıfır takılma.
3. **Dokunmatik Tipografi Güçlendirmesi:**
   - `tailwind.config.js` ve `index.css` üzerinde küçük fontlar (`text-[9px]`, `text-[10px]`) otomatik olarak 12.5px - 14.5px seviyesine yükseltilmiş ve `font-weight: 750` ile dokunmatik ekranda uzaktan okunabilir hale getirilmiştir.
4. **Windows Dokunmatik Klavye Entegrasyonu:**
   - Metin girişi gereken alanlarda işletim sistemi sanal klavyesini (`TabTip.exe` / `osk`) tetikleyen özel IPC köprüsü.
5. **Tekil Uygulama Kilidi (Single Instance Lock):**
   - Kasa görevlisinin uygulamayı arka arkaya çift tıklayarak iki defa açmasını ve veri çakışması oluşturmasını engelleyen `requestSingleInstanceLock`.

---

## 7. Test Stratejisi ve Kalite Güvencesi

Proje, kritik finansal verileri korumak amacıyla çok katmanlı test mimarisi ile donatılmıştır:

```
tests/
├── fixtures/
│   └── factories.ts                  # Tip güvenli sahte veri üreticileri (User, Order, Day...)
├── unit/
│   ├── financial_invariants.test.ts  # Finansal kuruş hesaplama ve iş günü değişmezleri
│   └── persistence.test.ts           # Kalıcılık katmanı, bozuk veri ve yedekleme testleri
└── integration/
    └── critical_journeys.test.ts     # Uçtan uca cafe senaryoları (Satış -> İade -> Z Raporu)
```

### Başlıca Test Senaryoları:
- **Tek Açık Gün Değişmezi:** Açık gün varken yeni gün açılamayacağı ve ilk günün referansının bozulmayacağı.
- **Mükerrer Ciro Engeli:** Adisyon geri açılıp (`reopen`) yeniden kapatıldığında cironun ve Z kart dökümünün mükerrer toplanmadığı.
- **Kuruş Yuvarlama Hassasiyeti:** İskonto ve KDV hesaplamalarında kayan noktalı sayı (floating point) hatalarının `roundCurrency` ile 2 basamağa kilitlendiği.
- **Kota Aşımı ve Karantina:** `localStorage` dolduğunda verilerin in-memory'de korunduğu ve bozuk JSON'ların karantinaya alındığı.

---

## 8. Nerede Ne Kullandık? (Detaylı Teknoloji & Dosya Eşleştirmesi)

| Dosya / Dizin | Teknoloji / Kütüphane | Bu Dosyada Ne Yapıldı? |
|---|---|---|
| `electron/main.cjs` | Electron, Node.js (`child_process`, `screen`) | Kiosk modunda ana pencere ve ikinci müşteri ekranının yönetimi, DPI sabitleme, Windows sanal klavye çalıştırma. |
| `electron/preload.cjs` | Electron `contextBridge`, `ipcRenderer` | Renderer süreci ile ana süreç arasında güvenli IPC köprüsü oluşturma. |
| `src/App.tsx` | React 19, TypeScript, Lucide React | Sistemin ana orkestrasyonu; tüm modal, sepet, masa ve aktif ekran durumlarının merkezi yönetimi. |
| `src/lib/storage/repository.ts` | TypeScript, DOM Web Storage | Güvenli `safeGetItem` / `safeSetItem`, bellek önbelleği (`inMemoryCache`), disk kotası yakalama. |
| `src/lib/storage/validators.ts` | TypeScript | `BusinessDay`, `CompletedOrder`, `Table`, `Product` tiplerinin çalışma zamanı şema doğrulaması. |
| `src/lib/storage/backup.ts` | TypeScript, Web Crypto | Tam durum dışa aktarma (Full Backup JSON), geri yükleme öncesi anlık görüntü (`pre_restore_snapshot`) ve geri alma. |
| `src/lib/businessDay.ts` | TypeScript, Intl API | Europe/Istanbul saat dilimi devri, POS Z kesim saati, adisyon ciro ve kart dökümü hesaplamaları, CSV dışa aktarımı. |
| `src/lib/auth.ts` | Web Crypto API, TypeScript | Yönetici parola doğrulama, Garson 4 haneli PIN kontrolü, 5 hatalı girişte 1 dk kilitleme, oturum zaman aşımı. |
| `src/lib/permissions.ts` | TypeScript | 27 adet kural içeren rol tabanlı izin matrisi, garson şablonu ve kullanıcıya özel yetki ezme sistemi. |
| `src/lib/activityLog.ts` | TypeScript | Personelin tüm masa, sipariş, iskonto, iade ve oturum eylemlerini loglama ve filtreleme. |
| `src/lib/format.ts` | TypeScript | Finansal formatlama (`₺` simgesi, binlik ayraçlar, 2 kuruş basamağı yuvarlama `roundCurrency`). |
| `src/components/PaymentModal.tsx` | React 19, Lucide React | Nakit, Kart, IBAN, banknot tuşları ve ürün bazlı parçalı ödeme arayüzü. |
| `src/components/TableLayout.tsx` | React 19, Lucide React, Tailwind CSS | Salon ve Bahçe masalarının interaktif dokunmatik grid yerleşimi, süre ve tutar takibi. |
| `src/components/ReportsModal.tsx` | React 19, Tailwind CSS | Ciro trend grafiği, saatlik satış dağılımı, en çok satan ürünler ve geçmiş Z raporları arşivi. |
| `src/components/CloseDayModal.tsx` | React 19, Tailwind CSS | Kasa nakiti ve POS cihazı Z fişinin girilip kuruş farklarının denetlendiği gün sonu modalı. |
| `src/components/CustomerDisplay.tsx`| React 19, Lucide React | Müşteri ikinci ekranında canlı sepet, ürün porsiyonları ve karşılama animasyonu. |
| `src/components/SettingsModal.tsx` | React 19, Tailwind CSS | Mağaza bilgileri, tema seçimi (Açık/Koyu/Sıcak), termal fiş altbilgisi, tek tuşla tam sistem yedeği. |
| `src/index.css` | Tailwind CSS 3, Modern CSS | Dokunmatik ekranlar için özel font boyutlandırması, baskı CSS (@media print) ve tema değişkenleri. |
| `tailwind.config.js` | Tailwind CSS Config | Tipografi ve font ağırlıklarının (normal: 600, bold: 850) dokunmatik terminallere göre ölçeklenmesi. |
| `backend/main.py` | Python 3, FastAPI, SQLAlchemy | Ürün listeleme, ekleme ve logo yükleme için opsiyonel REST API servisi. |

---

## 9. Sonuç ve Gelecek Geliştirmeler

**LEMOON KAFE POS v1.5.0**, modern web teknolojilerinin çevikliği ile yerel masaüstü uygulamalarının güvenilirliğini başarıyla birleştiren, **tamamen bağımsız ve dayanıklı** bir restoran otomasyon çözümüdür.

### Gelecek Yol Haritası (Önerilen Geliştirmeler):
1. **Ağ İçi Çoklu Terminal Senkronizasyonu (LAN Sync):** Birden fazla garson el terminalinin veya tabletin ana kasadaki yerel SQLite/WebSocket servisine bağlanarak sipariş göndermesi.
2. **ESC/POS Doğrudan Termal Yazıcı Desteği:** İşletim sistemi yazdırma diyaloğu yerine Electron üzerinden doğrudan USB veya Network/Ethernet termal fiş yazıcılarına raw ESC/POS komutları gönderme.
3. **Mutfak Ekranı Sistemi (KDS - Kitchen Display System):** Bar ve mutfak için sipariş turlarını anlık gösteren ayrı bir istasyon ekranı.
4. **Stok & Reçete Takibi:** Satılan her kahve ve tatlının ardından süt, kahve çekirdeği ve şurup gibi ham maddelerin otomatik stoktan düşülmesi.

---
*Rapor Sonu — LEMOON KAFE POS Geliştirme Ekibi*
