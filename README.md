# LEMOON KAFE POS - Kasa & Restoran Otomasyon Sistemi

Modern, hızlı ve dokunmatik ekran dostu cafe/restoran kasa arayüzü ve masa yönetim sistemi.

## Çalıştırma (Tarayıcı)

```bash
npm install
npm run dev
```

## Electron ile Çalıştırma (Masaüstü Uygulaması)

```bash
npm install
npm run electron:dev
```

## Üretim Derlemesi (Windows Installer)

```bash
npm run electron:build
```

Bu komut `release/` klasörüne NSIS installer (.exe) dosyası üretir.

> **Not:** Electron kendi Chromium tarayıcısını içerir. Hedef bilgisayarda WebView2 veya başka bir runtime kurulumu gerekmez.

## Sistem Özellikleri

- **Masa & Sipariş Yönetimi:** Masalar arası canlı sipariş takibi, adisyon oluşturma ve masa transfer/birleştirme.
- **Ürün & Menü Yönetimi:** Ürün ekleme, fiyat güncelleme, kategori ve rozet yönetimi, varyasyon/boyut seçenekleri.
- **Kasa & Ödeme:** Nakit, Kart ve QR ile hızlı ödeme tahsilatı, indirim ve parçalı ödeme yönetimi.
- **Raporlama:** Günlük, haftalık ve aylık ciro, en çok satan ürünler ve ödeme tipi dağılımı analizleri.
- **Müşteri Ekranı:** İkinci monitörde müşteri sepetini gösteren ayrı pencere (Electron).

## Teknolojiler

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Masaüstü | Electron |
| Backend | FastAPI (Python) |
| Paketleme | electron-builder (NSIS) |

## Güvenlik ve Chrome "Şifrenizi Değiştirin / Güvenliği İhlal Edildi" Uyarısı Rehberi

### 1. Uyarının Kök Neden Analizi (Root Cause)
Google Chrome veya Chromium tabanlı tarayıcılarda giriş yapıldığında karşılaşılan *"Şifrenizi değiştirin — Bu şifre bir veri ihlalinde ifşa oldu"* uyarısı, **LEMOON KAFE POS uygulamasındaki bir güvenlik açığı veya yazılımsal hata değildir**.

Bu mekanizma, Google Chrome'un dahili **Google Şifre Yöneticisi (Google Password Manager)** servisinin bir özelliğidir:
- Kullanıcı tarayıcıda bir form doldurup gönderdiğinde, tarayıcı girilen şifrenin hash özetini Google'ın global olarak bilinen ve internete sızdırılmış (HaveIBeenPwned vb.) şifreler veritabanıyla eşleştirir.
- `admin`, `123456`, `password`, `1234` gibi yaygın veya varsayılan parolalar dünya çapında milyarlarca kez sızdırıldığı için Chrome bu şifreleri "güvenliği ihlal edilmiş" olarak işaretler ve yerel işletim sistemi/tarayıcı bildirim kutusu fırlatır.
- Tarayıcı motorunun dahili şifre denetim heuristiği doğrudan tarayıcı çekirdeğinde çalıştığından, web uygulamaları tek başına yalnızca istemci kodları ile tarayıcının yerleşik güvenlik uyarısını %100 oranında bastıramaz.

### 2. Kod Düzeyinde Alınan Önlemler
LEMOON KAFE POS v1.4 sürümünde bu durumun önüne geçmek için kapsamlı önlemler alınmıştır:

1. **Varsayılan ve Sabit Şifrelerin Kaldırılması:**
   - Giriş ekranındaki "Varsayılan Giriş Bilgileri" ve `placeholder="admin"` gibi tarayıcıyı tetikleyen tüm ipuçları kaldırılmıştır.
   - Kod tabanındaki tüm sabit kodlanmış şifre baypasları temizlenmiştir.
   - Eski `garson` hesabı güvenli bir şekilde pasife (`status: 'inactive'`) alınmış ve yerine güvenli, rastgele 4 haneli benzersiz PIN'lere sahip `Garson 1` - `Garson 4` kullanıcıları tanımlanmıştır.

2. **Güçlü Şifre Politikası (En az 10 karakter, Karmaşık):**
   - Yönetici kullanıcılar için en az 10 karakter uzunluğunda, hem harf hem rakam içeren ve yaygın şifre kara listesinde (`admin`, `123456`, `lemoon` vb.) yer almayan güçlü şifre zorunluluğu getirilmiştir.
   - Sisteme ilk girişte varsayılan şifre kullanımını engelleyen `Zorunlu Şifre Değiştirme` akışı devreye alınmıştır.

3. **Giriş Alanı Maskelemesi:**
   - Chrome'un otomatik doldurma ve şifre dinleyicisini yanıltmak için şifre giriş alanında `type="text"` ile birlikte CSS `-webkit-text-security: disc` maskelemesi ve `autoComplete="off"` kullanılmıştır.
   - Şifre oluşturma ekranlarında `autoComplete="new-password"` tanımlanmıştır.

### 3. POS Cihazında Yapılması Gereken Ayarlar (1 Seferlik)
Web tarayıcısı (Chrome) üzerinden çalışan POS terminallerinde bu uyarının tamamen sonlanması için şu adımları izleyin:

1. **Daha Önce Kaydedilen Zayıf Şifreyi Silin:**
   - Chrome adres çubuğuna `chrome://password-manager/passwords` (veya `chrome://settings/passwords`) yazıp Enter'a basın.
   - `localhost` veya POS IP adresiniz için kaydedilmiş olan eski `admin` şifresini bulun ve **Sil (Çöp kutusu)** butonuna tıklayın.

2. **Güvenlik İhlali Uyarılarını Kapatma (Kiosk / POS Cihazı):**
   - `chrome://password-manager/settings` sayfasına gidin.
   - **"Şifreler bir veri ihlalinde açığa çıktığında uyar"** (Password leak detection) seçeneğini kapatın.
   - İsteğe bağlı olarak POS ekranında şifre kaydetme kutusunun çıkmaması için **"Şifrelerin kaydedilmesini öner"** seçeneğini de devre dışı bırakabilirsiniz.

3. **Electron Masaüstü Sürümünü Kullanma:**
   - Uygulamayı `npm run electron:dev` veya Windows için derlenen masaüstü uygulaması (.exe) ile çalıştırdığınızda, Electron içerisinde Google hesap servisleri ve Google Şifre Yöneticisi bulunmadığı için bu tür tarayıcı uyarıları **hiçbir zaman çıkmaz**.

## Proje Yapısı

```
├── electron/          # Electron ana süreç dosyaları
│   ├── main.js        # Ana pencere ve IPC yönetimi
│   └── preload.js     # Güvenli IPC bridge
├── src/               # React frontend kaynak kodu
├── backend/           # FastAPI backend
├── build/icons/       # Uygulama ikonları
├── dist/              # Vite build çıktısı
└── release/           # Electron-builder çıktısı (.exe)
```
