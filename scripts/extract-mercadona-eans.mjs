#!/usr/bin/env node

import fs from 'node:fs';

function printUsage() {
  console.log(`Usage:
  node scripts/extract-mercadona-eans.mjs --input ./storage-export.json [--output ./mercadona-eans.txt]

Input:
  --input   JSON file produced from chrome.storage.local.get(null)
  --output  Optional newline-delimited output file. Defaults to stdout.
`);
}

function parseArgs(argv) {
  const args = { input: '', output: '' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      args.input = argv[++i] || '';
    } else if (arg === '--output') {
      args.output = argv[++i] || '';
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.input) {
    printUsage();
    throw new Error('--input is required');
  }

  return args;
}

function extractEans(storage) {
  const eans = new Set();

  for (const [key, value] of Object.entries(storage || {})) {
    if (key.startsWith('mercadona-product-') && value && typeof value === 'object') {
      const ean = typeof value.ean === 'string' ? value.ean.trim() : '';
      if (ean) eans.add(ean);
      continue;
    }

    if (key.startsWith('off-')) {
      const ean = key.slice(4).trim();
      if (ean) eans.add(ean);
    }
  }

  return [...eans].sort();
}

try {
  const { input, output } = parseArgs(process.argv.slice(2));
  const storage = JSON.parse(fs.readFileSync(input, 'utf8'));
  const eans = extractEans(storage);
  const content = eans.join('\n');

  if (output) {
    fs.writeFileSync(output, content);
  } else {
    process.stdout.write(content);
  }

  console.error(`Extracted ${eans.length} EANs from ${input}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
