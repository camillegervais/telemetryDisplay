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
  and_: { arity: 2 as const, description: "ET logique: and_(a, b) — 1 si tous deux non-zéro" },
  or_: { arity: 2 as const, description: "OU logique: or_(a, b) — 1 si au moins un non-zéro" },
  xor_: { arity: 2 as const, description: "OU exclusif: xor_(a, b) — 1 si exactement un non-zéro" },
  not_: { arity: 1 as const, description: "NON logique: not_(a) — 1 si zéro, 0 sinon" },

  // Filtering functions (signal processing) - these are backend-only
  // Frontend stores min arity for parsing; actual implementation varies on backend
  deriv: { arity: 1 as const, description: "Dérivée du signal: deriv(signal, tLap)" },
  derivative: { arity: 1 as const, description: "Alias pour deriv: derivative(signal, tLap)" },
  ratelimit: { arity: 2 as const, description: "Limite le taux de changement: ratelimit(signal, tLap, min_rate, max_rate)" },
  ratelimit_dyn: { arity: 2 as const, description: "Limite le taux de changement du signal avec des bornes dynamiques: ratelimit_dyn(signal, tLap, min_rate, max_rate)"},
  integral: { arity: 1 as const, description: "Intégrale cumulative: integral(signal, tLap)" },
  lowpass: { arity: 1 as const, description: "Filtre passe-bas Butterworth: lowpass(signal, tLap, order, normalized_freq)" },
  lowpass_butterworth: { arity: 1 as const, description: "Filtre passe-bas Butterworth: lowpass_butterworth(signal, tLap, order, normalized_freq)" },
  highpass: { arity: 1 as const, description: "Filtre passe-haut Butterworth: highpass(signal, tLap order, normalized_freq)" },
  highpass_butterworth: { arity: 1 as const, description: "Filtre passe-haut Butterworth: highpass_butterworth(signal, tLap, order, normalized_freq)" },
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
      return Math.sqrt(args[0]**2 + args[1]**2);
    case "sat":
      return Math.min(Math.max(args[0], args[1]), args[2]);
      case "satdyn":
      return Math.min(Math.max(args[0], args[1]), args[2]);
    case "and_":
      return args[0] !== 0 && args[1] !== 0 ? 1 : 0;
    case "or_":
      return args[0] !== 0 || args[1] !== 0 ? 1 : 0;
    case "xor_":
      return (args[0] !== 0) !== (args[1] !== 0) ? 1 : 0;
    case "not_":
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
      // Return 0 on division-by-zero to keep on-the-fly evaluation stable
      return right === 0 ? 0 : left / right;
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

ARITHMÉTIQUE & LOGIQUE:
- gain(signal, factor): Multiplie signal par factor
- sqrt(signal): Racine carrée
- abs(signal): Valeur absolue
- min(a, b) / max(a, b): Min/Max de deux signaux
- sign(signal): Retourne 1 (positif), -1 (négatif), 0 (zéro)
- norm2(a, b): Norme euclidienne du vecteur (a, b)
- sat(signal, max, min): Saturation avec bornes fixes
- satdyn(signal, max, min): Saturation avec bornes dynamiques

FILTRAGE DE SIGNAUX (Exécution backend):
- deriv(signal, tLap): Dérivée (taux de changement)
- integral(signal , tLap): Intégrale cumulative
- ratelimit(signal, tLap, min_rate, max_rate): Limite le taux de changement
- lowpass(signal, tLap, order, freq): Filtre passe-bas
  * Paramètres: order=2 (défaut), freq=50 (Hz)
- highpass(signal, tLap, order, freq): Filtre passe-haut
  * Paramètres: order=2 (défaut), freq=50 (Hz)

Opérateurs:
- Arithmétiques: + - * /
- Comparaisons: > < >= <= == !=
- Logiques: and_(a, b), or_(a, b), xor_(a, b), not_(a)
- Conditionnel: where(cond, a, b)

EXEMPLES AVEC FILTRES:
- deriv(speed, tLap): Taux d'accélération
- integral(accel, tLap): Vitesse intégrée
- ratelimit(throttle, tLap, -0.05, 0.05): Lisse les ordres de commande
- lowpass(sensor, tLap, 2, 0.1): Supprime le bruit haute fréquence
- highpass(raw, tLap, 2, 0.05): Supprime la dérive basse fréquence

COMBINAISON:
- Commande lissée: ratelimit(lowpass(throttle, tLap, 2, 0.2), tLap, 0.1)
- Signal nettoyé: lowpass(highpass(sensor, tLap, 2, 0.05), tLap, 2, 0.1)

Note: Les filtres s'exécutent sur l'ensemble du signal côté serveur.
`;
