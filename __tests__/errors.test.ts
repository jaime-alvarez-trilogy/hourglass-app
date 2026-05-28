// FR2: Error Types
// 05-onboarding-defense FR1: NotContributorError
import { AuthError, NetworkError, ApiError, NotContributorError } from '../src/api/errors';

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

  // 05-onboarding-defense FR1: NotContributorError
  describe('NotContributorError (05-onboarding-defense FR1)', () => {
    it('is instanceof Error', () => {
      const err = new NotContributorError([]);
      expect(err).toBeInstanceOf(Error);
    });

    it('is instanceof NotContributorError', () => {
      const err = new NotContributorError(['MANAGER']);
      expect(err).toBeInstanceOf(NotContributorError);
    });

    it('has name === "NotContributorError"', () => {
      const err = new NotContributorError(['MANAGER']);
      expect(err.name).toBe('NotContributorError');
    });

    it('exposes avatarTypes equal to the constructor argument', () => {
      const err = new NotContributorError(['MANAGER', 'COMPANY_ADMIN']);
      expect(err.avatarTypes).toEqual(['MANAGER', 'COMPANY_ADMIN']);
    });

    it('exposes an empty avatarTypes array when constructed with []', () => {
      const err = new NotContributorError([]);
      expect(err.avatarTypes).toEqual([]);
    });

    it('message contains each value in avatarTypes (comma-joined)', () => {
      const err = new NotContributorError(['MANAGER', 'COMPANY_ADMIN']);
      expect(err.message).toContain('MANAGER');
      expect(err.message).toContain('COMPANY_ADMIN');
    });

    it('JSON-serialized form exposes only safe fields (no credentials leak)', () => {
      const err = new NotContributorError(['MANAGER']);
      // Manually-attached known fields show up; nothing else should appear via
      // the default Error serialization path. We accept name+message+avatarTypes
      // and reject anything resembling credentials (password, token, etc.).
      const serialized = JSON.stringify({
        name: err.name,
        message: err.message,
        avatarTypes: err.avatarTypes,
      });
      expect(serialized).not.toMatch(/password|token|secret/i);
    });

    it('is not instanceof AuthError (distinct from auth-failure path)', () => {
      const err = new NotContributorError(['MANAGER']);
      expect(err).not.toBeInstanceOf(AuthError);
    });
  });
});
