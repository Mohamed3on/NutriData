# NutriData Chrome Extension

![CleanShot 2024-08-14 at 10  58 02@2x](https://github.com/user-attachments/assets/fab77d69-34c4-49aa-8fe5-7313281ada70)

![CleanShot 2024-08-14 at 10  58 28@2x](https://github.com/user-attachments/assets/c3a4c3e2-ce8b-4d33-b2be-2b910a441d32)

This Chrome extension enhances online shopping experiences by providing additional nutritional information and metrics for food products on supported e-commerce platforms.

## Features

- Displays protein per euro, protein to carb ratio, and protein per 100 calories
- Shows nutritional information in an easy-to-read format
- Color-coded metrics for quick assessment
- Currently supports REWE online shop (shop.rewe.de)

## Installation

1. Clone this repository or download the source code.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the directory containing the extension files.

## Usage

1. Visit a supported online shop (currently shop.rewe.de).
2. Navigate to a product page.
3. The extension will automatically display the nutritional information and calculated metrics below the product details.

## Customization

You can customize the extension by modifying the following in `src/main.js`:

- `COLOR_THRESHOLDS`: Adjust the thresholds for good and bad values for each metric.
- `COLORS`: Modify the colors used for the metric indicators.
- `NUTRIENT_LABELS`: Update or add new nutrient labels if needed.

## Adding Support for New Shops

To add support for a new online shop:

1. Modify the `detectShop()` function to recognize the new shop's URL.
2. Create new functions to extract nutritional information and price/weight data specific to the new shop's HTML structure.
3. Add a new case in the `displayInfo()` function to handle the new shop.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).
