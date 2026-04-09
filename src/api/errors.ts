// FR2: Typed error classes for Crossover API failures

export class AuthError extends Error {
  statusCode: 401 | 403;

  constructor(statusCode: 401 | 403, message?: string) {
    super(message ?? `Authentication failed (${statusCode})`);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message?: string) {
    super(message ?? `API error (${statusCode})`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
