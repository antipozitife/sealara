const { detectImageFormat } = require("./image-format.cjs");

describe("detectImageFormat", () => {
  it("detects png signature", () => {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]);
    const r = detectImageFormat(sig);
    expect(r).toEqual({ kind: "png", ext: ".png" });
  });

  it("detects jpeg", () => {
    const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(detectImageFormat(b).ext).toBe(".jpg");
  });

  it("returns null for random bytes", () => {
    expect(detectImageFormat(Buffer.from([1, 2, 3, 4, 5]))).toBeNull();
  });
});
