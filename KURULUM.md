# ECO COFFEE POS — AVAPOS AVA1561 Kurulum Rehberi

## 📋 Bu Rehber Ne İçin?
Bu rehber, Eco Coffee POS uygulamasını kafedeki AVAPOS AVA1561 bilgisayarına 
**lokal olarak** kurmak ve çalıştırmak için adım adım talimatlar içerir.

**Uygulama tamamen offline çalışır** — internet bağlantısı gerekmez.

---

## 🔧 Ön Gereksinimler (Tek Seferlik Kurulum)

### 1. Python 3.10+ Kurulumu
POS bilgisayarında (Windows 10):

1. https://www.python.org/downloads/ adresine gidin
2. "Download Python 3.12" butonuna tıklayın
3. İndirilen `.exe` dosyasını çalıştırın
4. ⚠️ **"Add Python to PATH" kutucuğunu mutlaka işaretleyin!**
5. "Install Now" tıklayın

**Doğrulama:**
```
Win+R → cmd → python --version
```
`Python 3.12.x` gibi bir çıktı görmelisiniz.

### 2. Python Paketleri
Komut Satırı (cmd) açın:
```
cd C:\eco-coffee-pos\backend
pip install fastapi uvicorn sqlalchemy pydantic python-multipart python-dateutil
```

---

## 📦 Uygulama Kurulumu

### Adım 1: Dosyaları POS'a Kopyalayın
Mac'ten USB flash belleğe şu klasörü kopyalayın:
```
ecodemo1/
```

POS bilgisayarında USB'yi takın ve tüm `ecodemo1` klasörünü şuraya kopyalayın:
```
C:\eco-coffee-pos\
```

### Adım 2: İlk Çalıştırma Testi
1. `C:\eco-coffee-pos\` klasörüne gidin
2. `ECO_COFFEE_BASLAT.bat` dosyasına çift tıklayın
3. Siyah konsol penceresi açılacak ve uygulama tarayıcıda tam ekran açılacak

### Adım 3: Otomatik Başlangıç (İsteğe Bağlı)
Windows açıldığında uygulamanın otomatik başlaması için:
1. `OTOMATIK_BASLANGIC_EKLE.bat` dosyasına çift tıklayın
2. Bu, Windows Başlangıç klasörüne kısayol ekler

### Adım 4: Müşteri Ekranı (İkinci Monitör)
İkinci ekranda müşteri görünümünü açmak için:
1. Windows Ayarları → Ekran → İkinci ekranı "Genişlet" moduna alın
2. `MUSTERI_EKRANI.bat` dosyasına çift tıklayın

---

## 📂 Dosya Yapısı
```
C:\eco-coffee-pos\
├── ECO_COFFEE_BASLAT.bat          ← Ana başlatma scripti
├── MUSTERI_EKRANI.bat             ← Müşteri ekranı scripti
├── OTOMATIK_BASLANGIC_EKLE.bat   ← Windows başlangıcına ekle
├── dist/                          ← Derlenmiş frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── customer-display.html
│   └── assets/
├── backend/
│   ├── main.py                    ← Python sunucu
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── eco_coffee.db              ← SQLite veritabanı (tüm veriler)
│   └── uploads/                   ← Ürün görselleri
└── ...
```

---

## 🔄 Güncelleme Nasıl Yapılır?

1. Mac'te değişiklikleri yapın
2. `npm run build` ile frontend'i derleyin
3. Şu dosya/klasörleri USB ile POS'a aktarın:
   - `dist/` klasörü (yeni frontend build)
   - `backend/` klasörü (değişiklik varsa)
4. POS'ta uygulamayı yeniden başlatın

**Veritabanınız korunur** — `backend/eco_coffee.db` dosyası güncelleme sırasında üzerine yazılmaz.

---

## 🛠️ Sorun Giderme

### ❌ "Python bulunamadı" hatası
→ Python kurulurken "Add to PATH" işaretlenmemiş olabilir.
→ Çözüm: Python'u kaldırıp yeniden kurun, "Add to PATH" kutucuğunu işaretleyin.

### ❌ Sayfa açılmıyor / boş ekran
→ Konsol penceresinde hata mesajlarını kontrol edin.
→ `dist/` klasörünün mevcut olduğundan emin olun.
→ `npm run build` çalıştırılmış mı?

### ❌ Veritabanı boş / ürünler görünmüyor
→ `backend/eco_coffee.db` dosyasının mevcut olduğundan emin olun.
→ Mac'teki veritabanını USB ile POS'a kopyalayın.

### ❌ Kiosk modundan çıkamıyorum
→ `Alt+F4` veya `Ctrl+W` ile kapatabilirsiniz.
→ Veya `Ctrl+Alt+Delete` → Görev Yöneticisi → Edge/Chrome'u sonlandırın.

### ❌ Müşteri ekranı yanlış monitörde açılıyor
→ `MUSTERI_EKRANI.bat` dosyasındaki `--window-position=1920,0` değerini değiştirin.
→ Ana ekranın çözünürlüğüne göre: 1366 veya 1920 yapın.

---

## 📊 Sistem Bilgileri

| Özellik | Değer |
|---------|-------|
| POS Model | AVAPOS AVA1561 (Siyah) |
| İşletim Sistemi | Windows 10 |
| Ana Ekran | 15.6" Dokunmatik |
| İkinci Ekran | Müşteri Ekranı |
| Veritabanı | SQLite (lokal dosya) |
| Sunucu | Python FastAPI (localhost:8000) |
| Tarayıcı | Microsoft Edge (kiosk modu) |
