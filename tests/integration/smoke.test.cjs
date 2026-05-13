const request = require("supertest");
const { app } = require("../../server/index.cjs");

describe("API smoke (no DB)", () => {
  it("rejects POST /api/* without CSRF triple", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", process.env.FRONTEND_ORIGIN || "http://localhost:5173")
      .send({ email: "x@y.z", password: "password12" });
    expect(res.status).toBe(403);
    expect(res.body?.error).toMatch(/CSRF/i);
  });

  it("returns health payload", async () => {
    const res = await request(app).get("/api/health");
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("ok");
  });
});
