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

  describe('buildCollectPayload', () => {
    it('takes German categories from the JSON-LD breadcrumb and the market from metaData, even on a translated page', () => {
      const productData = {
        productId: '9558571',
        isBuyable: false,
        marketCode: '433222',
        categories: ['186'],
        pricing: { price: 199, grammage: '250g (1 kg = 7,96 €)' },
        packaging: { weightPerPiece: 250 },
      };
      const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 2, item: { name: 'Butter &amp; Margarine' } },
          { '@type': 'ListItem', position: 1, item: { name: 'Käse, Eier &amp; Molkerei' } },
          { '@type': 'ListItem', position: 3, item: { name: 'Butter' } },
        ],
      };
      const dom = new JSDOM(`
        <html lang="en" class="translated-ltr">
          <body>
            <ul class="plr-ProductPageBreadcrumbs__List">
              <li><a class="plr-ProductPageBreadcrumbs__Link">Shop Homepage</a></li>
              <li><a class="plr-ProductPageBreadcrumbs__Link">Cheese, eggs &amp; dairy</a></li>
            </ul>
            <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
            <script id="pdpr-propstore-123">${JSON.stringify({ productData, metaData: { marketCode: '240557' } })}</script>
          </body>
        </html>
      `);

      const payload = reweShop.buildCollectPayload!(dom.window.document, { protein: '0.7 g' } as never);

      expect(payload).toMatchObject({
        shop_id: '9558571',
        categories: ['Käse, Eier & Molkerei', 'Butter & Margarine', 'Butter'],
        market: '240557',
        buyable: false,
        price_per_unit: 7.96,
      });
    });
  });
});
