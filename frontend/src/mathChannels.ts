import type { MathChannel } from "./types";

type TokenType = "number" | "identifier" | "operator" | "left-paren" | "right-paren" | "comma";

type Token = {
  type: TokenType;
  value: string;
};

type RpnToken =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "function"; name: "gain" | "sqrt" | "abs" | "min" | "max"; arity: 1 | 2 };

const SUPPORTED_FUNCTIONS: Record<string, 1 | 2> = {
  gain: 2,
  sqrt: 1,
  abs: 1,
  min: 2,
  max: 2,
};

const OP_PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let idx = 0;

  while (idx < expression.length) {
    const ch = expression[idx];

    if (/\s/.test(ch)) {
      idx += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let end = idx + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end])) {
        end += 1;
      }
      tokens.push({ type: "number", value: expression.slice(idx, end) });
      idx = end;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let end = idx + 1;
      while (end < expression.length && /[A-Za-z0-9_]/.test(expression[end])) {
        end += 1;
      }
      tokens.push({ type: "identifier", value: expression.slice(idx, end) });
      idx = end;
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "operator", value: ch });
      idx += 1;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "left-paren", value: ch });
      idx += 1;
      continue;
    }

    if (ch === ")") {
      tokens.push({ type: "right-paren", value: ch });
      idx += 1;
      continue;
    }

    if (ch === ",") {
      tokens.push({ type: "comma", value: ch });
      idx += 1;
      continue;
    }

    throw new Error(`Caractere invalide: ${ch}`);
  }

  return injectUnaryMinus(tokens);
}

function injectUnaryMinus(tokens: Token[]): Token[] {
  const nextTokens: Token[] = [];

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    const prev = idx > 0 ? tokens[idx - 1] : null;

    const isUnaryMinus =
      token.type === "operator" &&
      token.value === "-" &&
      (prev === null ||
        prev.type === "operator" ||
        prev.type === "left-paren" ||
        prev.type === "comma");

    if (isUnaryMinus) {
      nextTokens.push({ type: "number", value: "0" });
      nextTokens.push(token);
      continue;
    }

    nextTokens.push(token);
  }

  return nextTokens;
}

function toRpn(tokens: Token[]): { rpn: RpnToken[]; dependencies: string[] } {
  const output: RpnToken[] = [];
  const stack: Array<Token & { functionName?: string }> = [];
  const deps = new Set<string>();

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];

    if (token.type === "number") {
      const value = Number(token.value);
      if (!Number.isFinite(value)) {
        throw new Error(`Nombre invalide: ${token.value}`);
      }
      output.push({ type: "number", value });
      continue;
    }

    if (token.type === "identifier") {
      const next = idx + 1 < tokens.length ? tokens[idx + 1] : null;
      if (next?.type === "left-paren") {
        if (!(token.value in SUPPORTED_FUNCTIONS)) {
          throw new Error(`Fonction non supportee: ${token.value}`);
        }
        stack.push({ ...token, functionName: token.value });
      } else {
        output.push({ type: "identifier", value: token.value });
        deps.add(token.value);
      }
      continue;
    }

    if (token.type === "operator") {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (
          top.type === "operator" &&
          OP_PRECEDENCE[top.value] >= OP_PRECEDENCE[token.value]
        ) {
          output.push({ type: "operator", value: top.value as "+" | "-" | "*" | "/" });
          stack.pop();
          continue;
        }
        break;
      }
      stack.push(token);
      continue;
    }

    if (token.type === "left-paren") {
      stack.push(token);
      continue;
    }

    if (token.type === "comma") {
      while (stack.length > 0 && stack[stack.length - 1].type !== "left-paren") {
        const top = stack.pop();
        if (!top) {
          break;
        }
        if (top.type === "operator") {
          output.push({ type: "operator", value: top.value as "+" | "-" | "*" | "/" });
        }
      }
      if (stack.length === 0) {
        throw new Error("Virgule hors appel de fonction");
      }
      continue;
    }

    if (token.type === "right-paren") {
      while (stack.length > 0 && stack[stack.length - 1].type !== "left-paren") {
        const top = stack.pop();
        if (!top) {
          break;
        }
        if (top.type === "operator") {
          output.push({ type: "operator", value: top.value as "+" | "-" | "*" | "/" });
        }
      }

      const left = stack.pop();
      if (!left || left.type !== "left-paren") {
        throw new Error("Parentheses desequilibrees");
      }

      const maybeFunction = stack[stack.length - 1];
      if (maybeFunction?.type === "identifier" && maybeFunction.functionName) {
        stack.pop();
        output.push({
          type: "function",
          name: maybeFunction.functionName as "gain" | "sqrt" | "abs" | "min" | "max",
          arity: SUPPORTED_FUNCTIONS[maybeFunction.functionName],
        });
      }
      continue;
    }
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) {
      continue;
    }
    if (top.type === "left-paren" || top.type === "right-paren") {
      throw new Error("Parentheses desequilibrees");
    }
    if (top.type === "operator") {
      output.push({ type: "operator", value: top.value as "+" | "-" | "*" | "/" });
      continue;
    }
    if (top.type === "identifier") {
      throw new Error(`Fonction incomplete: ${top.value}`);
    }
  }

  return { rpn: output, dependencies: Array.from(deps) };
}

