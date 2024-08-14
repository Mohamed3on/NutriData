(function () {
  // Utility functions
  function calculateMetrics(nutrientInfo, priceAndWeightInfo) {
    const proteinGramsPer100g = parseFloat(nutrientInfo.protein);
    const { price, weight, pricePerKg } = priceAndWeightInfo;
    const carbGrams = parseFloat(nutrientInfo.carbs);
    const calories = parseFloat(nutrientInfo.calories);

    let proteinPerEuro = 'N/A';
    if (weight) {
      const totalProtein = (proteinGramsPer100g * weight) / 100;
      proteinPerEuro = (totalProtein / price).toFixed(1);
    } else if (pricePerKg) {
      proteinPerEuro = ((proteinGramsPer100g * 10) / pricePerKg).toFixed(1);
    }

    const proteinToCarbRatio = (proteinGramsPer100g / carbGrams).toFixed(1);
    const proteinPer100Calories = ((proteinGramsPer100g / calories) * 100).toFixed(1);

    return { proteinPerEuro, proteinToCarbRatio, proteinPer100Calories };
  }

  // UI functions
  function createInfoElement(nutrientInfo, metrics) {
    const infoElement = document.createElement('div');
    infoElement.className = 'nutri-data-info';
    infoElement.innerHTML = `
      <style>
        .nutri-data-info {
          background-color: #f8f8f8;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 15px;
          margin-top: 15px;
          width: max-content;
        }
        .nutri-data-info p {
          margin: 5px 0;
        }
        .nutri-data-info .value {
          font-weight: bold;
        }
        .nutri-data-info .divider {
          border-top: 1px solid #ddd;
          margin: 10px 0;
        }
      </style>
      ${Object.entries(metrics)
        .map(
          ([key, value]) => `
        <p>${formatLabel(key)}:
          <span class="value" style="color: ${getColorForValue(value, COLOR_THRESHOLDS[key])}">
            ${value}${key === 'proteinPerEuro' && value !== 'N/A' ? 'g/€' : ''}
          </span>
        </p>
      `
        )
        .join('')}
      <div class="divider"></div>
      ${Object.entries(nutrientInfo)
        .map(
          ([key, value]) => `
        <p>${key.charAt(0).toUpperCase() + key.slice(1)}: <span class="value">${value}</span></p>
      `
        )
        .join('')}
    `;
    return infoElement;
  }

  function formatLabel(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace('Per100', 'Per 100');
  }

  // REWE-specific functions
  const NUTRIENT_LABELS = {
    protein: 'Eiweiß',
    carbs: 'Kohlenhydrate',
    sugar: 'Kohlenhydrate, davon Zucker',
    fat: 'Fett',
    calories: 'Energie',
  };

  const COLOR_THRESHOLDS = {
    proteinPerEuro: { good: 12, bad: 4 },
    proteinToCarbRatio: { good: 2, bad: 0.1 },
    proteinPer100Calories: { good: 10, bad: 3 },
  };

  const COLORS = {
    red: [220, 53, 69],
    yellow: [255, 193, 7],
    green: [40, 167, 69],
  };

  function getNutrientInfo() {
    const table = document.querySelector('.pdpr-NutritionTable');
    const nutrientInfo = {};

    table.querySelectorAll('tbody tr').forEach((row) => {
      const [labelCell, valueCell] = row.querySelectorAll('td');
      const label = labelCell.textContent.trim();
      const value = valueCell.textContent.trim().replace(',', '.');
      const nutrientKey = Object.keys(NUTRIENT_LABELS).find(
        (key) => NUTRIENT_LABELS[key] === label
      );

      if (nutrientKey) {
        nutrientInfo[nutrientKey] = value;
      }
    });

    return nutrientInfo;
  }

  function getPriceAndWeightInfo() {
    const price = parseFloat(
      document
        .querySelector('.pdpr-Price__Price')
        .textContent.trim()
        .replace(',', '.')
        .replace(' €', '')
    );
    const grammageElement = document.querySelector('.pdsr-Grammage');
    const grammageText = grammageElement.textContent.trim();

    const weightMatch = grammageText.match(/(\d+(?:,\d+)?)\s*(g|kg|ml|l)/i);
    let weight = null;
    if (weightMatch) {
      const value = parseFloat(weightMatch[1].replace(',', '.'));
      const unit = weightMatch[2].toLowerCase();
      weight = value * (unit === 'kg' ? 1000 : unit === 'l' ? 1000 : 1);
    }

    if (!weight && grammageText.includes('Stück')) {
      const pieceWeightMatch = grammageText.match(/ca\.\s*(\d+)\s*(g|ml)/i);
      weight = pieceWeightMatch ? parseInt(pieceWeightMatch[1]) : null;
    }

    const multiPackMatch = grammageText.match(/(\d+)x([\d,]+)\s*(g|kg|ml|l)/i);
    if (multiPackMatch) {
      const count = parseInt(multiPackMatch[1]);
      const value = parseFloat(multiPackMatch[2].replace(',', '.'));
      const unit = multiPackMatch[3].toLowerCase();
      weight = count * value * (unit === 'kg' ? 1000 : unit === 'l' ? 1000 : 1);
    }

    const pricePerKgMatch = grammageText.match(/1 (kg|l) = ([\d,]+) €/);
    const pricePerKg = pricePerKgMatch ? parseFloat(pricePerKgMatch[2].replace(',', '.')) : null;

    return { price, weight, pricePerKg, grammageText };
  }

  function getInsertionPoint() {
    return document.querySelector('.bs_add2cart_container');
  }

  function interpolateColor(color1, color2, factor) {
    return color1.map((channel, i) => Math.round(channel + factor * (color2[i] - channel)));
  }

  function getColorForValue(value, thresholds) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return '';

    let factor = (numValue - thresholds.bad) / (thresholds.good - thresholds.bad);
    factor = Math.max(0, Math.min(1, factor));

    const { red, yellow, green } = COLORS;
    return `rgb(${interpolateColor(
      factor < 0.5 ? red : yellow,
      factor < 0.5 ? yellow : green,
      factor < 0.5 ? factor * 2 : (factor - 0.5) * 2
    )})`;
  }

  // Main logic
  function detectShop() {
    if (window.location.hostname.includes('shop.rewe.de')) {
      return 'rewe';
    }
    // Add more shop detection logic here
    return null;
  }

  function displayInfo(shop) {
    let nutrientInfo, priceAndWeightInfo, insertionPoint;

    switch (shop) {
      case 'rewe':
        nutrientInfo = getNutrientInfo();
        priceAndWeightInfo = getPriceAndWeightInfo();
        insertionPoint = getInsertionPoint();
        break;
      // Add cases for other shops here
      default:
        console.error('Unsupported shop');
        return;
    }

    const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);
    const infoElement = createInfoElement(nutrientInfo, metrics);

    insertionPoint.parentNode.insertBefore(infoElement, insertionPoint.nextSibling);
  }

  const shop = detectShop();
  if (shop) {
    displayInfo(shop);
  }
})();
