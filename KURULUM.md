# ECO COFFEE POS — Standalone Windows (.exe) Kurulum Rehberi

## 📋 Bu Rehber Ne İçin?
Bu rehber, Eco Coffee POS uygulamasını kafedeki AVAPOS AVA1561 ve tüm Windows (10/11 64-bit) bilgisayarlara **tek tıkla kurulan Standalone Windows (.exe) uygulaması** olarak yüklemek için hazırlanmıştır.

**Önemli:** Uygulama tamamen **offline** çalışır ve çalıştığı bilgisayarda **Python, Node.js, WebView2 veya herhangi bir ek yazılım kurulumu GEREKTİRMEZ.**

---

## 📦 Windows Kurulum Adımları (POS Bilgisayarında)

### Adım 1: `.exe` Dosyasını İndirin / Kopyalayın
1. Projenin `release/` klasöründe veya GitHub Release sayfasında yer alan `Eco Coffee POS-Setup-1.1.1.exe` dosyasını USB bellek ile POS bilgisayarına aktarın.

### Adım 2: Kurulumu Yapın
1. `Eco Coffee POS-Setup-1.1.1.exe` dosyasına çift tıklayın.
2. Kurulum sihirbazı uygulamayı otomatik olarak kuracak ve masaüstü ile Başlat menüsüne simgeli kısayol ekleyecektir.

### Adım 3: Çalıştırın
1. Masaüstündeki **Eco Coffee POS** simgesine çift tıklayın.
2. Uygulama tam ekran Kiosk modunda hızlıca açılacaktır.
3. Sağ üst köşedeki **Güç (Çıkış)** butonunu kullanarak uygulamayı güvenle kapatabilir veya **Simge Durumuna Küçült** butonu ile alta alabilirsiniz.

---

## 📊 Sistem Özellikleri & Avantajları

| Özellik | Açıklama / Değer |
|---------|------------------|
| POS Model Uyumu | AVAPOS AVA1561 ve tüm Windows 10/11 (64-bit) PC'ler |
| Altyapı | Electron 33 + React 19 (Offline LocalStorage Engine) |
| Çapraz Platform Yükleme | Native `loadFile` standardı ile Windows dosya yollarında %100 sorunsuz açılış |
| Çift Çalıştırma Koruması | Single-Instance Lock ile uygulamanın birden fazla açılması engellenir |
| Ek Gereksinim | **YOK** (Node.js, Python, WebView2 gerekmez) |

---

## 🛠️ Geliştiriciler İçin Windows Installer (.exe) Üretme

Mac veya Windows bilgisayarınızda `.exe` kurulum dosyasını derlemek için terminalde şu komutu çalıştırmanız yeterlidir:

```bash
npm run electron:build
```

Derlenen kurulum dosyası `release/Eco Coffee POS-Setup-1.1.1.exe` olarak hazır olur.

