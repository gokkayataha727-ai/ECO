import type { Product } from '../types'

export const categories = ['Tümü', 'Sıcak Kahveler', 'Soğuk İçecekler', 'Tatlılar', 'Atıştırmalıklar', 'Çaylar'] as const

export const products: Product[] = [
  // ================= ESPRESSO BAZLI KAHVELER =================
  {
    id: 'prod-filtre-kahve',
    name: 'Filtre Kahve',
    category: 'Sıcak Kahveler',
    price: 130,
    description: 'Taze demlenmiş, zengin aromalı filtre kahve',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-espresso',
    name: 'Espresso',
    category: 'Sıcak Kahveler',
    price: 70,
    description: 'Yoğun gövdeli ve kadifemsi kremalı geleneksel espresso',
    optionGroups: [
      {
        id: 'opt-shot',
        name: 'Porsiyon Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-tek', name: 'Tek Shot', priceDelta: 0, isDefault: true },
          { id: 'opt-cift', name: 'Çift Shot', priceDelta: 30, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-americano',
    name: 'Americano',
    category: 'Sıcak Kahveler',
    price: 140,
    description: 'Espresso ve sıcak suyun yumuşak içimli uyumu',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-caffe-latte',
    name: 'Caffe Latte',
    category: 'Sıcak Kahveler',
    price: 140,
    description: 'Zengin espresso ve buharla ısıtılmış kadifemsi süt',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-cappuccino',
    name: 'Cappuccino',
    category: 'Sıcak Kahveler',
    price: 150,
    description: 'Espresso, sıcak süt ve yoğun süt köpüğü',
    badge: 'Yeni',
  },
  {
    id: 'prod-flat-white',
    name: 'Flat White',
    category: 'Sıcak Kahveler',
    price: 145,
    description: 'Çift shot espresso ve pürüzsüz mikro süt köpüğü',
  },
  {
    id: 'prod-caramel-macchiato',
    name: 'Caramel Macchiato',
    category: 'Sıcak Kahveler',
    price: 150,
    description: 'Vanilya şurubu, sıcak süt, espresso ve enfes karamel sosu',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-caffe-mocha',
    name: 'Caffe Mocha',
    category: 'Sıcak Kahveler',
    price: 150,
    description: 'Espresso, çikolata sosu, sıcak süt ve lezzetli köpük',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-white-chocolate-mocha',
    name: 'White Chocolate Mocha',
    category: 'Sıcak Kahveler',
    price: 150,
    description: 'Espresso, özel beyaz çikolata sosu ve kıvamlı süt',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },

  // ================= ECO ÖZEL SERİ LATTELER =================
  {
    id: 'prod-eco-latte',
    name: 'Eco Latte',
    category: 'Sıcak Kahveler',
    price: 160,
    description: 'Eco Coffee özel reçeteli imza lezzet',
    badge: 'Çok Satan',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
      {
        id: 'opt-extra-syrup',
        name: 'Ekstra Şurup',
        selectionType: 'multiple',
        required: false,
        options: [
          { id: 'opt-syrup', name: 'Extra Şurup İlavesi', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-toffee-nut-latte',
    name: 'Toffee Nut Latte',
    category: 'Sıcak Kahveler',
    price: 160,
    description: 'Karamelize fındık aromalı özel espresso ve süt harmanı',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-peri-latte',
    name: 'Peri Latte',
    category: 'Sıcak Kahveler',
    price: 160,
    description: 'Özel tatlı aromalı gurme latte reçetesi',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-ecopsi-latte',
    name: 'Ecopsi Latte',
    category: 'Sıcak Kahveler',
    price: 160,
    description: 'Eco Coffee imza baharat aromalı gurme latte',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },

  // ================= GELENEKSEL & ÇAYLAR =================
  {
    id: 'prod-turk-kahvesi',
    name: 'Türk Kahvesi',
    category: 'Sıcak Kahveler',
    price: 90,
    description: 'Közde pişirilmiş geleneksel Türk kahvesi',
  },
  {
    id: 'prod-dibek-kahvesi',
    name: 'Dibek Kahvesi',
    category: 'Sıcak Kahveler',
    price: 100,
    description: 'Yumuşak içimli, özel baharatlı taş dibek kahvesi',
  },
  {
    id: 'prod-damla-sakizli-turk-kahvesi',
    name: 'Damla Sakızlı Türk Kahvesi',
    category: 'Sıcak Kahveler',
    price: 100,
    description: 'Halis damla sakızı aromalı Türk kahvesi',
  },
  {
    id: 'prod-menengic-kahvesi',
    name: 'Menengiç Kahvesi',
    category: 'Sıcak Kahveler',
    price: 120,
    description: 'Doğal çitlembik tanelerinden hazırlanan sütlü kahve',
  },
  {
    id: 'prod-taze-demleme-cay',
    name: 'Taze Demleme Çay',
    category: 'Çaylar',
    price: 40,
    description: 'Rize yapraklarından taze demlenmiş geleneksel bardak çay',
  },

  // ================= SOĞUK İÇECEKLER & FRAPPE & MILKSHAKE =================
  {
    id: 'prod-soguk-turk-kahvesi',
    name: 'Soğuk Türk Kahvesi',
    category: 'Soğuk İçecekler',
    price: 120,
    description: 'Buzlu ve serinletici Türk kahvesi lezzeti',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 30, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-klasik-frappe',
    name: 'Klasik Frappe',
    category: 'Soğuk İçecekler',
    price: 170,
    description: 'Karamel, Çikolata veya Vanilya aromalı soğuk kahve frappe',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
      {
        id: 'opt-aroma',
        name: 'Aroma Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'aroma-karamel', name: 'Karamel', priceDelta: 0, isDefault: true },
          { id: 'aroma-cikolata', name: 'Çikolata', priceDelta: 0, isDefault: false },
          { id: 'aroma-vanilya', name: 'Vanilya', priceDelta: 0, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-oreo-frappe',
    name: 'Oreo Frappe',
    category: 'Soğuk İçecekler',
    price: 200,
    description: 'Oreo bisküvi parçaları ve yoğun krema dokusuyla serinletici lezzet',
    badge: 'Çok Satan',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-cici-bebe-frappe',
    name: 'Cici Bebe Frappe',
    category: 'Soğuk İçecekler',
    price: 200,
    description: 'Cici Bebe bisküvisi aromalı özel kremsi frappe',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-meyveli-milkshake',
    name: 'Meyveli Milkshake',
    category: 'Soğuk İçecekler',
    price: 170,
    description: 'Çilek, Muz veya Vanilya aromalı yoğun milkshake',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
      {
        id: 'opt-meyve',
        name: 'Meyve Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'meyve-cilek', name: 'Çilek', priceDelta: 0, isDefault: true },
          { id: 'meyve-muz', name: 'Muz', priceDelta: 0, isDefault: false },
          { id: 'meyve-vanilya', name: 'Vanilya', priceDelta: 0, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-soslu-milkshake',
    name: 'Soslu Milkshake',
    category: 'Soğuk İçecekler',
    price: 170,
    description: 'Çikolata veya Karamel soslu lezzetli milkshake',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
      {
        id: 'opt-sos',
        name: 'Sos Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'sos-cikolata', name: 'Çikolata Soslu', priceDelta: 0, isDefault: true },
          { id: 'sos-karamel', name: 'Karamel Soslu', priceDelta: 0, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-oreo-milkshake',
    name: 'Oreo Milkshake',
    category: 'Soğuk İçecekler',
    price: 200,
    description: 'Oreo bisküvi parçacıklı soğuk milkshake',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-cici-bebe-milkshake',
    name: 'Cici Bebe Milkshake',
    category: 'Soğuk İçecekler',
    price: 200,
    description: 'Cici Bebe aromalı lezzetli ve serinletici milkshake',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-nutella-milkshake',
    name: 'Nutella Milkshake',
    category: 'Soğuk İçecekler',
    price: 190,
    description: 'Orijinal Nutella kakaolu fındık kremalı gurme milkshake',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-murver-milkshake',
    name: 'Mürver Milkshake',
    category: 'Soğuk İçecekler',
    price: 160,
    description: 'Mürver çiçeği özlü ferahlatıcı özel milkshake',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },

  // ================= LİMONATALAR =================
  {
    id: 'prod-klasik-limonata',
    name: 'Klasik Limonata',
    category: 'Soğuk İçecekler',
    price: 150,
    description: 'Taze sıkılmış el yapımı ferahlatıcı limonata',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-naneli-limonata',
    name: 'Naneli Limonata',
    category: 'Soğuk İçecekler',
    price: 165,
    description: 'Taze nane yaprakları ile hazırlanan ferahlatıcı limonata',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 15, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-cilekli-limonata',
    name: 'Çilekli Limonata',
    category: 'Soğuk İçecekler',
    price: 165,
    description: 'Taze çilek püresi harmanlı soğuk limonata',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-kucuk', name: 'Küçük', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 15, isDefault: false },
        ],
      },
    ],
  },

  // ================= SPECIAL KOKTEYLLER & FROZEN =================
  {
    id: 'prod-frozen-cesitleri',
    name: 'Frozen Çeşitleri',
    category: 'Soğuk İçecekler',
    price: 180,
    description: 'Elma, Ananas, Yaban Mersini veya Karpuz aromalı buzlu frozen',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-tek', name: 'Tek', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
      {
        id: 'opt-frozen-aroma',
        name: 'Aroma Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'frz-elma', name: 'Elma', priceDelta: 0, isDefault: true },
          { id: 'frz-ananas', name: 'Ananas', priceDelta: 0, isDefault: false },
          { id: 'frz-yaban', name: 'Yaban Mersini', priceDelta: 0, isDefault: false },
          { id: 'frz-karpuz', name: 'Karpuz', priceDelta: 0, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-ecobery',
    name: 'Ecobery',
    category: 'Soğuk İçecekler',
    price: 190,
    description: 'Orman meyveli ferahlatıcı özel frozen kokteyl',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-tek', name: 'Tek', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-ecolime',
    name: 'Ecolime',
    category: 'Soğuk İçecekler',
    price: 190,
    description: 'Misket limon aromalı serinletici özel kokteyl',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-tek', name: 'Tek', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-eco-blueline-redline',
    name: 'Eco Blueline / Redline',
    category: 'Soğuk İçecekler',
    price: 190,
    description: 'Mavi ve kırmızı meyve özlü serinletici egzotik kokteyl',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-tek', name: 'Tek', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-green-world',
    name: 'Green World',
    category: 'Soğuk İçecekler',
    price: 190,
    description: 'Yeşil elma ve nane özlü özel ferahlatıcı kokteyl',
    badge: 'Yeni',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-tek', name: 'Tek', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },
  {
    id: 'prod-ecomeco-special',
    name: 'Ecomeco Special',
    category: 'Soğuk İçecekler',
    price: 210,
    description: 'Eco Coffee özel reçeteli dev serinletici kokteyl',
    optionGroups: [
      {
        id: 'opt-size',
        name: 'Boyut Seçimi',
        selectionType: 'single',
        required: true,
        options: [
          { id: 'opt-tek', name: 'Tek', priceDelta: 0, isDefault: true },
          { id: 'opt-buyuk', name: 'Büyük', priceDelta: 20, isDefault: false },
        ],
      },
    ],
  },

  // ================= İMZA CHEESECAKELER & PASTALAR =================
  {
    id: 'prod-san-sebastian',
    name: 'San Sebastian Cheesecake',
    category: 'Tatlılar',
    price: 200,
    description: 'Üzerine sıcak erimiş Belçika çikolatası dökülen, içi akışkan nefis San Sebastian cheesecake',
    badge: 'Çok Satan',
  },
  {
    id: 'prod-fistikli-san-sebastian',
    name: 'Fıstıklı San Sebastian',
    category: 'Tatlılar',
    price: 220,
    description: 'Antep fıstığı dolgulu ve parçacıklı özel San Sebastian cheesecake',
  },
  {
    id: 'prod-bombella-special',
    name: 'Bombella Special',
    category: 'Tatlılar',
    price: 250,
    description: 'Çikolata bombası ve özel krema dolgulu imza tatlı',
    badge: 'Çok Satan',
  },
  {
    id: 'prod-american-cookie',
    name: 'American Cookie',
    category: 'Tatlılar',
    price: 220,
    description: 'Bol çikolatalı ve günlük taze Amerikan kurabiyesi',
  },
  {
    id: 'prod-belcika-cikolatali-pasta',
    name: 'Belçika Çikolatalı Pasta',
    category: 'Tatlılar',
    price: 180,
    description: 'Orijinal Belçika çikolatalı yoğun kıvamlı dilim pasta',
  },
  {
    id: 'prod-lotus-biscoff-pasta',
    name: 'Lotus Biscoff Pasta',
    category: 'Tatlılar',
    price: 190,
    description: 'Karamelize Lotus bisküvi kremalı enfes dilim pasta',
  },
  {
    id: 'prod-eco-vista-frambuazli-pasta',
    name: 'Eco Vista Frambuazlı Pasta',
    category: 'Tatlılar',
    price: 200,
    description: 'Taze frambuaz taneli ve hafif kremalı gurme dilim pasta',
  },
  {
    id: 'prod-cilek-cup-dessert',
    name: 'Çilek Cup Dessert',
    category: 'Tatlılar',
    price: 160,
    description: 'Taze çilek taneleri, krema ve kıtır bisküvili bardak tatlısı',
  },
  {
    id: 'prod-fistik-cup-dessert',
    name: 'Fıstık Cup Dessert',
    category: 'Tatlılar',
    price: 170,
    description: 'Antep fıstığı kremalı ve kıtır bisküvili bardak tatlısı',
  },

  // ================= EKSTRALAR & SOSLAR =================
  {
    id: 'prod-erimis-belcika-cikolatasi-sosu',
    name: 'Erimiş Belçika Çikolatası Sosu',
    category: 'Atıştırmalıklar',
    price: 50,
    description: 'Tatlı ve pastalarınız için sıcak erimiş Belçika çikolatası ekstra sos',
  },
  {
    id: 'prod-eco-special-cekirdek',
    name: 'Eco Special Nitelikli Kahve Çekirdeği',
    category: 'Atıştırmalıklar',
    price: 250,
    description: 'Taze kavrulmuş nitelikli öğütülmemiş kahve çekirdekleri (250g)',
    badge: 'Yeni',
  },
]

