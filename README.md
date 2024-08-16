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
  - 💪 Protein per euro (g/€)
  - 🔥 Protein per 100 calories (g)
  - 🍞 Protein to carb ratio
- Detailed nutritional info in an easy-to-read format
- Color-coded metrics for quick assessment (🔴 to 🟢)

### Search Results Page

![Search Results with Metrics](https://github.com/user-attachments/assets/4fd39372-6287-4f0c-8842-76aa2bd47697)

- Nutritional metrics added to each product card
- **Custom sorting options:**
  - Protein per euro (High to Low)
  - Protein per 100 calories (High to Low)
  - Protein to carb ratio (High to Low)
  - Protein, Carbs, Fat (High to Low)
  - Sugar, Calories (Low to High)
- Dynamic updates for newly loaded products

### General

- 🚀 Performance-boosting data caching
- 🛒 Currently supports REWE online shop (shop.rewe.de)
- 📊 Clear separation of "Protein Content Analysis" and "Nutrients per 100g"

## 🚀 Installation

### Option 1: Chrome Web Store (Stable)

1. Visit the [NutriData Chrome Web Store page](https://chromewebstore.google.com/detail/nutridata-product-nutriti/pkgppeffgmpdjldplgbplbfcmckjemao?authuser=0&hl=en)
2. Click "Add to Chrome"

### Option 2: Manual Installation for Chrome (Latest Features)

1. Clone this repo or download the source code
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension directory

### Option 3: Manual Installation for Firefox (Latest Features)

1. Clone this repo or download the source code
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Navigate to the extension directory and select the `manifest.json` file

## 🛠 Usage

1. Visit shop.rewe.de (more shops coming soon!)
2. Browse products or search results
3. Use custom sort options to find your perfect nutritional match

## 🔧 Customization

Tweak the extension by modifying:

- `src/utils.ts`: Adjust `COLOR_THRESHOLDS` for metric color-coding
- `src/shops/rewe.ts`: Update `NUTRIENT_LABELS`
- `src/domUtils.ts`: Customize UI elements and styling

## 🤝 Contributing

Contributions are welcome! Feel free to submit a Pull Request.

## 📄 License

This project is open source under the [MIT License](LICENSE).
