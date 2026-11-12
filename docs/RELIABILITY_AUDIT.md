# LEMOON KAFE POS — Reliability, Data Safety & Architecture Audit

**Tarih / Tarihçe:** 2026-11-07  
**Uygulama:** LEMOON KAFE POS (Desktop Electron + React + TypeScript + Vite)  
**Hedef Ortam:** Tek Windows POS Bilgisayarı (Çevrimdışı / Offline Cafe İşletimi)  
**Denetim Kapsamı:** Veri Güvenliği, Kalıcılık Katmanı, Finansal Hesaplamalar, Gün Sonu / Z Raporları, Test Edilebilirlik  

---

## 1. Yönetici Özeti (Executive Summary)

Bu denetim, LEMOON KAFE POS masaüstü uygulamasının üretim güvenilirliğini, veri saklama mimarisini ve olası veri kaybı/bozulma risklerini belirlemek amacıyla gerçekleştirilmiştir.

**Temel Bulgular:**
1. **Tek ve Gerçek Otorite (Source of Truth):** Uygulamanın tüm aktif iş verileri (masalar, siparişler, satışlar, iş günleri, Z raporları, menü ürünleri, iadeler, loglar, kullanıcılar ve izinler) **Electron / Chromium `localStorage`** üzerinde tutulmaktadır. Depoda bulunan FastAPI/SQLite arka planı paketlenmiş Electron uygulamasında **kesinlikle çalıştırılmamakta ve kullanılmamaktadır**.
2. **Kritik Veri Kaybı Yolları:**
   - `ErrorBoundary.tsx` içerisindeki önbellek temizleme aksiyonu (`handleResetCache`), herhangi bir React render hatasında kullanıcının tek bir tıklamasıyla tüm geçmiş iş günlerini ve Z raporu arşivini (`businessDays`) geri dönüşsüz olarak silmektedir.
   - `App.tsx` içerisindeki menü katalog sürüm kontrolü (`menuCatalogVersion`), katalog versiyonu değiştiğinde kullanıcının tanımladığı tüm özel ürünleri ve fiyatları sormadan silmektedir (`localStorage.removeItem('menuProducts')`).
   - `App.tsx` ve `ReportsModal.tsx` içindeki "Raporları Sıfırla" ve `SettingsModal.tsx` içindeki "Varsayılan Verilere Dön" butonları, ön-yedekleme veya geri alma olmaksızın tüm iş geçmişini silmektedir.
3. **Kritik Çökme Riskleri:** `tables` ve `completedOrders` anahtarları `JSON.parse` ile doğrudan okunmakta olup `try-catch` korumasına sahip değildir. Bu anahtarlardan herhangi birindeki tek bir bozuk karakter veya eksik yazma, uygulamanın açılışta beyaz ekranda kalmasına ve bir daha açılamamasına neden olmaktadır.
4. **Finansal Raporlama / Mükerrer Ciro Hatası:** Reopen (adisyon geri açma) işleminde sipariş `reopened: true` olarak işaretlenip masa sepetine aktarılmakta, ancak `businessDay.ts` içerisindeki ciro hesaplamalarında filtrelenmediği için aynı adisyon tekrar kapatıldığında ciro ve tahsilat iki kez hesaplanmaktadır.
5. **Yedekleme Boşluğu:** Mevcut "Ayarları Dışa Aktar" özelliği yalnızca tema ve temel ayarları dışa aktarmakta; satışları, açık masaları, kullanıcıları ve Z raporlarını kapsamamaktadır.

---

## 2. Veri Otoritesi ve Mimarisi (Architecture & Source of Truth)

### 2.1. FastAPI / SQLite Katmanının Gerçek Durumu
- **İnceleme:** `electron/main.cjs`, `electron/preload.cjs`, `package.json` ve `src/lib/api.ts` incelenmiştir.
- **Bulgu:**
  - `electron/main.cjs` içinde hiçbir Python process (`child_process.spawn`) veya backend sunucusu ayağa kaldırılmamaktadır.
  - `src/lib/api.ts` dosyasında `getProducts`, `saveProduct`, `createOrder` fonksiyonları yer alsa da, `src/` altındaki hiçbir React bileşeni satış kaydı veya menü okuma için bu fonksiyonları çağırmamaktadır. Yalnızca `LogoSettingsModal.tsx` içinde `try-catch` ile yutulan sembolik bir logo yükleme çağrısı bulunmaktadır.
  - `api.ts` içindeki `CreateOrderInput` şeması, istemcideki gerçek çoklu ödeme (`payments`), kupon/iskonto, tur (`batches`), iade ve iş günü yapılarını dahi karşılamamaktadır.
