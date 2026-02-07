import dotenv from "dotenv";
dotenv.config();

// Set test environment variables
process.env.JWT_SECRET = "test-jwt-secret-12345";
process.env.NODE_ENV = "test";

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Close any open handles after all tests
afterAll(async () => {
  // Close any open connections
});
