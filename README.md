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

1. Go to the [Releases page](https://github.com/yourusername/nutridata/releases) on GitHub
2. Download the latest `build-chrome.zip` file
3. Unzip the file
4. Open Chrome and go to `chrome://extensions/`
5. Enable "Developer mode" (top right)
6. Click "Load unpacked" and select the unzipped extension directory

### Option 3: Manual Installation for Firefox (Latest Features)

1. Go to the [Releases page](https://github.com/yourusername/nutridata/releases) on GitHub
2. Download the latest `build-firefox.zip` file
3. Open Firefox and go to `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Navigate to the download directory and select the zip file

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