- **Hüküm: FastAPI / SQLite katmanı paketli masaüstü uygulamasında tamamen ATILDIR (Unused).** Uygulamanın tek ve gerçek veri saklama noktası `localStorage`'dır.

### 2.2. Kalıcı Veri Anahtarları, Şemaları ve Erişim Yolları

| Anahtar (Key) | İçerik ve Şema | Yazan (Writer) | Okuyan (Reader) | Yıkıcı / Tehlikeli Yol (Destructive Path) |
|---|---|---|---|---|
| `businessDays` | `BusinessDay[]` (id, status, openedAt, closedAt, openingCash, countedCash, expectedCash, report, enteredZ, zDifference) | `App.tsx` (L318), `CloseDayModal.tsx` | `App.tsx` (L305), `businessDay.ts` | **`ErrorBoundary.tsx` (L33)**: `removeItem('businessDays')`<br>**`App.tsx` (L607, L1398)**: `removeItem` |
| `completedOrders` | `CompletedOrder[]` (id, orderNumber, tableId, items, totals, payments, date, cashier, businessDayId, cancelled, reopened) | `App.tsx` (L301, L1255, L2054, L2109) | `App.tsx` (L296), `businessDay.ts`, `ReportsModal.tsx` | **`App.tsx` (L606, L1393)**: `removeItem('completedOrders')` (Korumasız sıfırlama) |
| `tables` | `Table[]` (id, name, category, status, cart: `CartItem[]`, payments: `PartialPayment[]`, discountRate, note, customerName) | `App.tsx` (L290, L1457, L1574, L1744) | `App.tsx` (L285), `TableLayout.tsx`, `CartPanel.tsx` | **`App.tsx` (L605)**: `removeItem('tables')`<br>Unguarded `JSON.parse` (L286) |
| `menuProducts` | `Product[]` (id, name, category, price, description, badge, image_url, optionGroups) | `App.tsx` (L364), `ProductManager.tsx` | `App.tsx` (L351), `ProductExplorer.tsx` | **`App.tsx` (L346)**: Katalog versiyon uyuşmazlığında otomatik silme! |
| `appSettings` | `AppSettings` (brandName, cashierName, taxRate, posZCutoffTime, defaultCashierRole, soundEnabled, etc.) | `App.tsx` (L125), `SettingsModal.tsx` | `App.tsx` (L100), `permissions.ts` | `App.tsx` (L609): `removeItem('appSettings')` |
| `refunds` | `Refund[]` (id, businessDayId, tableId, amount, reason, paymentMethod, refundedAt, refundedBy, items) | `src/lib/businessDay.ts` (L31), `App.tsx` (L1558, L1622) | `businessDay.ts` (L19), `ReportsModal.tsx` | `App.tsx` (L611): `removeItem('refunds')` |
| `activityLogs` | `ActivityLogItem[]` (id, timestamp, type, userName, userRole, details, amount, reason) | `src/lib/activityLog.ts` (L58) | `activityLog.ts`, `ActivityLogsView.tsx` | `App.tsx` (L610): `removeItem('activityLogs')` |
| `appUsers` | `User[]` (id, username, fullName, role, pinHash, passwordHash, active, mustChangePassword) | `src/lib/auth.ts` (L75) | `auth.ts` (L38), `UserManagementView.tsx` | `App.tsx` sıfırlaması veya bozulma |
| `appSession` | `Session` (userId, token, role, expiresAt, loginAt, username, fullName) | `src/lib/auth.ts` (L137, L200) | `auth.ts`, `App.tsx` | Session timeout / geçersiz kılınma |
| `initialWaitstaffPins` | `WaitstaffPinRecord[]` | `src/lib/auth.ts` | `auth.ts` | Manuel silinme |
| `waitstaffPermissionTemplate` | `Record<PermissionKey, boolean>` | `src/lib/permissions.ts` (L97) | `permissions.ts` (L88) | Bozulma durumunda varsayılana dönme |
| `userPermissionOverrides` | `Record<string, Record<PermissionKey, boolean>>` | `src/lib/permissions.ts` (L134) | `permissions.ts` (L125) | Bozulma |
| `customAppLogo` | Base64 PNG/JPEG String | `LogoSettingsModal.tsx` (L35) | `AppLogo.tsx` | Yüksek depolama boyutu (Quota risk!) |
| `menuCatalogVersion` | `string` ("2026_10_23_new_menu_v1") | `App.tsx` (L348) | `App.tsx` (L344) | Değiştiğinde tüm menüyü sıfırlar |

---

## 3. Risk Değerlendirme ve Sıralaması (Risk Assessment Matrix)

