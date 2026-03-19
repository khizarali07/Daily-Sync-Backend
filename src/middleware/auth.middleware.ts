import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

export interface AuthRequest extends Request {
  userId?: string;
}

const isTransientPrismaConnectionError = (error: any): boolean => {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("error in postgresql connection") ||
    msg.includes("kind: closed") ||
    msg.includes("can't reach database server") ||
    msg.includes("connection")
  );
};

const findUserWithRetry = async (userId: string) => {
  let lastError: any;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });
    } catch (error) {
      lastError = error;
      if (!isTransientPrismaConnectionError(error) || attempt === 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw lastError;
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    // Verify user exists in database
    const user = await findUserWithRetry(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found. Please login again.' });
    }

    req.userId = decoded.userId;
    next();
  } catch (error: any) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (isTransientPrismaConnectionError(error)) {
      return res.status(503).json({ error: 'Database temporarily unavailable. Please try again.' });
    }

    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
