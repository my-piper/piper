import { CurvePipe } from "src/pipes/curve";

describe("CurvePipe", () => {
  it("reaches half the horizontal distance out from each end", () => {
    const pipe = new CurvePipe();

    const path = pipe.transform({ x: 0, y: 10 }, { x: 200, y: 90 });

    expect(path).toBe("M 0,10 C 100,10 100,90 200,90");
  });

  it("keeps 40px handles for short and backward wires", () => {
    const pipe = new CurvePipe();

    const short = pipe.transform({ x: 0, y: 0 }, { x: 20, y: 30 });
    const backward = pipe.transform({ x: 100, y: 0 }, { x: 60, y: 50 });

    expect(short).toBe("M 0,0 C 40,0 -20,30 20,30");
    expect(backward).toBe("M 100,0 C 140,0 20,50 60,50");
  });
});