### [CRITICAL] 1. ErrorBoundary Üzerinden Z Raporu ve İş Günü Kaybı
- **Konum:** `src/components/ErrorBoundary.tsx` (satır 31-36).
- **Mekanizma:** Bir React bileşeni render esnasında hata verdiğinde ekrana "Günü Sıfırla & Yeniden Dene" butonu çıkmakta ve `localStorage.removeItem('businessDays')` çalışmaktadır.
- **Etki:** Cafe sahibinin aylar boyunca biriken tüm kapanmış iş günleri, resmi Z raporları ve mali özetleri tek bir tıkla geri getirilemeyecek şekilde yok olmaktadır.

### [CRITICAL] 2. Menü Katalog Güncellemesinde Kullanıcı Ürünlerinin Silinmesi
- **Konum:** `src/App.tsx` (satır 344-350).
- **Mekanizma:** `menuCatalogVersion` sabitindeki bir değişiklik tespit edildiğinde uygulama `localStorage.removeItem('menuProducts')` çalıştırmaktadır.
- **Etki:** Cafe personelinin sisteme girdiği yeni ürünler, güncellediği özel fiyatlar ve reçeteler sessizce silinmekte, varsayılan sabit menüye dönülmektedir.

### [CRITICAL] 3. Korumasız JSON.parse Nedeniyle Kalıcı Başlangıç Çökmesi (Crash-Loop)
- **Konum:** `src/App.tsx` (satır 285-286: `tables`, satır 296-297: `completedOrders`).
- **Mekanizma:** `localStorage.getItem('tables')` ve `localStorage.getItem('completedOrders')` değerleri `try-catch` bloğu olmadan doğrudan `JSON.parse` edilmektedir.
- **Etki:** Bilgisayar aniden kapandığında veya depolamada tek bir bozuk karakter oluştuğunda, uygulama açılışta `SyntaxError` fırlatmakta; ErrorBoundary devreye girse dahi kullanıcı kurtarma yapamamakta veya açılış döngüsünde kilitlenmektedir.

### [CRITICAL] 4. Reopen (Adisyon Geri Açma) Nedeniyle Mükerrer Ciro ve Z Raporu Bozulması
- **Konum:** `src/App.tsx` (satır 1728-1765) & `src/lib/businessDay.ts` (satır 206, 321).
- **Mekanizma:** Kapatılmış bir adisyon geri açıldığında sipariş `reopened: true` olarak işaretlenmekte ve sepet masaya aktarılmaktadır. Fakat `businessDay.ts` ciro ve kart dökümü hesaplarken yalnızca `!o.cancelled` filtresi uygulamakta; `!o.reopened` filtresi uygulamamaktadır.
- **Etki:** Geri açılan masa tekrar tahsil edildiğinde aynı satış hem eski `completedOrders` kaydı hem de yeni `completedOrders` kaydı üzerinden iki defa toplanmakta, gün sonu cirosu ve POS Z farkları hatalı çıkmaktadır.

### [HIGH] 5. Sahte Yedekleme Güvencesi (Yalnızca Ayarların Dışa Aktarılması)
- **Konum:** `src/components/SettingsModal.tsx` (satır 63-71).
- **Mekanizma:** Kullanıcıya "Ayarları Dışa Aktar (JSON)" butonu sunulmakta, ancak bu dosya yalnızca `AppSettings` nesnesini içermektedir.
- **Etki:** İşletme sahibi tüm sistemin yedeğini aldığını sanmakta; disk arızasında satış geçmişi, Z raporları, borçlu/açık masalar ve kullanıcı şifreleri kaybolmaktadır.

### [HIGH] 6. Denetimsiz ve Ön-Yedeksiz Sıfırlama Yolları
- **Konum:** `src/App.tsx` (satır 604-617: `handleResetData`, satır 1384-1412: `handleClearReports`).
- **Mekanizma:** Kullanıcı veya yetkili bir butona bastığında tüm veriler silinmektedir.
- **Etki:** Yanlışlıkla yapılan tıklamalarda veya kötü niyetli personelde veriyi geri getirecek bir pre-restore / pre-reset snapshotsı bulunmamaktadır.

### [HIGH] 7. localStorage Depolama Kotası ve Sessiz Yazma Hataları
- **Konum:** `src/components/LogoSettingsModal.tsx` (L35) ve `src/App.tsx` `useEffect` storage sync.
- **Mekanizma:** Logo base64 olarak depolanmakta (1-2 MB tutabilir). `localStorage` 5-10 MB ile sınırlıdır.
- **Etki:** Limit aşıldığında `QuotaExceededError` fırlatılır. `useEffect` içindeki unhandled hatalar nedeniyle bellek ile disk birbirinden kopar, son satışlar kaydedilmez.

