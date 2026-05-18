/**
 * Centralized registry of all math functions, operators, and their implementations.
 * This module defines the complete set of operations available in math channel expressions.
 */

// ============================================================================
// FUNCTION DEFINITIONS
// ============================================================================

export const FUNCTIONS = {
  // Arithmetic & basic
  gain: { arity: 2 as const, description: "Multiplie par un facteur: gain(signal, factor)" },
  sqrt: { arity: 1 as const, description: "Racine carrée: sqrt(signal)" },
  abs: { arity: 1 as const, description: "Valeur absolue: abs(signal)" },
  min: { arity: 2 as const, description: "Minimum de deux signaux: min(a, b)" },
  max: { arity: 2 as const, description: "Maximum de deux signaux: max(a, b)" },
  sign: { arity: 1 as const, description: "Signe: 1 si positif, -1 si négatif, 0 si zéro: sign(signal)" },
  norm2: { arity: 2 as const, description: "Norme 2: Fait la norme euclidienne du vecteur: norm2(a, b)" },
  sat: {arity: 3 as const, description: "Saturation: Sature le signal avec une borne sup et inf fixe: sat(signal, max, min)" },
  satdyn: {arity: 3 as const, description: "Saturation: Sature le signal avec une borne sup et inf dynamique: satdyn(signal, signal_max, signal_min)" },

  // Conditional
  where: { arity: 3 as const, description: "Ternaire: where(condition, val_si_vrai, val_si_faux) — retourne val_si_vrai si condition != 0, sinon val_si_faux" },

  // Logical operations (treat as 0=false, 1=true)
  and: { arity: 2 as const, description: "ET logique: and(a, b) — 1 si tous deux non-zéro" },
  or: { arity: 2 as const, description: "OU logique: or(a, b) — 1 si au moins un non-zéro" },
  xor: { arity: 2 as const, description: "OU exclusif: xor(a, b) — 1 si exactement un non-zéro" },
  not: { arity: 1 as const, description: "NON logique: not(a) — 1 si zéro, 0 sinon" },
} as const;

export type FunctionName = keyof typeof FUNCTIONS;

// ============================================================================
// OPERATOR DEFINITIONS (precedence from lowest to highest)
// ============================================================================

export const OPERATORS = {
  // Comparison operators (lowest precedence, right-associative treated as left)
  ">": { precedence: 0, description: "Plus grand que: a > b" },
  "<": { precedence: 0, description: "Plus petit que: a < b" },
  ">=": { precedence: 0, description: "Plus grand ou égal: a >= b" },
  "<=": { precedence: 0, description: "Plus petit ou égal: a <= b" },
  "==": { precedence: 0, description: "Égal: a == b" },
  "!=": { precedence: 0, description: "Différent: a != b" },

  // Arithmetic operators (higher precedence)
  "+": { precedence: 1, description: "Addition: a + b" },
  "-": { precedence: 1, description: "Soustraction: a - b" },
  "*": { precedence: 2, description: "Multiplication: a * b" },
  "/": { precedence: 2, description: "Division: a / b" },
} as const;

export type OperatorName = keyof typeof OPERATORS;

export const COMPARISON_OPERATORS = new Set([">", "<", ">=", "<=", "==", "!="]);
export const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/"]);
export const ALL_OPERATORS = new Set(Object.keys(OPERATORS));

// ============================================================================
// FUNCTION IMPLEMENTATIONS
// ============================================================================

export function evaluateFunction(
  name: FunctionName,
  args: number[]
): number {
  switch (name) {
    case "gain":
      return args[0] * args[1];
    case "sqrt":
      return Math.sqrt(args[0]);
    case "abs":
      return Math.abs(args[0]);
    case "min":
      return Math.min(args[0], args[1]);
    case "max":
      return Math.max(args[0], args[1]);
    case "sign":
      if (args[0] > 0) return 1;
      if (args[0] < 0) return -1;
      return 0;
    case "norm2":
      return Math.sqrt(args[0]**2 + args[1]**1);
    case "sat":
      return Math.min(Math.max(args[0], args[1]), args[2]);
      case "satdyn":
      return Math.min(Math.max(args[0], args[1]), args[2]);
    case "and":
      return args[0] !== 0 && args[1] !== 0 ? 1 : 0;
    case "or":
      return args[0] !== 0 || args[1] !== 0 ? 1 : 0;
    case "xor":
      return (args[0] !== 0) !== (args[1] !== 0) ? 1 : 0;
    case "not":
      return args[0] === 0 ? 1 : 0;
    case "where":
      return args[0] !== 0 ? args[1] : args[2];
    default:
      throw new Error(`Fonction inconnue: ${name}`);
  }
}

export function evaluateOperator(
  op: OperatorName,
  left: number,
  right: number
): number {
  switch (op) {
    // Comparison operators return 0 (false) or 1 (true)
    case ">":
      return left > right ? 1 : 0;
    case "<":
      return left < right ? 1 : 0;
    case ">=":
      return left >= right ? 1 : 0;
    case "<=":
      return left <= right ? 1 : 0;
    case "==":
      return left === right ? 1 : 0;
    case "!=":
      return left !== right ? 1 : 0;

    // Arithmetic operators
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? Number.NaN : left / right;
    default:
      throw new Error(`Opérateur inconnu: ${op}`);
  }
}

// ============================================================================
// DOCUMENTATION & HELP
// ============================================================================

export function getFunctionDocumentation(): Array<{ name: string; description: string }> {
  return Object.entries(FUNCTIONS).map(([name, def]) => ({
    name,
    description: def.description,
  }));
}

export function getOperatorDocumentation(): Array<{ symbol: string; description: string }> {
  return Object.entries(OPERATORS).map(([symbol, def]) => ({
    symbol,
    description: def.description,
  }));
}

export const USAGE_GUIDE = `
Fonctions disponibles:
- gain(signal, factor): Multiplie signal par factor
- sqrt(signal): Racine carrée
- abs(signal): Valeur absolue
- min(a, b) / max(a, b): Min/Max de deux signaux
- sign(signal): Retourne 1 (positif), -1 (négatif), 0 (zéro)
- norm2(a, b): Retourne la norme euclidienne du vecteur constitué des deux signaux
- sat(signla, max, min): Retourne le signal saturé par les deux bornes indiquées
- satdyn(signal, max, min):  Retourne le signal saturé par les deux bornes indiquées

Opérateurs:
- Arithmétiques: + - * /
- Comparaisons: > < >= <= == !=
  Résultat: 1 (vrai) ou 0 (faux)

Logique (0=faux, non-zéro=vrai):
- and(a, b): ET logique
- or(a, b): OU logique
- xor(a, b): OU exclusif
- not(a): NON logique

Conditionnel:
- where(cond, a, b): Retourne a si cond != 0, sinon b
  Exemples: where(speed > 100, torque_high, torque_low)
            where(and(engine_on, not(fault)), nominal, 0)

Exemples:
- speed_filtered: gain(speed, 0.95)
- braking: sign(accel) * -1
- is_high_speed: speed > 100
- is_active: and(engine_on, not(is_fault))
- condition: xor(left_on, right_on)
`;
