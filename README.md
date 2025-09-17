<p align="center">
  <img src="public/icons/Nutridata Watercolor Logo full.png" alt="NutriData Logo" width="200"/>
</p>

# 🥗 NutriData Extension

![Product Page Screenshot](https://github.com/user-attachments/assets/dbbe4cc6-68d5-4631-9cc4-dc754a022e7b)

![Product Page Screenshot](https://github.com/user-attachments/assets/98e4eab6-a49b-4a72-a1b1-5651356094ae)

**Enhance your online grocery shopping with instant nutritional insights!**

## 🎯 Motivation

Ever struggled to make healthy choices while shopping online? NutriData is here to help! We empower consumers by presenting clear, easily comparable nutritional information right on product pages and search results.

## ⚠️ Development Status

**Active development in progress!** The Chrome Web Store version may lag behind due to review processes. For the latest features, grab the GitHub version.

## ✨ Features

### Product Page

- **Key nutritional metrics:**
  - 💪 Protein per euro/pound (g/€ or g/£)
  - 🔥 Protein per 100 calories (g)
  - 🍞 Protein to carb ratio
  - 📊 NutriScore - Custom composite metric (see below)
- Detailed nutritional info in an easy-to-read format
- Color-coded metrics for quick assessment (🔴 to 🟢)

### Search Results Page

![Search Results with Metrics](https://github.com/user-attachments/assets/4fd39372-6287-4f0c-8842-76aa2bd47697)

- Nutritional metrics added to each product card
- **Custom sorting options:**
  - NutriScore (High to Low)
  - Protein per euro (High to Low)
  - Protein per 100 calories (High to Low)
  - Protein to carb ratio (High to Low)
  - Protein, Carbs, Fat (High to Low)
  - Sugar, Calories (Low to High)
- Dynamic updates for newly loaded products

### General

- 🚀 Performance-boosting data caching
- 🛒 Supports:
  - REWE online shop (shop.rewe.de) - full support
  - Amazon.de and Amazon.co.uk - alpha support (product pages only, limited to items with nutritional data)
  - Mercadona.es - alpha support (early stage implementation)
- 📊 Clear separation of "Protein Content Analysis" and "Nutrients per 100g"

### What is NutriScore in this extension?

The NutriScore shown by NutriData is a custom metric that combines:
- Protein per 100 calories (65% weight)
- Protein per currency value (35% weight)  
- Fiber bonus (up to 30% increase for high-fiber foods)

Higher scores indicate products with better protein density and value. **Note:** This is NOT the official Nutri-Score (A-E) rating system used in some European countries.

## ⚠️ Alpha Support for Amazon & Mercadona

![CleanShot 2024-08-19 at 1 28 13@2x](https://github.com/user-attachments/assets/73c77dd4-5b4a-4454-a68c-36f8177baef7)

### Amazon (amazon.de and amazon.co.uk)
- Limited to product pages only
- Functionality depends on the availability of nutritional data for each product
- Many products have incomplete or missing nutritional information
- Search page support and improvements are planned for future updates

### Mercadona (tienda.mercadona.es)
- Early stage implementation
- Limited to product pages
- Uses OpenFoodFacts API for nutritional data when available

## 🚀 Automatic Releases

This project uses automatic versioning and release creation. When changes are pushed to the `main` branch, the following process occurs:

1. The version number is automatically bumped based on commit messages.
2. A new tag is created.
3. A CHANGELOG.md file is generated or updated.
4. A new GitHub release is created with the changelog as the release notes.
5. Chrome and Firefox builds are automatically attached to the release.

To ensure proper versioning, please use conventional commit messages:

- `feat: ...` for new features (bumps minor version)
- `fix: ...` for bug fixes (bumps patch version)
- `BREAKING CHANGE: ...` for breaking changes (bumps major version)

For more information on conventional commits, see [conventionalcommits.org](https://www.conventionalcommits.org/).

## 🚀 Installation

### Option 1: Chrome Web Store (Stable)

1. Visit the [NutriData Chrome Web Store page](https://chromewebstore.google.com/detail/nutridata-product-nutriti/pkgppeffgmpdjldplgbplbfcmckjemao?authuser=0&hl=en)
2. Click "Add to Chrome"

### Option 2: Manual Installation for Chrome (Latest Features)

1. Go to the [Releases page](https://github.com/mohamed3on/nutridata/releases) on GitHub
2. Download the latest `build-chrome.zip` file
3. Unzip the file
4. Open Chrome and go to `chrome://extensions/`
5. Enable "Developer mode" (top right)
6. Click "Load unpacked" and select the unzipped extension directory

### Option 3: Manual Installation for Firefox (Latest Features)

1. Go to the [Releases page](https://github.com/mohamed3on/nutridata/releases) on GitHub
2. Download the latest `build-firefox.zip` file
3. Open Firefox and go to `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Navigate to the download directory and select the zip file

## 🛠 Usage

1. Visit shop.rewe.de, amazon.de, or amazon.co.uk
2. Browse products or search results
   - For REWE: Full functionality on product and search pages
   - For Amazon: Currently supports product pages only (alpha version)
3. Use custom sort options to find your perfect nutritional match (REWE only)

## 🔧 Customization

Tweak the extension by modifying:

- `src/utils.ts`: Adjust `COLOR_THRESHOLDS` for metric color-coding
- `src/shops/rewe.ts`: Update `NUTRIENT_LABELS`
- `src/domUtils.ts`: Customize UI elements and styling

## 🤝 Contributing

Contributions are welcome! Feel free to submit a Pull Request.

## 📄 License

This project is licensed under the Mozilla Public License 2.0 (MPL-2.0).

## TODO

### Support Mercadona

- GET https://world.openfoodfacts.org/api/v0/product/{ean}?fields=nutriments for nutrients
  Response example:

```
{
"code": "8480000233653",
"product": {
"nutriments": {
"carbohydrates": 19,
"carbohydrates_100g": 19,
"carbohydrates_unit": "g",
"carbohydrates_value": 19,
"energy": 2506,
"energy-kcal": 604,
"energy-kcal_100g": 604,
"energy-kcal_unit": "kcal",
"energy-kcal_value": 604,
"energy-kcal_value_computed": 604.6,
"energy-kj": 2506,
"energy-kj_100g": 2506,
"energy-kj_unit": "kJ",
"energy-kj_value": 2506,
"energy-kj_value_computed": 2507.5,
"energy_100g": 2506,
"energy_unit": "kJ",
"energy_value": 2506,
"fat": 48.2,
"fat_100g": 48.2,
"fat_unit": "g",
"fat_value": 48.2,
"fiber": 3.6,
"fiber_100g": 3.6,
"fiber_unit": "g",
"fiber_value": 3.6,
"fruits-vegetables-legumes-estimate-from-ingredients_100g": 0,
"fruits-vegetables-legumes-estimate-from-ingredients_serving": 0,
"fruits-vegetables-nuts-estimate-from-ingredients_100g": 100,
"fruits-vegetables-nuts-estimate-from-ingredients_serving": 100,
"iron": 0.0053,
"iron_100g": 0.0053,
"iron_label": "Iron",
"iron_unit": "mg",
"iron_value": 5.3,
"magnesium": 0.25,
"magnesium_100g": 0.25,
"magnesium_label": "Magnesium",
"magnesium_unit": "mg",
"magnesium_value": 250,
"monounsaturated-fat": 31.1,
"monounsaturated-fat_100g": 31.1,
"monounsaturated-fat_label": "Monounsaturated fat",
"monounsaturated-fat_unit": "g",
"monounsaturated-fat_value": 31.1,
"nova-group": 1,
"nova-group_100g": 1,
"nova-group_serving": 1,
"nutrition-score-fr": -2,
"nutrition-score-fr_100g": -2,
"phosphorus": 0.489,
"phosphorus_100g": 0.489,
"phosphorus_label": "Phosphorus",
"phosphorus_unit": "mg",
"phosphorus_value": 489,
"polyunsaturated-fat": 8.8,
"polyunsaturated-fat_100g": 8.8,
"polyunsaturated-fat_label": "Polyunsaturated fat",
"polyunsaturated-fat_unit": "g",
"polyunsaturated-fat_value": 8.8,
"proteins": 21.9,
"proteins_100g": 21.9,
"proteins_unit": "g",
"proteins_value": 21.9,
"salt": 0,
"salt_100g": 0,
"salt_unit": "g",
"salt_value": 0,
"saturated-fat": 8.2,
"saturated-fat_100g": 8.2,
"saturated-fat_unit": "g",
"saturated-fat_value": 8.2,
"sodium": 0,
"sodium_100g": 0,
"sodium_unit": "g",
"sodium_value": 0,
"sugars": 7.7,
"sugars_100g": 7.7,
"sugars_unit": "g",
"sugars_value": 7.7
},
"schema_version": 996
},
"status": 1,
"status_verbose": "product found"
}
```

- GET https://tienda.mercadona.es/api/products/{product_id} for ean. response example:

```
{
"id": "23365",
"ean": "8480000233653",
"slug": "anacardo-natural-hacendado-paquete",
"brand": "Hacendado",
"limit": 999,
"badges": {
"is_water": false,
"requires_age_check": false
},
"origin": "India",
"photos": [
{
"zoom": "https://prod-mercadona.imgix.net/images/2ae6ffebda4166b4a4a860bf81c47378.jpg?fit=crop&h=1600&w=1600",
"regular": "https://prod-mercadona.imgix.net/images/2ae6ffebda4166b4a4a860bf81c47378.jpg?fit=crop&h=600&w=600",
"thumbnail": "https://prod-mercadona.imgix.net/images/2ae6ffebda4166b4a4a860bf81c47378.jpg?fit=crop&h=300&w=300",
"perspective": 2
},
{
"zoom": "https://prod-mercadona.imgix.net/images/ebdb3b559b05398b8d191842c7be05a1.jpg?fit=crop&h=1600&w=1600",
"regular": "https://prod-mercadona.imgix.net/images/ebdb3b559b05398b8d191842c7be05a1.jpg?fit=crop&h=600&w=600",
"thumbnail": "https://prod-mercadona.imgix.net/images/ebdb3b559b05398b8d191842c7be05a1.jpg?fit=crop&h=300&w=300",
"perspective": 9
}
],
"status": null,
"details": {
"brand": "Hacendado",
"origin": "India",
"suppliers": [
{
"name": "CASA RICARDO, SA"
},
{
"name": "IMPORTACO CASA PONS S.A.U."
}
],
"legal_name": "Anacardo natural",
"description": "Anacardo natural Hacendado",
"counter_info": null,
"danger_mentions": "",
"alcohol_by_volume": null,
"mandatory_mentions": "ESTE PRODUCTO POR SU TAMAÑO NO LO DEBEN CONSUMIR MENORES DE 5 AÑOS.",
"production_variant": "",
"usage_instructions": "Consumo directo.",
"storage_instructions": "Producto natural y sin conservantes. Envasado en atmósfera protectora. Proteger de la luz. Conservar en lugar fresco y seco. Una vez abierto el envase, conservarlo cerrado y consumir el producto preferentemente en el plazo de una semana."
},
"is_bulk": false,
"packaging": "Paquete",
"published": true,
"share_url": "https://tienda.mercadona.es/product/23365/anacardo-natural-hacendado-paquete",
"thumbnail": "https://prod-mercadona.imgix.net/images/2ae6ffebda4166b4a4a860bf81c47378.jpg?fit=crop&h=300&w=300",
"categories": [
{
"id": 15,
"name": "Aperitivos",
"level": 0,
"order": 9,
"categories": [
{
"id": 133,
"name": "Frutos secos y fruta desecada",
"level": 1,
"order": 9,
"categories": [
{
"id": 479,
"name": "Frutos secos",
"level": 2,
"order": 9
}
]
}
]
}
],
"extra_info": [
null
],
"display_name": "Anacardo natural Hacendado",
"unavailable_from": null,
"is_variable_weight": false,
"price_instructions": {
"iva": 4,
"is_new": false,
"is_pack": false,
"pack_size": null,
"unit_name": null,
"unit_size": 0.2,
"bulk_price": "12.00",
"unit_price": "2.40",
"approx_size": false,
"size_format": "kg",
"total_units": null,
"unit_selector": true,
"bunch_selector": false,
"drained_weight": null,
"selling_method": 0,
"price_decreased": false,
"reference_price": "12.000",
"min_bunch_amount": 1,
"reference_format": "kg",
"previous_unit_price": "        2.50",
"increment_bunch_amount": 1
},
"unavailable_weekdays": [],
"nutrition_information": {
"allergens": "Puede contener <strong>sw</strong>. Contiene <strong>sc</strong>. Puede contener <strong>sa</strong>. Puede contener <strong>cacahuetes y productos a base de cacahuetes</strong>. Puede contener <strong>frutos de cáscara</strong>.",
"ingredients": "<strong>Anacardo.</strong> Puede contener trazas de <strong>cacahuete</strong> y otros <strong>frutos de cáscara</strong>"
}
}
```

- The product page looks like https://tienda.mercadona.es/product/{product_id}/{product_slug}
