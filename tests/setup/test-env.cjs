process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "jest-jwt-secret-must-be-at-least-32-chars-long!";
process.env.ML_API_KEY = process.env.ML_API_KEY || "jest-ml-api-key";
process.env.ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:19999";
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
process.env.DB_NAME = process.env.DB_NAME || "Sealara";
