# ECO COFFEE POS — Standalone Windows (.exe) Kurulum Rehberi

## 📋 Bu Rehber Ne İçin?
Bu rehber, Eco Coffee POS uygulamasını kafedeki AVAPOS AVA1561 bilgisayarına **tek tıkla kurulan Standalone Windows (.exe) uygulaması** olarak kurmak için hazırlanmıştır.

**Önemli:** Uygulama tamamen **offline** çalışır ve çalıştığı bilgisayarda **Python, Node.js veya herhangi bir ek yazılım kurulumu GEREKTİRMEZ.**

---

## 📦 Kurulum Adımları (POS Bilgisayarında)

### Adım 1: `.exe` Dosyasını İndirin
1. GitHub Releas sayfasından (`https://github.com/gokkayataha727-ai/ECO/releases`) `eco-coffee-pos_1.0.0_x64-setup.exe` (veya `.exe` dosyasını) indirin veya USB bellek ile POS bilgisayarına kopyalayın.

### Adım 2: Kurulumu Yapın
1. `.exe` dosyasına çift tıklayın.
2. Kurulum sihirbazı uygulamayı `C:\Program Files\ECO COFFEE POS` klasörüne otomatik kuracak ve masaüstüne kısayol ekleyecektir.

### Adım 3: Çalıştırın
1. Masaüstündeki **ECO COFFEE POS** simgesine çift tıklayın.
2. Uygulama bağımsız pencere ve veritabanı (Rust + SQLite) ile anında açılacaktır.

---

## 📊 Sistem Bilgileri

| Özellik | Değer |
|---------|-------|
| POS Model | AVAPOS AVA1561 (Siyah) |
| İşletim Sistemi | Windows 10 / 11 (64-bit) |
| Altyapı | Tauri 2.0 (Rust Backend + React Frontend) |
| Ek Gereksinim | YOK (Python / Node gerekmez) |
| Veritabanı | SQLite (Lokal dosya: AppData) |
