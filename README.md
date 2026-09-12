# Eco Coffee POS - Kasa & Restoran Otomasyon Sistemi

Modern, hızlı ve dokunmatik ekran dostu cafe/restoran kasa arayüzü ve masa yönetim sistemi.

## Çalıştırma

```bash
npm install
npm run dev
```

Üretim derlemesi yapmak için:
```bash
npm run build
```

## Sistem Özellikleri

- **Masa & Sipariş Yönetimi:** Masalar arası canlı sipariş takibi, adisyon oluşturma ve masa transfer/birleştirme.
- **Ürün & Menü Yönetimi:** Ürün ekleme, fiyat güncelleme, kategori ve rozet yönetimi, varyasyon/boyut seçenekleri.
- **Kasa & Ödeme:** Nakit, Kart ve QR ile hızlı ödeme tahsilatı, indirim ve parçalı ödeme yönetimi.
- **Raporlama:** Günlük, haftalık ve aylık ciro, en çok satan ürünler ve ödeme tipi dağılımı analizleri.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
