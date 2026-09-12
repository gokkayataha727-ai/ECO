import sqlite3
import json

products = [
  # Sıcak Kahveler & Latteler
  {
    'id': 'prod-filtre-kahve',
    'name': 'Filtre Kahve',
    'category': 'Sıcak Kahveler',
    'price': 130.0,
    'description': 'Taze demlenmiş, zengin aromalı filtre kahve',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-espresso',
    'name': 'Espresso',
    'category': 'Sıcak Kahveler',
    'price': 70.0,
    'description': 'Yoğun gövdeli ve kadifemsi kremalı geleneksel espresso',
    'option_groups': json.dumps([{
      'id': 'opt-shot',
      'name': 'Porsiyon Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-tek', 'name': 'Tek Shot', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-cift', 'name': 'Çift Shot', 'priceDelta': 30, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-americano',
    'name': 'Americano',
    'category': 'Sıcak Kahveler',
    'price': 140.0,
    'description': 'Espresso ve sıcak suyun yumuşak içimli uyumu',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-caffe-latte',
    'name': 'Caffe Latte',
    'category': 'Sıcak Kahveler',
    'price': 140.0,
    'description': 'Zengin espresso ve buharla ısıtılmış kadifemsi süt',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-cappuccino',
    'name': 'Cappuccino',
    'category': 'Sıcak Kahveler',
    'price': 150.0,
    'description': 'Espresso, sıcak süt ve yoğun süt köpüğü',
    'badge': 'Yeni'
  },
  {
    'id': 'prod-flat-white',
    'name': 'Flat White',
    'category': 'Sıcak Kahveler',
    'price': 145.0,
    'description': 'Çift shot espresso ve pürüzsüz mikro süt köpüğü'
  },
  {
    'id': 'prod-caramel-macchiato',
    'name': 'Caramel Macchiato',
    'category': 'Sıcak Kahveler',
    'price': 150.0,
    'description': 'Vanilya şurubu, sıcak süt, espresso ve enfes karamel sosu',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-caffe-mocha',
    'name': 'Caffe Mocha',
    'category': 'Sıcak Kahveler',
    'price': 150.0,
    'description': 'Espresso, çikolata sosu, sıcak süt ve lezzetli köpük',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-white-chocolate-mocha',
    'name': 'White Chocolate Mocha',
    'category': 'Sıcak Kahveler',
    'price': 150.0,
    'description': 'Espresso, özel beyaz çikolata sosu ve kıvamlı süt',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-eco-latte',
    'name': 'Eco Latte',
    'category': 'Sıcak Kahveler',
    'price': 160.0,
    'description': 'Eco Coffee özel reçeteli imza lezzet',
    'badge': 'Çok Satan',
    'option_groups': json.dumps([
      {
        'id': 'opt-size',
        'name': 'Boyut Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
          {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
        ]
      },
      {
        'id': 'opt-extra-syrup',
        'name': 'Ekstra Şurup',
        'selectionType': 'multiple',
        'required': False,
        'options': [
          {'id': 'opt-syrup', 'name': 'Extra Şurup İlavesi', 'priceDelta': 20, 'isDefault': False}
        ]
      }
    ])
  },
  {
    'id': 'prod-toffee-nut-latte',
    'name': 'Toffee Nut Latte',
    'category': 'Sıcak Kahveler',
    'price': 160.0,
    'description': 'Karamelize fındık aromalı özel espresso ve süt harmanı',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-peri-latte',
    'name': 'Peri Latte',
    'category': 'Sıcak Kahveler',
    'price': 160.0,
    'description': 'Özel tatlı aromalı gurme latte reçetesi',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-ecopsi-latte',
    'name': 'Ecopsi Latte',
    'category': 'Sıcak Kahveler',
    'price': 160.0,
    'description': 'Eco Coffee imza baharat aromalı gurme latte',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-turk-kahvesi',
    'name': 'Türk Kahvesi',
    'category': 'Sıcak Kahveler',
    'price': 90.0,
    'description': 'Közde pişirilmiş geleneksel Türk kahvesi'
  },
  {
    'id': 'prod-dibek-kahvesi',
    'name': 'Dibek Kahvesi',
    'category': 'Sıcak Kahveler',
    'price': 100.0,
    'description': 'Yumuşak içimli, özel baharatlı taş dibek kahvesi'
  },
  {
    'id': 'prod-damla-sakizli-turk-kahvesi',
    'name': 'Damla Sakızlı Türk Kahvesi',
    'category': 'Sıcak Kahveler',
    'price': 100.0,
    'description': 'Halis damla sakızı aromalı Türk kahvesi'
  },
  {
    'id': 'prod-menengic-kahvesi',
    'name': 'Menengiç Kahvesi',
    'category': 'Sıcak Kahveler',
    'price': 120.0,
    'description': 'Doğal çitlembik tanelerinden hazırlanan sütlü kahve'
  },
  {
    'id': 'prod-taze-demleme-cay',
    'name': 'Taze Demleme Çay',
    'category': 'Çaylar',
    'price': 40.0,
    'description': 'Rize yapraklarından taze demlenmiş geleneksel bardak çay'
  },

  # Soğuk İçecekler & Frappe & Milkshake
  {
    'id': 'prod-soguk-turk-kahvesi',
    'name': 'Soğuk Türk Kahvesi',
    'category': 'Soğuk İçecekler',
    'price': 120.0,
    'description': 'Buzlu ve serinletici Türk kahvesi lezzeti',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 30, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-klasik-frappe',
    'name': 'Klasik Frappe',
    'category': 'Soğuk İçecekler',
    'price': 170.0,
    'description': 'Karamel, Çikolata veya Vanilya aromalı soğuk kahve frappe',
    'option_groups': json.dumps([
      {
        'id': 'opt-size',
        'name': 'Boyut Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
          {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
        ]
      },
      {
        'id': 'opt-aroma',
        'name': 'Aroma Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'aroma-karamel', 'name': 'Karamel', 'priceDelta': 0, 'isDefault': True},
          {'id': 'aroma-cikolata', 'name': 'Çikolata', 'priceDelta': 0, 'isDefault': False},
          {'id': 'aroma-vanilya', 'name': 'Vanilya', 'priceDelta': 0, 'isDefault': False}
        ]
      }
    ])
  },
  {
    'id': 'prod-oreo-frappe',
    'name': 'Oreo Frappe',
    'category': 'Soğuk İçecekler',
    'price': 200.0,
    'description': 'Oreo bisküvi parçaları ve yoğun krema dokusuyla serinletici lezzet',
    'badge': 'Çok Satan',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-cici-bebe-frappe',
    'name': 'Cici Bebe Frappe',
    'category': 'Soğuk İçecekler',
    'price': 200.0,
    'description': 'Cici Bebe bisküvisi aromalı özel kremsi frappe',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-meyveli-milkshake',
    'name': 'Meyveli Milkshake',
    'category': 'Soğuk İçecekler',
    'price': 170.0,
    'description': 'Çilek, Muz veya Vanilya aromalı yoğun milkshake',
    'option_groups': json.dumps([
      {
        'id': 'opt-size',
        'name': 'Boyut Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
          {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
        ]
      },
      {
        'id': 'opt-meyve',
        'name': 'Meyve Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'meyve-cilek', 'name': 'Çilek', 'priceDelta': 0, 'isDefault': True},
          {'id': 'meyve-muz', 'name': 'Muz', 'priceDelta': 0, 'isDefault': False},
          {'id': 'meyve-vanilya', 'name': 'Vanilya', 'priceDelta': 0, 'isDefault': False}
        ]
      }
    ])
  },
  {
    'id': 'prod-soslu-milkshake',
    'name': 'Soslu Milkshake',
    'category': 'Soğuk İçecekler',
    'price': 170.0,
    'description': 'Çikolata veya Karamel soslu lezzetli milkshake',
    'option_groups': json.dumps([
      {
        'id': 'opt-size',
        'name': 'Boyut Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
          {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
        ]
      },
      {
        'id': 'opt-sos',
        'name': 'Sos Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'sos-cikolata', 'name': 'Çikolata Soslu', 'priceDelta': 0, 'isDefault': True},
          {'id': 'sos-karamel', 'name': 'Karamel Soslu', 'priceDelta': 0, 'isDefault': False}
        ]
      }
    ])
  },
  {
    'id': 'prod-oreo-milkshake',
    'name': 'Oreo Milkshake',
    'category': 'Soğuk İçecekler',
    'price': 200.0,
    'description': 'Oreo bisküvi parçacıklı soğuk milkshake',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-cici-bebe-milkshake',
    'name': 'Cici Bebe Milkshake',
    'category': 'Soğuk İçecekler',
    'price': 200.0,
    'description': 'Cici Bebe aromalı lezzetli ve serinletici milkshake',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-nutella-milkshake',
    'name': 'Nutella Milkshake',
    'category': 'Soğuk İçecekler',
    'price': 190.0,
    'description': 'Orijinal Nutella kakaolu fındık kremalı gurme milkshake',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-murver-milkshake',
    'name': 'Mürver Milkshake',
    'category': 'Soğuk İçecekler',
    'price': 160.0,
    'description': 'Mürver çiçeği özlü ferahlatıcı özel milkshake',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },

  # Limonatalar & Special Kokteyller
  {
    'id': 'prod-klasik-limonata',
    'name': 'Klasik Limonata',
    'category': 'Soğuk İçecekler',
    'price': 150.0,
    'description': 'Taze sıkılmış el yapımı ferahlatıcı limonata',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-naneli-limonata',
    'name': 'Naneli Limonata',
    'category': 'Soğuk İçecekler',
    'price': 165.0,
    'description': 'Taze nane yaprakları ile hazırlanan ferahlatıcı limonata',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 15, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-cilekli-limonata',
    'name': 'Çilekli Limonata',
    'category': 'Soğuk İçecekler',
    'price': 165.0,
    'description': 'Taze çilek püresi harmanlı soğuk limonata',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-kucuk', 'name': 'Küçük', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 15, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-frozen-cesitleri',
    'name': 'Frozen Çeşitleri',
    'category': 'Soğuk İçecekler',
    'price': 180.0,
    'description': 'Elma, Ananas, Yaban Mersini veya Karpuz aromalı buzlu frozen',
    'option_groups': json.dumps([
      {
        'id': 'opt-size',
        'name': 'Boyut Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'opt-tek', 'name': 'Tek', 'priceDelta': 0, 'isDefault': True},
          {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
        ]
      },
      {
        'id': 'opt-frozen-aroma',
        'name': 'Aroma Seçimi',
        'selectionType': 'single',
        'required': True,
        'options': [
          {'id': 'frz-elma', 'name': 'Elma', 'priceDelta': 0, 'isDefault': True},
          {'id': 'frz-ananas', 'name': 'Ananas', 'priceDelta': 0, 'isDefault': False},
          {'id': 'frz-yaban', 'name': 'Yaban Mersini', 'priceDelta': 0, 'isDefault': False},
          {'id': 'frz-karpuz', 'name': 'Karpuz', 'priceDelta': 0, 'isDefault': False}
        ]
      }
    ])
  },
  {
    'id': 'prod-ecobery',
    'name': 'Ecobery',
    'category': 'Soğuk İçecekler',
    'price': 190.0,
    'description': 'Orman meyveli ferahlatıcı özel frozen kokteyl',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-tek', 'name': 'Tek', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-ecolime',
    'name': 'Ecolime',
    'category': 'Soğuk İçecekler',
    'price': 190.0,
    'description': 'Misket limon aromalı serinletici özel kokteyl',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-tek', 'name': 'Tek', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-eco-blueline-redline',
    'name': 'Eco Blueline / Redline',
    'category': 'Soğuk İçecekler',
    'price': 190.0,
    'description': 'Mavi ve kırmızı meyve özlü serinletici egzotik kokteyl',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-tek', 'name': 'Tek', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-green-world',
    'name': 'Green World',
    'category': 'Soğuk İçecekler',
    'price': 190.0,
    'description': 'Yeşil elma ve nane özlü özel ferahlatıcı kokteyl',
    'badge': 'Yeni',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-tek', 'name': 'Tek', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },
  {
    'id': 'prod-ecomeco-special',
    'name': 'Ecomeco Special',
    'category': 'Soğuk İçecekler',
    'price': 210.0,
    'description': 'Eco Coffee özel reçeteli dev serinletici kokteyl',
    'option_groups': json.dumps([{
      'id': 'opt-size',
      'name': 'Boyut Seçimi',
      'selectionType': 'single',
      'required': True,
      'options': [
        {'id': 'opt-tek', 'name': 'Tek', 'priceDelta': 0, 'isDefault': True},
        {'id': 'opt-buyuk', 'name': 'Büyük', 'priceDelta': 20, 'isDefault': False}
      ]
    }])
  },

  # Tatlılar & Soslar
  {
    'id': 'prod-san-sebastian',
    'name': 'San Sebastian Cheesecake',
    'category': 'Tatlılar',
    'price': 200.0,
    'description': 'Üzerine sıcak erimiş Belçika çikolatası dökülen, içi akışkan nefis San Sebastian cheesecake',
    'badge': 'Çok Satan'
  },
  {
    'id': 'prod-fistikli-san-sebastian',
    'name': 'Fıstıklı San Sebastian',
    'category': 'Tatlılar',
    'price': 220.0,
    'description': 'Antep fıstığı dolgulu ve parçacıklı özel San Sebastian cheesecake'
  },
  {
    'id': 'prod-bombella-special',
    'name': 'Bombella Special',
    'category': 'Tatlılar',
    'price': 250.0,
    'description': 'Çikolata bombası ve özel krema dolgulu imza tatlı',
    'badge': 'Çok Satan'
  },
  {
    'id': 'prod-american-cookie',
    'name': 'American Cookie',
    'category': 'Tatlılar',
    'price': 220.0,
    'description': 'Bol çikolatalı ve günlük taze Amerikan kurabiyesi'
  },
  {
    'id': 'prod-belcika-cikolatali-pasta',
    'name': 'Belçika Çikolatalı Pasta',
    'category': 'Tatlılar',
    'price': 180.0,
    'description': 'Orijinal Belçika çikolatalı yoğun kıvamlı dilim pasta'
  },
  {
    'id': 'prod-lotus-biscoff-pasta',
    'name': 'Lotus Biscoff Pasta',
    'category': 'Tatlılar',
    'price': 190.0,
    'description': 'Karamelize Lotus bisküvi kremalı enfes dilim pasta'
  },
  {
    'id': 'prod-eco-vista-frambuazli-pasta',
    'name': 'Eco Vista Frambuazlı Pasta',
    'category': 'Tatlılar',
    'price': 200.0,
    'description': 'Taze frambuaz taneli ve hafif kremalı gurme dilim pasta'
  },
  {
    'id': 'prod-cilek-cup-dessert',
    'name': 'Çilek Cup Dessert',
    'category': 'Tatlılar',
    'price': 160.0,
    'description': 'Taze çilek taneleri, krema ve kıtır bisküvili bardak tatlısı'
  },
  {
    'id': 'prod-fistik-cup-dessert',
    'name': 'Fıstık Cup Dessert',
    'category': 'Tatlılar',
    'price': 170.0,
    'description': 'Antep fıstığı kremalı ve kıtır bisküvili bardak tatlısı'
  },
  {
    'id': 'prod-erimis-belcika-cikolatasi-sosu',
    'name': 'Erimiş Belçika Çikolatası Sosu',
    'category': 'Atıştırmalıklar',
    'price': 50.0,
    'description': 'Tatlı ve pastalarınız için sıcak erimiş Belçika çikolatası ekstra sos'
  },
  {
    'id': 'prod-eco-special-cekirdek',
    'name': 'Eco Special Nitelikli Kahve Çekirdeği',
    'category': 'Atıştırmalıklar',
    'price': 250.0,
    'description': 'Taze kavrulmuş nitelikli öğütülmemiş kahve çekirdekleri (250g)',
    'badge': 'Yeni'
  }
]

import os
import sys

# Ensure backend dir is in python path
sys.path.append(os.path.dirname(__file__))

from database import engine, Base
import models

def seed():
    # Re-create tables to update schema columns if needed
    models.Product.__table__.drop(bind=engine, checkfirst=True)
    Base.metadata.create_all(bind=engine)

    from database import SessionLocal
    db = SessionLocal()

    for p in products:
        db_product = models.Product(
            id=p['id'],
            name=p['name'],
            category=p['category'],
            price=p['price'],
            description=p.get('description'),
            badge=p.get('badge'),
            option_groups=p.get('option_groups')
        )
        db.add(db_product)
    
    db.commit()
    count = db.query(models.Product).count()
    db.close()
    print(f'Successfully seeded {count} products into backend SQLite database!')

if __name__ == '__main__':
    seed()
