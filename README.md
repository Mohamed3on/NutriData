# NutriData Chrome Extension

![CleanShot 2024-08-14 at 10  58 02@2x](https://github.com/user-attachments/assets/fab77d69-34c4-49aa-8fe5-7313281ada70)

![CleanShot 2024-08-14 at 10  58 28@2x](https://github.com/user-attachments/assets/c3a4c3e2-ce8b-4d33-b2be-2b910a441d32)

This Chrome extension enhances online shopping experiences by providing additional nutritional information and metrics for food products on supported e-commerce platforms.

## Features

### Product Page

- Displays key nutritional metrics:
  - Protein per euro (g/€)
  - Protein per 100 calories (g)
  - Protein to carb ratio
- Shows detailed nutritional information in an easy-to-read format
- Color-coded metrics for quick assessment (red to green)

### Search Results Page
 ![CleanShot 2024-08-14 at 3  43 41@2x](https://github.com/user-attachments/assets/3f5c520d-c157-4ba4-8ddc-1ab037d0dca7)


- Adds nutritional metrics to each product card
- Provides custom sorting options based on nutritional metrics:
  - Sort by protein per euro
  - Sort by protein per 100 calories
  - Sort by protein to carb ratio
 
- Dynamically updates metrics for newly loaded products when changing the sort option

### General

- Caches product data to reduce API calls and improve performance
- Currently supports REWE online shop (shop.rewe.de)

## Installation

### Option 1: Chrome Web Store

1. Visit the [NutriData Chrome Web Store page](https://chromewebstore.google.com/detail/nutridata-product-nutriti/pkgppeffgmpdjldplgbplbfcmckjemao?authuser=0&hl=en).
2. Click on "Add to Chrome" to install the extension directly from the Chrome Web Store.

### Option 2: Manual Installation (for developers)

1. Clone this repository or download the source code.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the directory containing the extension files.

## Usage

1. Visit a supported online shop (currently shop.rewe.de).
2. Browse product pages or search results to see nutritional metrics.
3. Use the custom sort options on search results pages to find products that best meet your nutritional goals.

## Customization

You can customize the extension by modifying the following:

- `src/utils.ts`: Adjust `COLOR_THRESHOLDS` for each metric to change the color-coding logic.
- `src/shops/rewe.ts`: Modify `NUTRIENT_LABELS` to update or add new nutrient labels.
- `src/domUtils.ts`: Customize the UI elements and styling of the displayed metrics.

## Adding Support for New Shops

To add support for a new online shop:

1. Create a new file in the `src/shops/` directory for the new shop.
2. Implement the `Shop` interface for the new shop, including methods to extract nutritional information and price/weight data.
3. Update the `shops` array in `src/main.ts` to include the new shop.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).
