// Simple parser test without ts-node
// Run with: node test-parser-simple.js <path-to-.m-file>

import fs from 'fs';

// Simplified VcuAdapter for testing
class VcuAdapterTest {
  parseM(fileContent) {
    const breakpoints = {};

    const lines = fileContent.split("\n");
    let currentKey = "";
    let currentValue = "";
    let inValue = false;

    for (const line of lines) {
      const trimmed = line.trim();

      const assignMatch = trimmed.match(/^c\.APP_(.+?)\s*=\s*(.*)/);
      if (assignMatch) {
        if (currentKey && currentValue) {
          this._parseVariable(currentKey, currentValue, breakpoints);
        }

        currentKey = assignMatch[1];
        currentValue = assignMatch[2];
        inValue = true;

        if (currentValue.includes(";")) {
          this._parseVariable(
            currentKey,
            currentValue.replace(/;$/, ""),
            breakpoints
          );
          currentKey = "";
          currentValue = "";
          inValue = false;
        }
      } else if (inValue) {
        currentValue += " " + trimmed;

        if (trimmed.includes(";")) {
          this._parseVariable(
            currentKey,
            currentValue.replace(/;$/, ""),
            breakpoints
          );
          currentKey = "";
          currentValue = "";
          inValue = false;
        }
      }
    }

    if (currentKey && currentValue) {
      this._parseVariable(currentKey, currentValue, breakpoints);
    }

    return { breakpoints, cartos: {} };
  }

  _parseVariable(key, valueStr, breakpoints) {
    const suffixMatch = key.match(/^(.+?)_(Axis|XAxis|YAxis|Bkp)$/);
    if (!suffixMatch) {
      return;
    }

    const baseName = suffixMatch[1];

    const arrayMatch = valueStr.match(/\[(.*)\]/);
    if (!arrayMatch) {
      return;
    }

    try {
      const valuesStr = arrayMatch[1];
      const cleanStr = valuesStr
        .replace(/\.\.\./g, "")
        .split(/[,\s]+/)
        .filter((s) => s.length > 0);

      const values = cleanStr.map((s) => {
        const num = parseFloat(s);
        return isNaN(num) ? 0 : num;
      });

      if (values.length === 0) {
        return;
      }

      const bpKey = key;
      const humanName = baseName;

      if (!breakpoints[bpKey]) {
        breakpoints[bpKey] = {
          name: humanName,
          values: values.sort((a, b) => a - b),
          unit: undefined,
          description: `Imported from ${key}`,
        };
      } else {
        breakpoints[bpKey].values = values.sort((a, b) => a - b);
      }
    } catch (error) {
      console.error(`Failed to parse variable ${key}:`, error);
    }
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node test-parser-simple.js <path-to-.m-file>');
  process.exit(1);
}

try {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const adapter = new VcuAdapterTest();
  const parsed = adapter.parseM(fileContent);

  console.log('✅ Parsing successful!');
  console.log(`\nBreakpoints found: ${Object.keys(parsed.breakpoints).length}`);
  
  const bpEntries = Object.entries(parsed.breakpoints).slice(0, 5);
  for (const [key, bp] of bpEntries) {
    console.log(`  - ${key}: ${bp.name} (${bp.values.length} values)`);
    console.log(`    First 3 values: ${bp.values.slice(0, 3).join(', ')}`);
  }

  if (Object.keys(parsed.breakpoints).length > 5) {
    console.log(`  ... and ${Object.keys(parsed.breakpoints).length - 5} more`);
  }

  console.log(`\n✅ All breakpoints parsed successfully!`);
  process.exit(0);
} catch (error) {
  console.error('❌ Parsing failed:', error.message);
  process.exit(1);
}
