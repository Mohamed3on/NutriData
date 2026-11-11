// Browser entry: build-protein-site.ts bundles this into the REWE page.
import { rowToProduct, reweCard, byScore } from './rewe-card';

(globalThis as any).ReweCard = { rowToProduct, reweCard, byScore };
