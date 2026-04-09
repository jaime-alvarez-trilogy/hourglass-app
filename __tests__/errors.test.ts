// FR2: Error Types
import { AuthError, NetworkError, ApiError } from '../src/api/errors';

describe('FR2: Error Types', () => {
  describe('AuthError', () => {
    it('is instanceof Error and instanceof AuthError', () => {
      const err = new AuthError(401);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AuthError);
    });

    it('statusCode is 401 when constructed with 401', () => {
      const err = new AuthError(401);
      expect(err.statusCode).toBe(401);
    });

    it('statusCode is 403 when constructed with 403', () => {
      const err = new AuthError(403);
      expect(err.statusCode).toBe(403);
    });

    it('has a message property', () => {
      const err = new AuthError(401);
      expect(typeof err.message).toBe('string');
    });
  });

  describe('NetworkError', () => {
    it('is instanceof Error and instanceof NetworkError', () => {
      const err = new NetworkError('timeout');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(NetworkError);
    });

    it('carries the provided message', () => {
      const err = new NetworkError('connection refused');
      expect(err.message).toBe('connection refused');
    });
  });

  describe('ApiError', () => {
    it('is instanceof Error and instanceof ApiError', () => {
      const err = new ApiError(500);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ApiError);
    });

    it('statusCode equals the value passed in', () => {
      const err = new ApiError(500);
      expect(err.statusCode).toBe(500);
    });

    it('ApiError is not assignable to AuthError (distinct types)', () => {
      const err = new ApiError(500);
      // AuthError and ApiError are distinct — ApiError is not instanceof AuthError
      expect(err).not.toBeInstanceOf(AuthError);
    });
  });
});
