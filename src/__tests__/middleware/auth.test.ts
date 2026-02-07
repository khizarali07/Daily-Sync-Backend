import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { authenticate, AuthRequest } from "../../middleware/auth.middleware";

describe("Auth Middleware", () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret-12345";
    
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should pass with valid token and set userId", () => {
    const token = jwt.sign({ userId: "test-user-123" }, process.env.JWT_SECRET!);
    mockRequest.headers = { authorization: `Bearer ${token}` };

    authenticate(
      mockRequest as AuthRequest,
      mockResponse as Response,
      mockNext
    );

    expect(mockNext).toHaveBeenCalled();
    expect(mockRequest.userId).toBe("test-user-123");
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it("should return 401 when no token provided", () => {
    mockRequest.headers = {};

    authenticate(
      mockRequest as AuthRequest,
      mockResponse as Response,
      mockNext
    );

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({ 
      error: "Authentication required" 
    });
  });

  it("should return 401 for invalid token", () => {
    mockRequest.headers = { authorization: "Bearer invalid-token" };

    authenticate(
      mockRequest as AuthRequest,
      mockResponse as Response,
      mockNext
    );

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({ 
      error: "Invalid or expired token" 
    });
  });

  it("should return 401 for expired token", () => {
    // Create an expired token
    const token = jwt.sign(
      { userId: "test-user-123" },
      process.env.JWT_SECRET!,
      { expiresIn: "-1s" } // Already expired
    );
    mockRequest.headers = { authorization: `Bearer ${token}` };

    authenticate(
      mockRequest as AuthRequest,
      mockResponse as Response,
      mockNext
    );

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(401);
  });

  it("should return 401 for token with wrong secret", () => {
    const token = jwt.sign(
      { userId: "test-user-123" },
      "wrong-secret"
    );
    mockRequest.headers = { authorization: `Bearer ${token}` };

    authenticate(
      mockRequest as AuthRequest,
      mockResponse as Response,
      mockNext
    );

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(401);
  });

  it("should handle token without Bearer prefix", () => {
    const token = jwt.sign({ userId: "test-user-123" }, process.env.JWT_SECRET!);
    mockRequest.headers = { authorization: token }; // No "Bearer " prefix

    authenticate(
      mockRequest as AuthRequest,
      mockResponse as Response,
      mockNext
    );

    // Should still work since it just replaces "Bearer " with empty string
    expect(mockNext).toHaveBeenCalled();
    expect(mockRequest.userId).toBe("test-user-123");
  });
});
