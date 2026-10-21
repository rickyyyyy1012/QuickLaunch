import { LauncherResult } from "../../shared/ipc";
import { Provider, ProviderContext } from "../../shared/providers";

type Unit = { name: string; aliases: string[]; factor: number; group: string };
const UNITS: Unit[] = [
  { name: "meters", aliases: ["m", "meter", "meters"], factor: 1, group: "length" },
  { name: "kilometers", aliases: ["km", "kilometer", "kilometers"], factor: 1000, group: "length" },
  { name: "miles", aliases: ["mi", "mile", "miles"], factor: 1609.344, group: "length" },
  { name: "feet", aliases: ["ft", "foot", "feet"], factor: 0.3048, group: "length" },
  { name: "inches", aliases: ["in", "inch", "inches"], factor: 0.0254, group: "length" },
  { name: "grams", aliases: ["g", "gram", "grams"], factor: 1, group: "mass" },
  { name: "kilograms", aliases: ["kg", "kilogram", "kilograms"], factor: 1000, group: "mass" },
  { name: "pounds", aliases: ["lb", "lbs", "pound", "pounds"], factor: 453.59237, group: "mass" },
  { name: "celsius", aliases: ["c", "°c", "celsius"], factor: 1, group: "temperature" },
  { name: "fahrenheit", aliases: ["f", "°f", "fahrenheit"], factor: 1, group: "temperature" },
];

function findUnit(value: string): Unit | undefined {
  return UNITS.find((unit) => unit.aliases.includes(value.toLowerCase()));
}

function convert(value: number, from: Unit, to: Unit): number {
  if (from.group !== to.group) throw new Error("Incompatible units.");
  if (from.group === "temperature") {
    const celsius = from.name === "fahrenheit" ? (value - 32) * 5 / 9 : value;
    return to.name === "fahrenheit" ? celsius * 9 / 5 + 32 : celsius;
  }
  return value * from.factor / to.factor;
}

export class UnitsProvider implements Provider {
  readonly id = "units";
  readonly title = "Unit conversion";

  async search(text: string, _context: ProviderContext): Promise<LauncherResult[]> {
    const match = text.match(/^\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-z°]+)\s+(?:in|to)\s+([a-z°]+)\s*$/i);
    if (!match) return [];
    const from = findUnit(match[2]);
    const to = findUnit(match[3]);
    if (!from || !to) return [];
    try {
      const result = convert(Number(match[1]), from, to);
      return [{
        id: `units:${text.toLowerCase()}`,
        providerId: this.id,
        kind: "unit",
        title: `${result} ${to.name}`,
        subtitle: `${match[1]} ${from.name}`,
        score: 1,
        uri: `quicklaunch:copy:${result} ${to.name}`,
      }];
    } catch {
      return [];
    }
  }
}
