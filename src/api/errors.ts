// FR2: Typed error classes for Crossover API failures
// Spec 03 (error-envelope): optional envelope parameter carries CROS-XXXX
// errorCode, type, and human-readable text from the server.

export type ErrorEnvelope = {
  errorCode?: string;
  type?: string;
  text?: string;
};

export class AuthError extends Error {
  statusCode: 401 | 403;
  errorCode?: string;
  serverText?: string;

  constructor(statusCode: 401 | 403, message?: string, envelope?: ErrorEnvelope) {
    super(message ?? `Authentication failed (${statusCode})`);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.errorCode = envelope?.errorCode;
    this.serverText = envelope?.text;
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
  errorCode?: string;
  errorType?: string;
  serverText?: string;

  constructor(statusCode: number, message?: string, envelope?: ErrorEnvelope) {
    super(message ?? `API error (${statusCode})`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = envelope?.errorCode;
    this.errorType = envelope?.type;
    this.serverText = envelope?.text;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
