import { fitNumber, parseNumber, stepNumber } from "src/utils/number-widget";

describe("number widget", () => {
  it("steps integers by whole steps and floats without drift", () => {
    const integer = stepNumber(20, 1, { type: "integer", step: 0.4 });
    const float = stepNumber(0.2, 1, { type: "float", step: 0.1 });
    const empty = stepNumber(null, -1, { type: "integer" });

    expect(integer).toBe(21);
    expect(float).toBe(0.3);
    expect(empty).toBe(-1);
  });

  it("holds values to min and max", () => {
    const spec = { type: "float", step: 0.5, min: 1, max: 10 };

    const low = stepNumber(1, -1, spec);
    const high = fitNumber(12.5, spec);

    expect(low).toBe(1);
    expect(high).toBe(10);
  });

  it("parses typed text, a comma decimal, an empty field and junk", () => {
    const spec = { type: "float" };

    const typed = parseNumber(" 7,25 ", spec);
    const emptied = parseNumber("  ", spec);
    const junk = parseNumber("seven", spec);
    const whole = parseNumber("3.6", { type: "integer" });

    expect(typed).toBe(7.25);
    expect(emptied).toBeNull();
    expect(junk).toBeUndefined();
    expect(whole).toBe(4);
  });
});
