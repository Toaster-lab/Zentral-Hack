// Barcode lookup for scanning. The records come from the pilot catalogue (data/catalogue.js), so Scan and Discover
// always agree. Only the catalogue is known (three real drinks plus labelled examples): any other barcode is "not in this pilot catalogue".
import { CATALOGUE, PRODUCT_COUNT } from './catalogue.js';

export const BARCODES = Object.fromEntries(CATALOGUE.map((p) => [p.barcode, p]));

// Shown as the "try a barcode" suggestions on the Scan screen.
export const BARCODE_LIST = CATALOGUE.map((p) => ({ code: p.barcode, name: `${p.name}, ${p.size}`, sample: p.source === 'sample' }));
export const BARCODE_COUNT = PRODUCT_COUNT;
