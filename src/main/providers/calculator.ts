import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";

class ExpressionParser {
  private position = 0;

  constructor(private readonly input: string) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.position !== this.input.length || !Number.isFinite(value)) throw new Error("Invalid expression.");
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipWhitespace();
      const operator = this.input[this.position];
      if (operator !== "+" && operator !== "-") return value;
      this.position++;
      const right = this.parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (true) {
      this.skipWhitespace();
      const operator = this.input[this.position];
      if (operator !== "*" && operator !== "/" && operator !== "%") return value;
      this.position++;
      const right = this.parseUnary();
      if ((operator === "/" || operator === "%") && right === 0) throw new Error("Cannot divide by zero.");
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.input[this.position] === "+") {
      this.position++;
      return this.parseUnary();
    }
    if (this.input[this.position] === "-") {
      this.position++;
      return -this.parseUnary();
    }
    if (this.input[this.position] === "(") {
      this.position++;
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.input[this.position] !== ")") throw new Error("Missing closing parenthesis.");
      this.position++;
      return value;
    }
    return this.parseNumber();
  }

  private parseNumber(): number {
    this.skipWhitespace();
    const match = this.input.slice(this.position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) throw new Error("Expected a number.");
    this.position += match[0].length;
    return Number(match[0]);
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.input[this.position] ?? "")) this.position++;
  }
}

export function evaluateExpression(input: string): number {
  return new ExpressionParser(input).parse();
}

export class CalculatorProvider implements Provider {
  readonly id = "calculator";
  readonly title = "Calculator";

  async search(text: string, _context: ProviderContext): Promise<LauncherResult[]> {
    if (!text || !/^[\d\s.+\-*/%()eE]+$/.test(text)) return [];
    try {
      const value = evaluateExpression(text);
      return [{
        id: `calculator:${text}`,
        providerId: this.id,
        kind: "calculator",
        title: String(value),
        subtitle: text,
        score: 1,
        uri: `quicklaunch:copy:${value}`,
      }];
    } catch {
      return [];
    }
  }
}
