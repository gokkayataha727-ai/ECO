# LEMOON KAFE POS — Canlıya Geçiş Öncesi Güvenlik ve Kabul Kontrol Listesi

Bu kılavuz, teknik uzmanlığı olmayan cafe işletmecileri ve yöneticileri için hazırlanmıştır. Tek bir Windows bilgisayar üzerinde çalışan LEMOON KAFE POS sisteminin veri kaybı yaşamadan güvenle işletilmesini sağlar.

---

## 1. Veriler Nerede Saklanır? (Windows POS Bilgisayarı)

- **Birincil Veri Tabanı:** Paketlenen POS uygulamasının tüm verileri (satışlar, masalar, iş günleri, Z raporları, kullanıcılar ve menü) bilgisayarınızdaki Electron depolama alanında tutulur:
  ```text
  C:\Users\<Kullanici_Adi>\AppData\Roaming\com.ecocoffee.pos\Local Storage\leveldb\
  ```
- **Önemli Hatırlatma:** Bilgisayar formatlanacaksa veya sıfırlanacaksa, bu klasör silinir! Mutlaka aşağıda anlatılan **Tam Sistem Yedeği (JSON)** indirilip harici bir USB belleğe veya bulut sürücüsüne kopyalanmalıdır.
- **Python / SQLite:** Sistem tamamen yerel/offline çalışmaktadır; arka planda harici bir Python sunucusu çalıştırmanıza gerek yoktur.

---

## 2. Günlük Rutin Yedekleme ve Doğrulama Prosedürü

Her akşam gün sonu işlemi tamamlandıktan sonra şu 3 adımı uygulayınız (toplam 30 saniye sürer):

1. **Yedek Alın:**
   - Ekranın sağ üstündeki dişli çark simgesine tıklayarak **Ayarlar** penceresini açın.
   - Soldaki sekmelerden **Sistem** sekmesini seçin.
   - **"Tam Sistem Yedeği İndir (JSON)"** butonuna tıklayın.
   - İndirilen dosya `lemoon_pos_tam_yedek_YYYY-MM-DD_HHMM.json` adıyla bilgisayarınızın `İndirilenler (Downloads)` klasörüne kaydedilir.
2. **Yedeği Harici Diske Alın:**
   - İndirilen JSON dosyasını kasanın arkasına takılı bir **USB Belleğe** veya işletmenin Google Drive / OneDrive klasörüne kopyalayın.
3. **Dünkü Raporu Doğrulayın:**
   - Sabah kasayı açtığınızda **Raporlar** ekranına girin.
   - Sol taraftaki listeden dünün tarihine tıklayın.
   - Kapanış nakiti, POS Z tutarı ve toplam cironun eksiksiz görüntülendiğini teyit edin.

---

## 3. Beklenmeyen Durumlarda Ne Yapılmalı? (Acil Durum Eylem Planı)

### Senaryo A: Elektrik Kesintisi veya Bilgisayarın Aniden Kapanması
1. Bilgisayarı ve POS uygulamasını tekrar açın.
2. Uygulama açılışta verileri otomatik kontrol eder.
3. Eğer masalarda açık siparişler varsa, siparişleriniz ve masalarınız en son haliyle masada kalmaya devam eder.
4. Açık iş gününüz (`businessDay`) bozulmadan açık kalır; yeniden gün açmanıza gerek yoktur, doğrudan satışa devam edebilirsiniz.

### Senaryo B: Ekranda "Beklenmeyen Bir Hata Oluştu" (ErrorBoundary) Uyarısı
1. Panik yapmayın; satışlarınız veya Z raporlarınız silinmemiştir.
2. Ekranda beliren **"Güvenli Kurtarma (Veriler Korunur)"** veya **"Sayfayı Yenile"** butonuna tıklayın.
3. Uygulama iş kayıtlarınızı silmeden güvenli bir şekilde sayfayı yeniden başlatacaktır.
4. *Asla geçmiş raporları silmeyiniz.*

### Senaryo C: Yanlışlıkla "Tüm Verileri Sıfırla" veya "Raporları Sıfırla" Tıklanması
- Sistem, sıfırlama butonlarına basıldığında **otomatik bir güvenlik yedeği** (`storage_pre_reset_backup`) alır.
- Yanlışlıkla silinirse hemen Ayarlar > Sistem penceresinden **"Önceki Yedeğe Dön (Geri Al)"** butonuna tıklayarak saniyeler içinde tüm satışları geri getirebilirsiniz.

