import type { Product } from '../types'

export const categories = ['Tümü', 'Sıcak Kahveler', 'Soğuk İçecekler', 'Tatlılar', 'Atıştırmalıklar', 'Çaylar'] as const

export const products: Product[] = [
  {
    id: 'prod-americano',
    name: "Americano",
    category: 'Sıcak Kahveler',
    price: 120.0,
    description: "Espresso ve sıcak suyun uyumu",
  },
  {
    id: 'prod-latte',
    name: "Latte",
    category: 'Sıcak Kahveler',
    price: 140.0,
    description: "Espresso ve kadifemsi sıcak süt",
  },
  {
    id: 'prod-mocha-white-choc-mocha',
    name: "Mocha / White Choc Mocha",
    category: 'Sıcak Kahveler',
    price: 160.0,
    description: "Çikolata, espresso ve sıcak süt",
    optionGroups: [
      {
            "id": "opt-mocha-choice",
            "name": "Çeşit Seçimi",
            "selectionType": "single",
            "required": true,
            "options": [
                  {
                        "id": "opt-mocha",
                        "name": "Mocha",
                        "priceDelta": 0,
                        "isDefault": true
                  },
                  {
                        "id": "opt-white-mocha",
                        "name": "White Choc Mocha",
                        "priceDelta": 0,
                        "isDefault": false
                  }
            ]
      }
],
  },
  {
    id: 'prod-caramel-macchiato',
    name: "Caramel Macchiato",
    category: 'Sıcak Kahveler',
    price: 160.0,
    description: "Vanilya, sıcak süt, espresso ve karamel sosu",
  },
  {
    id: 'prod-flat-white',
    name: "Flat White",
    category: 'Sıcak Kahveler',
    price: 140.0,
    description: "Double espresso ve ince süt köpüğü",
  },
  {
    id: 'prod-expresso',
    name: "Expresso",
    category: 'Sıcak Kahveler',
    price: 60.0,
    description: "Yoğun gövdeli geleneksel espresso",
  },
  {
    id: 'prod-filter-coffee',
    name: "Filter Coffee",
    category: 'Sıcak Kahveler',
    price: 120.0,
    description: "Taze demlenmiş zengin filtre kahve",
  },
  {
    id: 'prod-sutlu-kahve',
    name: "Sütlü Kahve",
    category: 'Sıcak Kahveler',
    price: 120.0,
    description: "Yumuşak içimli sütlü kahve",
  },
  {
    id: 'prod-balli-sut',
    name: "Ballı Süt",
    category: 'Sıcak Kahveler',
    price: 100.0,
    description: "Doğal bal ile tatlandırılmış sıcak süt",
  },
  {
    id: 'prod-salep',
    name: "Salep",
    category: 'Sıcak Kahveler',
    price: 140.0,
    description: "Geleneksel sıcak salep ve tarçın",
  },
  {
    id: 'prod-sicak-cikolata',
    name: "Sıcak Çikolata",
    category: 'Sıcak Kahveler',
    price: 140.0,
    description: "Yoğun kıvamlı sıcak çikolata",
  },
  {
    id: 'prod-cikolatali-salep',
    name: "Çikolatalı Salep",
    category: 'Sıcak Kahveler',
    price: 150.0,
    description: "Çikolata aromalı sıcak salep",
  },
  {
    id: 'prod-expresso-salep',
    name: "Expresso Salep",
    category: 'Sıcak Kahveler',
    price: 150.0,
    description: "Espresso ve salebin özel buluşması",
  },
  {
    id: 'prod-aromali-sicak-cikolata',
    name: "Aromalı Sıcak Çikolata (çilek / fındık / muz / frambuaz)",
    category: 'Sıcak Kahveler',
    price: 150.0,
    description: "Özel meyve ve fındık aromalı sıcak çikolata",
    optionGroups: [
      {
            "id": "opt-sicak-cikolata-aroma",
            "name": "Aroma Seçimi",
            "selectionType": "single",
            "required": true,
            "options": [
                  {
                        "id": "opt-ac-cilek",
                        "name": "Çilek",
                        "priceDelta": 0,
                        "isDefault": true
                  },
                  {
                        "id": "opt-ac-findik",
                        "name": "Fındık",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-ac-muz",
                        "name": "Muz",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-ac-frambuaz",
                        "name": "Frambuaz",
                        "priceDelta": 0,
                        "isDefault": false
                  }
            ]
      }
],
  },
  {
    id: 'prod-turk-kahvesi',
    name: "Türk Kahvesi",
    category: 'Sıcak Kahveler',
    price: 100.0,
    description: "Geleneksel taze çekilmiş Türk kahvesi",
  },
  {
    id: 'prod-sutlu-turk-kahvesi',
    name: "Sütlü Türk Kahvesi",
    category: 'Sıcak Kahveler',
    price: 120.0,
    description: "Sütle pişirilmiş yumuşak içimli Türk kahvesi",
  },
  {
    id: 'prod-double-turk-kahvesi',
    name: "Double Türk Kahvesi",
    category: 'Sıcak Kahveler',
    price: 150.0,
    description: "Çift porsiyon Türk kahvesi",
  },
  {
    id: 'prod-damla-sakizli-turk-kahvesi',
    name: "Damla Sakızlı Türk Kahvesi",
    category: 'Sıcak Kahveler',
    price: 120.0,
    description: "Ege damla sakızı aromalı Türk kahvesi",
  },
  {
    id: 'prod-dibek-kahvesi',
    name: "Dibek Kahvesi",
    category: 'Sıcak Kahveler',
    price: 120.0,
    description: "Taş dibekte dövülmüş aromatik kahve",
  },
  {
    id: 'prod-menengic-kahvesi',
    name: "Menengiç Kahvesi",
    category: 'Sıcak Kahveler',
    price: 120.0,
    description: "Kafeinsiz doğal yabani fıstık kahvesi",
  },
  {
    id: 'prod-cay',
    name: "Çay",
    category: 'Çaylar',
    price: 30.0,
    description: "Taze demlenmiş Karadeniz çayı",
  },
  {
    id: 'prod-fincan-cay',
    name: "Fincan Çay",
    category: 'Çaylar',
    price: 50.0,
    description: "Büyük fincanda taze demlenmiş çay",
  },
  {
    id: 'prod-bitki-caylari',
    name: "Bitki Çayları",
    category: 'Çaylar',
    price: 100.0,
    description: "Özel seçilmiş şifalı bitki çayları",
  },
  {
    id: 'prod-ice-americano',
    name: "Ice Americano",
    category: 'Soğuk İçecekler',
    price: 130.0,
    description: "Espresso, soğuk su ve buz",
  },
  {
    id: 'prod-ice-latte',
    name: "Ice Latte",
    category: 'Soğuk İçecekler',
    price: 150.0,
    description: "Espresso, soğuk süt ve ferahlatıcı buz",
  },
  {
    id: 'prod-ice-mocha-white-choc-mocha',
    name: "Ice Mocha / White Choc Mocha",
    category: 'Soğuk İçecekler',
    price: 170.0,
    description: "Buzlu çikolatalı espresso ve soğuk süt",
    optionGroups: [
      {
            "id": "opt-ice-mocha-choice",
            "name": "Çeşit Seçimi",
            "selectionType": "single",
            "required": true,
            "options": [
                  {
                        "id": "opt-ice-mocha",
                        "name": "Ice Mocha",
                        "priceDelta": 0,
                        "isDefault": true
                  },
                  {
                        "id": "opt-ice-white-mocha",
                        "name": "Ice White Choc Mocha",
                        "priceDelta": 0,
                        "isDefault": false
                  }
            ]
      }
],
  },
  {
    id: 'prod-ice-caramel-macchiato',
    name: "Ice Caramel Macchiato",
    category: 'Soğuk İçecekler',
    price: 170.0,
    description: "Vanilya, soğuk süt, buz, espresso ve karamel sosu",
  },
  {
    id: 'prod-bubble-tea',
    name: "Bubble Tea (yaban mersini / çilek / mango)",
    category: 'Soğuk İçecekler',
    price: 150.0,
    description: "Patlayan meyveli boba taneleriyle serinletici çay",
    optionGroups: [
      {
            "id": "opt-bubble-tea-flavor",
            "name": "Aroma Seçimi",
            "selectionType": "single",
            "required": true,
            "options": [
                  {
                        "id": "opt-bt-yaban-mersini",
                        "name": "Yaban Mersini",
                        "priceDelta": 0,
                        "isDefault": true
                  },
                  {
                        "id": "opt-bt-cilek",
                        "name": "Çilek",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-bt-mango",
                        "name": "Mango",
                        "priceDelta": 0,
                        "isDefault": false
                  }
            ]
      }
],
  },
  {
    id: 'prod-milkshake-smoothie',
    name: "Milkshake / Smoothie (muz / çilek / kavun / çikolata / orman meyvesi / vanilya)",
    category: 'Soğuk İçecekler',
    price: 150.0,
    description: "Yoğun kıvamlı taze meyve ve dondurma lezzeti",
    optionGroups: [
      {
            "id": "opt-ms-flavor",
            "name": "Lezzet Seçimi",
            "selectionType": "single",
            "required": true,
            "options": [
                  {
                        "id": "opt-ms-muz",
                        "name": "Muz",
                        "priceDelta": 0,
                        "isDefault": true
                  },
                  {
                        "id": "opt-ms-cilek",
                        "name": "Çilek",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-ms-kavun",
                        "name": "Kavun",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-ms-cikolata",
                        "name": "Çikolata",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-ms-orman-meyvesi",
                        "name": "Orman Meyvesi",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-ms-vanilya",
                        "name": "Vanilya",
                        "priceDelta": 0,
                        "isDefault": false
                  }
            ]
      }
],
  },
  {
    id: 'prod-frozen',
    name: "Frozen (karpuz / çilek / kavun / muz)",
    category: 'Soğuk İçecekler',
    price: 130.0,
    description: "Buzla harmanlanmış ferahlatıcı meyve püresi",
    optionGroups: [
      {
            "id": "opt-frozen-flavor",
            "name": "Meyve Seçimi",
            "selectionType": "single",
            "required": true,
            "options": [
                  {
                        "id": "opt-fz-karpuz",
                        "name": "Karpuz",
                        "priceDelta": 0,
                        "isDefault": true
                  },
                  {
                        "id": "opt-fz-cilek",
                        "name": "Çilek",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-fz-kavun",
                        "name": "Kavun",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-fz-muz",
                        "name": "Muz",
                        "priceDelta": 0,
                        "isDefault": false
                  }
            ]
      }
],
  },
  {
    id: 'prod-frappe',
    name: "Frappe (vanilya / fındık / karamel)",
    category: 'Soğuk İçecekler',
    price: 150.0,
    description: "Köpürtülmüş soğuk kahve ve aroma",
    optionGroups: [
      {
            "id": "opt-frappe-flavor",
            "name": "Aroma Seçimi",
            "selectionType": "single",
            "required": true,
            "options": [
                  {
                        "id": "opt-fp-vanilya",
                        "name": "Vanilya",
                        "priceDelta": 0,
                        "isDefault": true
                  },
                  {
                        "id": "opt-fp-findik",
                        "name": "Fındık",
                        "priceDelta": 0,
                        "isDefault": false
                  },
                  {
                        "id": "opt-fp-karamel",
                        "name": "Karamel",
                        "priceDelta": 0,
                        "isDefault": false
                  }
            ]
      }
],
  },
  {
    id: 'prod-soguk-cikolata',
    name: "Soğuk Çikolata",
    category: 'Soğuk İçecekler',
    price: 150.0,
    description: "Buzlu enfes soğuk çikolata",
  },
  {
    id: 'prod-salep-soguk',
    name: "Salep",
    category: 'Soğuk İçecekler',
    price: 150.0,
    description: "Soğuk Salep",
  },
  {
    id: 'prod-cool-lime',
    name: "Cool Lime",
    category: 'Soğuk İçecekler',
    price: 160.0,
    description: "Misket limonu ve nane ferahlığı",
  },
  {
    id: 'prod-berry-hibiscus',
    name: "Berry Hibiscus",
    category: 'Soğuk İçecekler',
    price: 160.0,
    description: "Hibiskus ve böğürtlenli buzlu ferahlık",
  },
  {
    id: 'prod-su',
    name: "Su",
    category: 'Soğuk İçecekler',
    price: 30.0,
    description: "Doğal kaynak suyu",
  },
  {
    id: 'prod-limonata',
    name: "Limonata",
    category: 'Soğuk İçecekler',
    price: 100.0,
    description: "Ev yapımı taze sıkılmış limonata",
  },
  {
    id: 'prod-portakal-suyu',
    name: "Portakal Suyu",
    category: 'Soğuk İçecekler',
    price: 100.0,
    description: "Taze sıkılmış %100 portakal suyu",
  },
  {
    id: 'prod-sade-soda',
    name: "Sade Soda",
    category: 'Soğuk İçecekler',
    price: 50.0,
    description: "Doğal maden suyu",
  },
  {
    id: 'prod-meyveli-soda',
    name: "Meyveli Soda",
    category: 'Soğuk İçecekler',
    price: 70.0,
    description: "Meyve aromalı maden suyu",
  },
  {
    id: 'prod-cola',
    name: "Cola",
    category: 'Soğuk İçecekler',
    price: 90.0,
    description: "Kutu soğuk kola",
  },
  {
    id: 'prod-kokteyl',
    name: "Kokteyl",
    category: 'Soğuk İçecekler',
    price: 250.0,
    description: "Özel karışım alkolsüz kokteyl",
  },
  {
    id: 'prod-sucuklu-tost',
    name: "Sucuklu Tost",
    category: 'Atıştırmalıklar',
    price: 100.0,
    description: "Dana sucuklu sıcak çıtır tost",
  },
  {
    id: 'prod-kasarli-tost',
    name: "Kaşarlı Tost",
    category: 'Atıştırmalıklar',
    price: 110.0,
    description: "Eriyen taze kaşar peynirli tost",
  },
  {
    id: 'prod-karisik-tost',
    name: "Karışık Tost",
    category: 'Atıştırmalıklar',
    price: 120.0,
    description: "Dana sucuk ve bol kaşarlı tost",
  },
  {
    id: 'prod-sanayi-tostu',
    name: "Sanayi Tostu",
    category: 'Atıştırmalıklar',
    price: 130.0,
    description: "Bol malzemeli çıtır sanayi tostu",
  },
  {
    id: 'prod-kofte-burger',
    name: "Köfte Burger",
    category: 'Atıştırmalıklar',
    price: 330.0,
    description: "Özel dana köfteli nefis burger",
  },
  {
    id: 'prod-tavuk-burger',
    name: "Tavuk Burger",
    category: 'Atıştırmalıklar',
    price: 250.0,
    description: "Çıtır tavuklu lezzetli burger",
  },
  {
    id: 'prod-sade-kremali-makarna',
    name: "Sade Kremal Makarna ı",
    category: 'Atıştırmalıklar',
    price: 180.0,
    description: "Sade Kremalı Makarna",
  },
  {
    id: 'prod-mantarli-makarna',
    name: "Mantarlı Makarna",
    category: 'Atıştırmalıklar',
    price: 200.0,
    description: "Kremalı taze mantarlı makarna",
  },
  {
    id: 'prod-tavuklu-makarna',
    name: "Tavuklu Makarna",
    category: 'Atıştırmalıklar',
    price: 230.0,
    description: "Kremalı tavuk parçalı nefis makarna",
  },
  {
    id: 'prod-patso',
    name: "Patso",
    category: 'Atıştırmalıklar',
    price: 110.0,
    description: "Patates: 110₺ | Ekstralar: Sosis (+25₺), Kaşar (+25₺)",
    optionGroups: [
      {
            "id": "opt-patso-extras",
            "name": "Ekstralar",
            "selectionType": "multiple",
            "required": false,
            "options": [
                  {
                        "id": "opt-extra-sosis",
                        "name": "Sosis",
                        "priceDelta": 25,
                        "isDefault": false
                  },
                  {
                        "id": "opt-extra-kasar",
                        "name": "Kaşar",
                        "priceDelta": 25,
                        "isDefault": false
                  }
            ]
      }
],
  },
  {
    id: 'prod-sosisli',
    name: "Sosisli",
    category: 'Atıştırmalıklar',
    price: 120.0,
    description: "Sosisli sandviç ketçap mayonez ile",
  },
  {
    id: 'prod-kofte-ekmek-dana-kofte',
    name: "Köfte Ekmek (Dana Köfte)",
    category: 'Atıştırmalıklar',
    price: 200.0,
    description: "Dana Köfte: 200₺",
  },
  {
    id: 'prod-kofte-ekmek-menu',
    name: "Köfte Ekmek Menü (patates / ayran)",
    category: 'Atıştırmalıklar',
    price: 270.0,
    description: "Köfte ekmek, patates kızartması ve ayran menüsü",
  },
  {
    id: 'prod-patates-kizartmasi',
    name: "Patates Kızartması (ketçap/mayonez)",
    category: 'Atıştırmalıklar',
    price: 120.0,
    description: "Patates (ketçap/mayonez): 120₺",
  },
  {
    id: 'prod-combo-tabagi',
    name: "Combo Tabağı (patates / sosis / salam / soğan halkası / nugget / cola & ayran)",
    category: 'Atıştırmalıklar',
    price: 300.0,
    description: "Patates, sosis, salam, soğan halkası, nugget, cola & ayran",
  },
  {
    id: 'prod-sucuk-ekmek-dana-sucuk',
    name: "Sucuk Ekmek (Dana Sucuk)",
    category: 'Atıştırmalıklar',
    price: 180.0,
    description: "Dana Sucuk: 180₺",
  },
  {
    id: 'prod-sucuk-ekmek-menu',
    name: "Sucuk Ekmek Menü (patates / ayran)",
    category: 'Atıştırmalıklar',
    price: 250.0,
    description: "Dana sucuk ekmek, patates kızartması ve ayran menüsü",
  },
  {
    id: 'prod-kumru',
    name: "Kumru (Salam, sosis, kaşar, turşu)",
    category: 'Atıştırmalıklar',
    price: 150.0,
    description: "Salam, sosis, kaşar, turşu: 150₺",
  },
  {
    id: 'prod-kule-waffle',
    name: "Kule Waffle",
    category: 'Tatlılar',
    price: 300.0,
    description: "Kat kat çikolatalı ve meyveli kule waffle",
  },
  {
    id: 'prod-tabak-waffle',
    name: "Tabak Waffle",
    category: 'Tatlılar',
    price: 250.0,
    description: "Tabakta bol çikolata ve meyveli klasik waffle",
  },
  {
    id: 'prod-bardak-waffle',
    name: "Bardak Waffle",
    category: 'Tatlılar',
    price: 200.0,
    description: "Bardakta pratik ve lezzetli waffle lokmaları",
  },
]
