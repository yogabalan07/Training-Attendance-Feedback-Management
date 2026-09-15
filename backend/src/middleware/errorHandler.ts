import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../lib/errors';

interface ErrorResponse {
  success: boolean;
  error: {
    message: string;
    statusCode: number;
    errors?: Record<string, string[]>;
    stack?: string;
  };
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ValidationError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
        errors: err.errors,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
      },
    };

    if (process.env.NODE_ENV !== 'production') {
      response.error.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  console.error('Unhandled error:', err);

  const statusCode = 500;
  const response: ErrorResponse = {
    success: false,
    error: {
      message: 'Internal server error',
      statusCode,
    },
  };

  if (process.env.NODE_ENV !== 'production') {
    response.error.message = err.message;
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
