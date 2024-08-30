import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { getCategories, reweShop } from './rewe';

describe('reweShop', () => {
  describe('getPriceAndWeightInfo', () => {
    it('correctly extracts price and weight information', () => {
      const productData = {
        pricing: {
          price: 105,
          grammage: '1l',
        },
        packaging: {
          weightPerPiece: 1,
          volumeCode: 'STK',
        },
      };

      const dom = new JSDOM(`
        <html>
          <body>
            <script id="pdpr-propstore-123">
              ${JSON.stringify({ productData })}
            </script>
          </body>
        </html>
      `);

      const result = reweShop.getPriceAndWeightInfo(dom.window.document);

      expect(result).toEqual({
        price: 1.05,
        weight: 1,
        pricePerKg: 1.05,
      });
    });

    it('correctly extracts price and weight information for Iglo Veggie Love product', () => {
      const productData = {
        pricing: {
          price: 379,
          grammage: '400g (1 kg = 9,48 €)',
        },
        packaging: {
          weightPerPiece: 400,
          volumeCode: 'STK',
        },
      };

      const dom = new JSDOM(`
        <html>
          <body>
            <script id="pdpr-propstore-123">
              ${JSON.stringify({ productData })}
            </script>
          </body>
        </html>
      `);

      const result = reweShop.getPriceAndWeightInfo(dom.window.document);

      expect(result).toEqual({
        price: 3.79,
        weight: 400,
        pricePerKg: 9.48,
      });
    });

    it('correctly extracts price and weight information for ja! Latte Macchiato product', () => {
      const productData = {
        pricing: {
          price: 75,
          grammage: '250ml (1 l = 3 €)',
        },
        packaging: {
          weightPerPiece: 250,
          volumeCode: 'STK',
        },
      };

      const dom = new JSDOM(`
        <html>
          <body>
            <script id="pdpr-propstore-123">
              ${JSON.stringify({ productData })}
            </script>
          </body>
        </html>
      `);

      const result = reweShop.getPriceAndWeightInfo(dom.window.document);

      expect(result).toEqual({
        price: 0.75,
        weight: 250,
        pricePerKg: 3,
      });
    });
  });

  describe('getCategories', () => {
    it('correctly extracts categories from breadcrumbs', () => {
      const dom = new JSDOM(`
        <html>
          <body>
            <div class="lr-breadcrumbs">
              <a href="/c/kaese-eier-molkerei/" class="lr-breadcrumbs__link lr-breadcrumbs__back" onclick="handleBreadcrumbClick(&quot;3684&quot;); return true">
                <div class="lr-arrow-left"></div> Käse, Eier & Molkerei
              </a>
              <a href="/c/milch/" class="lr-breadcrumbs__link" onclick="handleBreadcrumbClick(&quot;3732&quot;); return true">
                <div class="lr-arrow-right"></div> Milch
              </a>
              <a href="/c/milchgetraenke/" class="lr-breadcrumbs__link" onclick="handleBreadcrumbClick(&quot;3243&quot;); return true">
                <div class="lr-arrow-right"></div> Milchgetränke
              </a>
              <a href="/c/eiskaffee/" class="lr-breadcrumbs__link lr-breadcrumbs__link--active" onclick="handleBreadcrumbClick(&quot;3245&quot;); return true">
                <div class="lr-arrow-right"></div> Eiskaffee
              </a>
            </div>
          </body>
        </html>
      `);

      const result = getCategories(dom.window.document);

      expect(result).toEqual(['Käse, Eier & Molkerei', 'Milch', 'Milchgetränke', 'Eiskaffee']);
    });
  });
});
