# LEMOON KAFE POS — Standalone Windows (.exe) Kurulum Rehberi

## 📋 Bu Rehber Ne İçin?
Bu rehber, LEMOON KAFE POS uygulamasını kafedeki AVAPOS AVA1561 ve tüm Windows (10/11 64-bit) bilgisayarlara **tek tıkla kurulan Standalone Windows (.exe) uygulaması** olarak yüklemek için hazırlanmıştır.

**Önemli:** Uygulama tamamen **offline** çalışır ve çalıştığı bilgisayarda **Python, Node.js, WebView2 veya herhangi bir ek yazılım kurulumu GEREKTİRMEZ.**

---

## 📦 Windows Kurulum Adımları (POS Bilgisayarında)

### Adım 1: `.exe` Dosyasını İndirin / Kopyalayın
1. Projenin GitHub Actions / Release sayfasından veya `release/` klasöründen `LEMOON KAFE POS-Setup-1.4.0.exe` dosyasını indirin (veya USB bellek ile POS bilgisayarına aktarın).

### Adım 2: Kurulumu Yapın
1. `LEMOON KAFE POS-Setup-1.4.0.exe` dosyasına çift tıklayın.
2. Kurulum sihirbazı uygulamayı otomatik olarak kuracak ve masaüstü ile Başlat menüsüne simgeli kısayol ekleyecektir.

### Adım 3: Çalıştırın
1. Masaüstündeki **LEMOON KAFE POS** simgesine çift tıklayın.
2. Uygulama tam ekran Kiosk modunda hızlıca açılacaktır.
3. Sağ üst köşedeki **Güç (Çıkış)** butonunu kullanarak uygulamayı güvenle kapatabilir veya **Simge Durumuna Küçült** butonu ile alta alabilirsiniz.

---

## 💻 Alternatif: Windows Bilgisayarda Kaynak Koddan Çalıştırma (Geliştirici Modu)

Eğer Windows bilgisayarınızda projeyi kaynak koddan çalıştırmak veya geliştirmek isterseniz:

### 1. Gereksinimler
- **Node.js**: [nodejs.org](https://nodejs.org/) adresinden LTS sürümünü kurun.
- **Git**: [git-scm.com](https://git-scm.com/) adresinden kurun.
- *(İsteğe bağlı)* Python 3.10+: Eğer FastAPI SQLite backend'i ile çalışacaksanız.

### 2. Depoyu Klonlayın
```bash
git clone https://github.com/gokkayataha727-ai/ECO.git
cd ECO
```

### 3. Bağımlılıkları Yükleyin
```bash
npm install
```

### 4. Masaüstü Uygulaması (Electron) Olarak Çalıştırma
```bash
npm run electron:dev
```

### 5. Sadece Tarayıcıda (Web) Çalıştırma
```bash
npm run dev
```

---

## 📊 Sistem Özellikleri & Avantajları

| Özellik | Açıklama / Değer |
|---------|------------------|
| POS Model Uyumu | AVAPOS AVA1561 ve tüm Windows 10/11 (64-bit) PC'ler |
| Altyapı | Electron 33 + React 19 (Offline LocalStorage Engine) |
| Çapraz Platform Yükleme | Native `loadFile` standardı ile Windows dosya yollarında %100 sorunsuz açılış |
| Çift Çalıştırma Koruması | Single-Instance Lock ile uygulamanın birden fazla açılması engellenir |
| Ek Gereksinim | **YOK** (Kurulum sihirbazı .exe kullanıldığında Node.js, Python, WebView2 gerekmez) |

---

## 🛠️ Windows Installer (.exe) Üretme

Windows bilgisayarınızda veya Mac'te `.exe` kurulum dosyasını derlemek için terminalde şu komutu çalıştırmanız yeterlidir:

```bash
npm run electron:build
```

Derlenen kurulum dosyası `release/LEMOON KAFE POS-Setup-1.4.0.exe` olarak hazır olur.

