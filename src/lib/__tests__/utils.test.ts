/**
 * ユーティリティ関数のテスト
 */

import {
  cn,
  delay,
  safeJsonParse,
  isDefined,
  debounce,
  throttle,
  formatFileSize,
  formatTimeAgo,
  getSearchParam,
  chunk,
  omitNullish,
} from '../utils';

describe('Utility Functions', () => {
  describe('cn (className utility)', () => {
    it('should merge class names correctly', () => {
      expect(cn('base', 'additional')).toBe('base additional');
      expect(cn('p-4', 'p-2')).toBe('p-2'); // tailwind-merge should handle conflicts
    });

    it('should handle conditional classes', () => {
      expect(cn('base', false && 'conditional')).toBe('base');
      expect(cn('base', true && 'conditional')).toBe('base conditional');
    });
  });

  describe('delay', () => {
    it('should resolve after specified time', async () => {
      jest.useFakeTimers();
      const promise = delay(100);
      jest.advanceTimersByTime(100);
      await promise;
      expect(true).toBe(true); // If we reach here, delay worked
      jest.useRealTimers();
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const result = safeJsonParse('{"key": "value"}', {});
      expect(result).toEqual({ key: 'value' });
    });

    it('should return default value for invalid JSON', () => {
      const defaultValue = { default: true };
      const result = safeJsonParse('invalid json', defaultValue);
      expect(result).toBe(defaultValue);
    });

    it('should handle null and undefined', () => {
      expect(safeJsonParse('null', 'default')).toBe(null);
      expect(safeJsonParse('undefined', 'default')).toBe('default');
    });
  });

  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined([])).toBe(true);
      expect(isDefined({})).toBe(true);
    });

    it('should return false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('arg1');
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledWith('arg1');
    });

    it('should cancel previous calls', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('first');
      debouncedFn('second');

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('second');
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should limit function calls', () => {
      const mockFn = jest.fn();
      const throttledFn = throttle(mockFn, 100);

      throttledFn('arg1');
      throttledFn('arg2');
      throttledFn('arg3');

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('arg1');

      jest.advanceTimersByTime(100);
      throttledFn('arg4');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenCalledWith('arg4');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });
  });

  describe('formatTimeAgo', () => {
    const now = new Date('2024-01-01T12:00:00Z');

    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should format recent times', () => {
      const seconds30Ago = new Date('2024-01-01T11:59:30Z');
      expect(formatTimeAgo(seconds30Ago)).toBe('数秒前');

      const minutes30Ago = new Date('2024-01-01T11:30:00Z');
      expect(formatTimeAgo(minutes30Ago)).toBe('30分前');

      const hours2Ago = new Date('2024-01-01T10:00:00Z');
      expect(formatTimeAgo(hours2Ago)).toBe('2時間前');

      const days2Ago = new Date('2023-12-30T12:00:00Z');
      expect(formatTimeAgo(days2Ago)).toBe('2日前');
    });

    it('should format old dates', () => {
      const weekAgo = new Date('2023-12-24T12:00:00Z');
      expect(formatTimeAgo(weekAgo)).toBe('2023/12/24');
    });
  });

  describe('getSearchParam', () => {
    it('should get parameter values', () => {
      const params = new URLSearchParams('?key=value&other=test');
      expect(getSearchParam(params, 'key')).toBe('value');
      expect(getSearchParam(params, 'other')).toBe('test');
      expect(getSearchParam(params, 'missing')).toBe('');
      expect(getSearchParam(params, 'missing', 'default')).toBe('default');
    });
  });

  describe('chunk', () => {
    it('should split array into chunks', () => {
      const array = [1, 2, 3, 4, 5, 6, 7];
      const chunks = chunk(array, 3);
      expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });

    it('should handle empty arrays', () => {
      expect(chunk([], 3)).toEqual([]);
    });

    it('should handle size larger than array', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });
  });

  describe('omitNullish', () => {
    it('should remove null and undefined values', () => {
      const input = {
        defined: 'value',
        null: null,
        undefined: undefined,
        zero: 0,
        empty: '',
        false: false,
      };

      const result = omitNullish(input);
      expect(result).toEqual({
        defined: 'value',
        zero: 0,
        empty: '',
        false: false,
      });
    });

    it('should handle empty objects', () => {
      expect(omitNullish({})).toEqual({});
    });
  });
});
