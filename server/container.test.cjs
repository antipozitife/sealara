const { createTestContainer } = require("./container.cjs");

describe("DI container test overrides", () => {
  it("allows overriding sqlPool for repository tests", async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue([
        [
          {
            id: 42,
            surname: "Ivanov",
            name: "Ivan",
            patronymic: "",
            birth_date: "1990-01-01",
            gender: "м",
            phone: "+79990000000",
            email: "test@example.com",
            region: "Moscow",
            is_doctor: 0,
            created_at: new Date("2024-01-01T00:00:00.000Z"),
          },
        ],
      ]),
    };

    const container = createTestContainer({
      values: {
        sqlPool: mockPool,
        refreshTokenTtlDays: 30,
        refreshTokenLimit: 5,
        refreshFingerprintPepper: "test-pepper",
      },
    });

    const authRepository = container.resolve("authRepository");
    const user = await authRepository.getUserById(42);

    expect(mockPool.query).toHaveBeenCalled();
    expect(user).toBeTruthy();
    expect(user.id).toBe("42");
    expect(user.email).toBe("test@example.com");
  });
});
