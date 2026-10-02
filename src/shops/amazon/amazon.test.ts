import { describe, it, expect, beforeEach } from 'vitest';
import { amazonShop } from './amazon';
import { JSDOM } from 'jsdom';

describe('amazonShop', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    document = dom.window.document;
  });

  describe('getCurrency', () => {
    it('returns € for amazon.de URLs', () => {
      expect(amazonShop.getCurrency('https://www.amazon.de/some-product')).toBe('€');
    });

    it('returns £ for other Amazon URLs', () => {
      expect(amazonShop.getCurrency('https://www.amazon.co.uk/some-product')).toBe('£');
    });
  });

  describe('getPriceAndWeightInfo', () => {
    it('correctly extracts price per kg from offscreen element', async () => {
      document.body.innerHTML = `
       <span class="aok-relative"><span class="a-size-mini aok-offscreen"> &amp;euro;29.16 per kg </span><span aria-hidden="true" class="a-size-mini a-color-base aok-align-center pricePerUnit">(<span class="a-price a-text-price" data-a-size="mini" data-a-color="base"><span class="a-offscreen">€29.16</span><span aria-hidden="true">€29.16</span></span> / kg)</span></span>
      `;

      const result = await amazonShop.getPriceAndWeightInfo(document);
      expect(result.pricePerKg).toBeCloseTo(29.16, 2);
    });

    it('correctly extracts price per kg from visible text', async () => {
      document.body.innerHTML = `
        <span class="aok-relative">
          <span class="a-size-mini aok-offscreen">&euro;16.19 per kg</span>
          <span aria-hidden="true" class="a-size-mini a-color-base aok-align-center pricePerUnit">
            (<span class="a-price a-text-price" data-a-size="mini" data-a-color="base">
              <span class="a-offscreen">€16.19</span>
              <span aria-hidden="true">€16.19</span>
            </span> / kg)
          </span>
        </span>
      `;

      const result = await amazonShop.getPriceAndWeightInfo(document);
      expect(result.pricePerKg).toBeCloseTo(16.19, 2);
    });

    it('returns null when no price information is found', async () => {
      document.body.innerHTML = `
        <span class="aok-relative">
          <span class="a-size-mini a-color-base">No price information available</span>
        </span>
      `;

      const result = await amazonShop.getPriceAndWeightInfo(document);
      expect(result.pricePerKg).toBeNull();
    });

    it('correctly handles price per gram', async () => {
      document.body.innerHTML = `
        <span class="aok-relative">
          <span class="a-size-mini aok-offscreen">&euro;0.0292 per g</span>
          <span aria-hidden="true" class="a-size-mini a-color-base aok-align-center pricePerUnit">
            (<span class="a-price a-text-price" data-a-size="mini" data-a-color="base">
              <span class="a-offscreen">€0.0292</span>
              <span aria-hidden="true">€0.0292</span>
            </span> / g)
          </span>
        </span>
      `;

      const result = await amazonShop.getPriceAndWeightInfo(document);
      expect(result.pricePerKg).toBeCloseTo(29.2, 2);
    });

    it('correctly extracts price per kg from the provided HTML structure', async () => {
      document.body.innerHTML = `
        <span class="aok-relative"><span class="a-size-mini aok-offscreen"> &amp;euro;16.19 per kg </span><span aria-hidden="true" class="a-size-mini a-color-base aok-align-center pricePerUnit">(<span class="a-price a-text-price" data-a-size="mini" data-a-color="base"><span class="a-offscreen">€16.19</span><span aria-hidden="true">€16.19</span></span> / kg)</span></span>
      `;

      const result = await amazonShop.getPriceAndWeightInfo(document);
      expect(result.pricePerKg).toBeCloseTo(16.19, 2);
    });

    it('correctly handles price per 100g', async () => {
      document.body.innerHTML = `
        <span aria-hidden="true" class="a-size-mini a-color-base aok-align-center pricePerUnit">(<span class="a-price a-text-price" data-a-size="mini" data-a-color="base"><span class="a-offscreen">£2.65</span><span aria-hidden="true">£2.65</span></span> /100 g)</span>
      `;

      const result = await amazonShop.getPriceAndWeightInfo(document);
      expect(result.pricePerKg).toBeCloseTo(26.5, 2);
    });

    it('correctly extracts price per kg from aria-hidden="false" element', async () => {
      document.body.innerHTML = `
        <span class="aok-relative"><span aria-hidden="false" class="a-size-mini a-color-base aok-align-center a-text-normal">(<span class="a-price a-text-price" data-a-size="mini" data-a-color="base"><span class="a-offscreen">£4.67</span><span aria-hidden="true">£4.67</span></span> / kg)</span></span>
      `;

      const result = await amazonShop.getPriceAndWeightInfo(document);
      expect(result.pricePerKg).toBeCloseTo(4.67, 2);
    });

    it('extracts price per kg when the currency follows the number', async () => {
      document.body.innerHTML = `
        <span class="aok-relative"><span class="a-size-mini a-color-base aok-align-center a-text-normal">(<span class="a-price a-text-price" data-a-size="mini" data-a-color="base"><span class="a-offscreen">4,42€</span><span aria-hidden="true">4,42€</span></span> / kg)</span></span>
      `;

      const result = await amazonShop.getPriceAndWeightInfo(document);
      expect(result.pricePerKg).toBeCloseTo(4.42, 2);
    });
  });

  describe('getNutrientInfo', () => {
    it('correctly handles various nutrient value formats', async () => {
      const dom = new JSDOM(`
        <table id="productDetails_techSpec_section_2">
          <tr>
            <th>Protein</th>
            <td>< 0.1 g</td>
          </tr>
          <tr>
            <th>Energy (kcal)</th>
            <td>‎418.73 kcal</td>
          </tr>
          <tr>
            <th>Carbohydrate</th>
            <td>‎8,3 g</td>
          </tr>
        </table>
      `);

      const nutrientInfo = await amazonShop.getNutrientInfo(dom.window.document);

      expect(nutrientInfo?.protein).toBe('0.1 g');
      expect(nutrientInfo?.calories).toBe('418.73 kcal');
      expect(nutrientInfo?.carbs).toBe('8.3 g');
    });

    // Amazon's EU nutrition-facts card (Arla Skyr, B014RK1FF2), as served in
    // each site language; classes stripped.
    const expected = {
      calories: '63 kcal',
      fat: '0.2 g',
      saturatedFat: '0.1 g',
      carbs: '4 g',
      sugar: '4 g',
      protein: '11 g',
      salt: '0.14 g',
    };

    it('reads the nutrition-facts card in English', async () => {
      const dom = new JSDOM(`
        <table id="nic-eu-nutrition-facts-nutrients"><tbody>
          <tr id="nic-eu-nutrition-facts-energy"><td><span>Energy</span></td><td><span>264kJ / 63kcal</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Fat</span></td><td><span>0.2g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>of which</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Saturates</span></td><td><span>0.1g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>of which</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Carbohydrates</span></td><td><span>4g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>of which</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Sugars</span></td><td><span>4g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>of which</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Protein</span></td><td><span>11g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>of which</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Salt</span></td><td><span>0.14g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>of which</span></td></tr>
        </tbody></table>
      `);

      expect(await amazonShop.getNutrientInfo(dom.window.document)).toEqual(expected);
    });

    it('reads the nutrition-facts card in German', async () => {
      const dom = new JSDOM(`
        <table id="nic-eu-nutrition-facts-nutrients"><tbody>
          <tr id="nic-eu-nutrition-facts-energy"><td><span>Energie</span></td><td><span>264kJ / 63kcal</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Fett</span></td><td><span>0,2g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>davon</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Gesättigte Fettsäuren</span></td><td><span>0,1g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>davon</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Kohlenhydrate</span></td><td><span>4g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>davon</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Zucker</span></td><td><span>4g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>davon</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Protein</span></td><td><span>11g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>davon</span></td></tr>
          <tr id="nic-eu-nutrition-facts-macronutrients"><td><span>— </span><span>Salz</span></td><td><span>0,14g</span></td></tr>
          <tr id="nic-eu-nutrition-facts-nutrients-of-which"><td><span>davon</span></td></tr>
        </tbody></table>
      `);

      expect(await amazonShop.getNutrientInfo(dom.window.document)).toEqual(expected);
    });
  });
});
