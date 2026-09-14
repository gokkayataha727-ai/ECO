# Eco Coffee POS - Kasa & Restoran Otomasyon Sistemi

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