### [MEDIUM] 8. Kapanışta Masadaki Kısmi Ödemelerin Durumu (Partial Payments)
- **Konum:** `src/components/CloseDayModal.tsx` (L239-240) ve `src/lib/businessDay.ts` (L284-312).
- **Mekanizma:** `CloseDayModal`, açık masalar varken günün kapatılmasını engellemektedir (`hasOpenTables`). Ancak açık masalarda gün içinde alınmış kısmi nakit/kart tahsilatları (`p.businessDayId === openDay.id`) bulunabilir.
- **Kural:** Açık masadaki kısmi tahsilatlar o günün kasasına ve Z raporuna girer mi? Kuralın netleştirilmesi ve masalar kapatılmadan günün kapatılamayacağı garantisinin korunması gerekir.

### [MEDIUM] 9. Saat Dilimi ve 23:57 POS Gece Yarısı Sınırları (Europe/Istanbul)
- **Konum:** `src/lib/businessDay.ts` (`createIstanbulDate`, `getIstanbulParts`, `calculateDayCardBreakdown`).
- **Mekanizma:** POS Z kesim saati (23:57) ve gece yarısı devirleri Türkiye saatine göre çalışmaktadır.
- **Etki:** Gece yarısı 23:56 - 00:05 arasında yapılan satışların gün bağı kopmamalıdır. Gün açık olduğu sürece tüm satışlar o iş gününe aittir.

### [LOW] 10. Kuruş Yuvarlama ve Floating Point Sapmaları
- **Konum:** `src/lib/format.ts` (`roundCurrency`).
- **Mekanizma:** İskonto ve KDV kırılımlarında `(price * qty * discount)` hesaplarında kuruş yuvarlama yapılmazsa toplamda 1 kuruşluk kuruş farkları oluşabilmektedir.

---

## 4. Çözüm ve Kalıcılık Sınırı Mimarisi (Persistence Boundary Design)

`localStorage` mimarisi küçük ve orta ölçekli yerel cafe operasyonu için yeterlidir, ancak **doğrudan kontrolsüz okuma/yazma yerine kurumsal bir Kalıcılık Sınırı (Persistence Layer)** ile sarılmalıdır:

```
[UI / React Components]
       │
       ▼
[Storage Repository Boundary (src/lib/storage/)]
  ├─ 1. Schema Validation (Hafif, tip güvenli çalışma zamanı doğrulama)
  ├─ 2. Atomic Writes & In-Memory Fallback (QuotaExceeded ve IO güvenliği)
  ├─ 3. Safe Parsing & Quarantine (Bozuk veriyi silmeden ham yedeğe alma)
  ├─ 4. Non-Destructive Migrations (Menü ve şema güncellemelerinde veri koruma)
  ├─ 5. Tam Sistem Yedekleme & Geri Yükleme (Format v1, Checksum/HMAC, Pre-Restore Snapshot)
       │
       ▼
[Browser / Electron localStorage & Recovery Storage]
```

---

## 5. Önerilen Test Mimarisi ve Katmanları

1. **Birim & İnvaryant Testleri (Unit & Financial Invariants):**
   - Para hesaplamaları, kuruş duyarlılığı, iskonto kombinasyonları, KDV ve net gelir tutarlılığı.
   - İş günü açma/kapama mantığı, tek açık gün kuralı, immutable snapshot koruması.
   - Europe/Istanbul saat dilimi ve 23:57 / gece yarısı geçişleri.
2. **Kalıcılık, Bozulma ve Yedekleme Testleri (Storage & Recovery):**
   - Tam durum round-trip dışa aktarma / geri yükleme doğrulama.
   - Bozuk JSON simülasyonu, çökme koruması, karantinaya alma.
   - Kota aşımı (QuotaExceeded) durumunda önceki verinin korunması.
   - Menü katalog sürüm geçişinde kullanıcı verisinin silinmediğinin kanıtlanması.
3. **Uçtan Uca Kullanıcı Yolculukları (Integration / Journey Tests):**
   - İlk kurulum → Yönetici girişi → Gün açma → Masa siparişi → Parçalı ödeme → Gün kapatma → Yeniden başlatma → Rapor doğrulama.
   - Reopen adisyon süreci ve mükerrer satış oluşmadığının doğrulanması.
   - İade işleminin gün cirosuna ve ödeme yöntemlerine tek defalık yansıması.
   - Yetkisiz personelin yetki kısıtlamalarına tam uyumu.

