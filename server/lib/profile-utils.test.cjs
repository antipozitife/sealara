const { parseBirthDate } = require("./profile-utils.cjs");

describe("parseBirthDate", () => {
  it("accepts valid date", () => {
    expect(parseBirthDate("1990-05-20")).toBe("1990-05-20");
  });

  it("rejects future date", () => {
    expect(parseBirthDate("2099-01-01")).toBeNull();
  });

  it("rejects year before 1900", () => {
    expect(parseBirthDate("1800-01-01")).toBeNull();
  });

  it("rejects age over 120 years", () => {
    const oldDate = `${new Date().getFullYear() - 121}-01-01`;
    expect(parseBirthDate(oldDate)).toBeNull();
  });

  it("rejects invalid month/day combos", () => {
    expect(parseBirthDate("2000-13-01")).toBeNull();
    expect(parseBirthDate("2000-02-30")).toBeNull();
  });
});
