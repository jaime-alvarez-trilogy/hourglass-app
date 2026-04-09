// FR10: Environment URLs
import { getApiBase, getAppBase } from '../src/store/config';

describe('FR10: Environment URLs', () => {
  describe('getApiBase', () => {
    it('returns prod URL when useQA is false', () => {
      expect(getApiBase(false)).toBe('https://api.crossover.com');
    });

    it('returns QA URL when useQA is true', () => {
      expect(getApiBase(true)).toBe('https://api-qa.crossover.com');
    });
  });

  describe('getAppBase', () => {
    it('returns prod app URL when useQA is false', () => {
      expect(getAppBase(false)).toBe('https://app.crossover.com');
    });

    it('returns QA app URL when useQA is true', () => {
      expect(getAppBase(true)).toBe('https://app-qa.crossover.com');
    });
  });
});
