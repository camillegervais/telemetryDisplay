// Test script to validate VCU adapter parsing
// This is just for verification - not part of the production build

import fs from 'fs';
import { VcuAdapter } from './vcuAdapter';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx ts-node test-parser.ts <path-to-.m-file>');
  process.exit(1);
}

try {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const adapter = new VcuAdapter();
  const parsed = adapter.parseM(fileContent);

  console.log('✅ Parsing successful!');
  console.log(`\nBreakpoints found: ${Object.keys(parsed.breakpoints).length}`);
  
  // Show first 5 breakpoints
  const bpEntries = Object.entries(parsed.breakpoints).slice(0, 5);
  for (const [key, bp] of bpEntries) {
    console.log(`  - ${key}: ${bp.name} (${bp.values.length} values)`);
    console.log(`    First 3 values: ${bp.values.slice(0, 3).join(', ')}`);
  }

  if (Object.keys(parsed.breakpoints).length > 5) {
    console.log(`  ... and ${Object.keys(parsed.breakpoints).length - 5} more`);
  }

  console.log(`\nCartos found: ${Object.keys(parsed.cartos).length}`);
} catch (error) {
  console.error('❌ Parsing failed:', error);
  process.exit(1);
}
