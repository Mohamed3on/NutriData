import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { reweShop } from './rewe';

describe('reweShop', () => {
  describe('getPriceAndWeightInfo', () => {
    it('correctly extracts price and weight information', async () => {
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

      const result = await reweShop.getPriceAndWeightInfo(dom.window.document);

      expect(result).toEqual({
        price: 1.05,
        weight: 1,
        pricePerKg: 1.05,
      });
    });

    it('correctly extracts price and weight information for Iglo Veggie Love product', async () => {
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

      const result = await reweShop.getPriceAndWeightInfo(dom.window.document);

      expect(result).toEqual({
        price: 3.79,
        weight: 400,
        pricePerKg: 9.48,
      });
    });

    it('correctly extracts price and weight information for ja! Latte Macchiato product', async () => {
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

      const result = await reweShop.getPriceAndWeightInfo(dom.window.document);

      expect(result).toEqual({
        price: 0.75,
        weight: 250,
        pricePerKg: 3,
      });
    });
  });
});