### Senaryo D: Disk Dolu veya Depolama Hatası Uyarısı
- Uygulama, Windows diski dolduğunda satışların hafızada kalmasını sağlar ve ekrana uyarı verir.
- Windows `C:\` sürücüsünde en az 2 GB boş alan bulunduğundan emin olun.

---

## 4. Haftalık Güvenli Geri Yükleme Tatbikatı (Restore Drill)

Yedeklerinizin gerçekten çalıştığını teyit etmek için haftada bir kez şu tatbikatı yapınız:

> [!CAUTION]
> Tatbikatı asla çalışan canlı kasa saatinde yapmayınız! Sabah açılıştan önce veya akşam kapanıştan sonra yapınız.

1. Güncel bir **Tam Sistem Yedeği** indirin.
2. Ayarlar > Sistem sekmesinden **"Yedekten Geri Yükle (JSON)"** butonuna tıklayın.
3. İndirdiğiniz JSON dosyasını seçin.
4. Ekranda beliren yeşil doğrulama kutusunda:
   - Dosya tarihi ve saatinin doğru olduğunu,
   - Satış kaydı ve iş günü sayısının doğruluğunu kontrol edin.
5. **"Evet, Yedeği Geri Yükle"** butonuna tıklayın. Sayfa yenilenir ve tüm kayıtların başarıyla geri yüklendiği doğrulanır.
6. Otomatik geri alma mekanizması (`Pre-Restore Snapshot`) her geri yükleme işleminden önce mevcut durumu yedeklediği için hiçbir veri kaybolmaz.

---

## 5. İlk Gün Canlıya Geçiş Test Senaryosu (15 Dakikalık Saha Testi)

Müşterilere satış yapmaya başlamadan önce kasada sırasıyla şu adımları işletin ve yanlarındaki kutucukları işaretleyin:

- [ ] **1. Yönetici Girişi:** Admin şifresiyle sisteme giriş yapın.
- [ ] **2. Gün Başı Kasa Açılışı:** "Günü Aç" butonuna basarak 500 ₺ açılış nakiti girin ve günü başlatın.
- [ ] **3. Nakit Satış:** Masaya 1 filtre kahve ekleyin (ör. 60 ₺), Nakit ödeme alın ve siparişi tamamlayın.
- [ ] **4. Kredi Kartı Satışı:** Başka bir masaya 1 latte ekleyin (ör. 80 ₺), Kart ile ödeme alın ve siparişi tamamlayın.
- [ ] **5. Parçalı / Karışık Ödeme:** Bir masaya 2 ürün ekleyin (ör. 150 ₺). "Parçalı Ödeme" seçip 100 ₺ Kart, 50 ₺ Nakit tahsil ederek hesabı kapatın.
- [ ] **6. Açık Masada Kısmi Ödeme:** Bir masaya 200 ₺ sipariş girin. Masadan ayrılmadan önce müşteri 50 ₺ nakit versin, ara ödeme olarak işleyin. Kalan 150 ₺ masada bakiye olarak görünmelidir.
- [ ] **7. İade Testi:** Hatalı girilen bir ürünü veya masayı "İade Et" butonuyla iade edin. İadenin raporda eksi bakiye oluşturmadan ciroyu doğru düşürdüğünü görün.
- [ ] **8. Adisyon Geri Açma (Reopen):** Tamamlanan bir siparişi "Geri Aç" ile masaya geri alın, ek ürün ekleyip tekrar kapatın. Raporlarda mükerrer ciro oluşmadığını kontrol edin.
- [ ] **9. Gün Sonu Kapatma:** Masadaki açık hesapları kapatın. "Günü Kapat" butonuna basın. Sayılan nakiti ve fiziki POS cihazınızdan aldığınız gün sonu Z tutarını girin. Farkın 0.00 ₺ olduğunu teyit edip günü kapatın.
- [ ] **10. Yazdırma ve Yeniden Başlatma:** Z Raporunu yazdırın. Uygulamayı tamamen kapatıp yeniden açın. Raporlar ekranında günün tüm dökümlerinin korunduğunu teyit edin.
- [ ] **11. Günlük Yedeği Alın:** Ayarlar > Sistem menüsünden "Tam Sistem Yedeği İndir" butonuna basıp USB belleğe aktarın.

---

**LEMOON KAFE POS artık işletmeniz için güvenle kullanıma hazırdır.**

