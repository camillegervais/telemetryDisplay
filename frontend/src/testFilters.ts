/**
 * Quick test to verify filtering functions are recognized
 */

import { FUNCTIONS } from "./mathFunctions";
import { analyzeMathExpression } from "./mathChannels";

const filterFunctions = [
  "deriv",
  "derivative", 
  "integral",
  "ratelimit",
  "lowpass",
  "lowpass_butterworth",
  "highpass",
  "highpass_butterworth",
];

console.log("=== TESTING FILTER FUNCTION REGISTRATION ===\n");

// Test 1: Check if all filter functions are in FUNCTIONS registry
console.log("Test 1: Function Registration");
for (const funcName of filterFunctions) {
  const exists = funcName in FUNCTIONS;
  const status = exists ? "✅" : "❌";
  console.log(`  ${status} ${funcName}`);
}

// Test 2: Check if expressions with filters parse correctly
console.log("\nTest 2: Expression Parsing");
const testExpressions = [
  "deriv(speed)",
  "deriv(speed, 0.01)",
  "lowpass(accel, 2, 0.1)",
  "highpass(signal, 2, 0.05)",
  "ratelimit(throttle, 0.1)",
  "integral(speed, 0.3)",
  "lowpass(highpass(raw, 2, 0.05), 2, 0.1)",
];

const allowedSignals = ["speed", "accel", "signal", "throttle", "raw"];

for (const expr of testExpressions) {
  try {
    const result = analyzeMathExpression(expr, allowedSignals);
    const status = result.error ? "❌" : "✅";
    console.log(`  ${status} "${expr}"`);
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  } catch (e) {
    console.log(`  ❌ "${expr}"`);
    console.log(`     Error: ${(e as any).message}`);
  }
}

console.log("\n=== END TEST ===");