function evaluateRpnAtIndex(rpn: RpnToken[], signalValues: Record<string, number[]>, idx: number): number {
  const stack: number[] = [];

  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }

    if (token.type === "identifier") {
      const values = signalValues[token.value];
      if (!values || idx >= values.length) {
        stack.push(Number.NaN);
      } else {
        stack.push(values[idx]);
      }
      continue;
    }

    if (token.type === "operator") {
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) {
        throw new Error("Expression invalide");
      }
      if (token.value === "+") {
        stack.push(left + right);
      } else if (token.value === "-") {
        stack.push(left - right);
      } else if (token.value === "*") {
        stack.push(left * right);
      } else {
        stack.push(right === 0 ? Number.NaN : left / right);
      }
      continue;
    }

    if (token.type === "function") {
      if (token.name === "gain") {
        const factor = stack.pop();
        const value = stack.pop();
        if (value === undefined || factor === undefined) {
          throw new Error("gain() attend 2 arguments");
        }
        stack.push(value * factor);
      } else if (token.name === "sqrt") {
        const value = stack.pop();
        if (value === undefined) {
          throw new Error("sqrt() attend 1 argument");
        }
        stack.push(Math.sqrt(value));
      } else if (token.name === "abs") {
        const value = stack.pop();
        if (value === undefined) {
          throw new Error("abs() attend 1 argument");
        }
        stack.push(Math.abs(value));
      } else if (token.name === "min") {
        const right = stack.pop();
        const left = stack.pop();
        if (left === undefined || right === undefined) {
          throw new Error("min() attend 2 arguments");
        }
        stack.push(Math.min(left, right));
      } else if (token.name === "max") {
        const right = stack.pop();
        const left = stack.pop();
        if (left === undefined || right === undefined) {
          throw new Error("max() attend 2 arguments");
        }
        stack.push(Math.max(left, right));
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error("Expression invalide");
  }

  return stack[0];
}

export function analyzeMathExpression(
  expression: string,
  allowedSignals: string[]
): { dependencies: string[]; error: string | null } {
  const cleanExpr = expression.trim();
  if (!cleanExpr) {
    return { dependencies: [], error: "Expression vide" };
  }

  try {
    const tokens = tokenize(cleanExpr);
    const { dependencies } = toRpn(tokens);

    if (dependencies.length === 0) {
      return { dependencies, error: "Expression sans signal" };
    }

    const allowed = new Set(allowedSignals);
    const unknown = dependencies.filter((dep) => !allowed.has(dep));
    if (unknown.length > 0) {
      return { dependencies, error: `Signal inconnu: ${unknown.join(", ")}` };
    }

    return { dependencies, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expression invalide";
    return { dependencies: [], error: message };
  }
}

export function evaluateMathChannel(channel: MathChannel, signalValues: Record<string, number[]>): number[] {
  const tokens = tokenize(channel.expression);
  const { rpn } = toRpn(tokens);

  const lengths = channel.dependencies
    .map((dep) => signalValues[dep]?.length ?? 0)
    .filter((len) => len > 0);

  if (lengths.length === 0) {
    return [];
  }

  const length = Math.min(...lengths);
  const output = new Array<number>(length);
  for (let idx = 0; idx < length; idx += 1) {
    output[idx] = evaluateRpnAtIndex(rpn, signalValues, idx);
  }

  return output;
}
