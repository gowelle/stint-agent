import { describe, it, expect } from 'vitest';
import { formatApiError, isServiceUnavailable } from './api-errors.js';

describe('API Errors Utility', () => {
    describe('formatApiError', () => {
        it('should format 503 Service Unavailable errors', () => {
            const error = new Error('API request failed: 503 { "message": "Service Unavailable" }');
            const result = formatApiError(error);

            expect(result.message).toBe('Service temporarily unavailable');
            expect(result.details).toContain('The Stint server is currently down for maintenance or experiencing issues.');
            expect(result.details).toContain('Please try again in a few minutes.');
        });

        it('should format network connection errors', () => {
            const error = new Error('fetch failed: ECONNREFUSED');
            const result = formatApiError(error);

            expect(result.message).toBe('Unable to reach the server');
            expect(result.details).toContain('Check your internet connection.');
        });

        it('should format 401 unauthorized errors', () => {
            const error = new Error('API request failed: 401 Unauthorized');
            const result = formatApiError(error);

            expect(result.message).toBe('Authentication expired or invalid');
            expect(result.details).toContain('Run "stint login" to re-authenticate.');
        });

        it('should format 403 forbidden errors', () => {
            const error = new Error('API request failed: 403 Forbidden');
            const result = formatApiError(error);

            expect(result.message).toBe('Access denied');
        });

        it('should format 404 not found errors', () => {
            const error = new Error('API request failed: 404 Not Found');
            const result = formatApiError(error);

            expect(result.message).toBe('Resource not found');
        });

        it('should format 429 rate limit errors', () => {
            const error = new Error('API request failed: 429 Too Many Requests');
            const result = formatApiError(error);

            expect(result.message).toBe('Too many requests');
        });

        it('should format 500 internal server errors', () => {
            const error = new Error('API request failed: 500 Internal Server Error');
            const result = formatApiError(error);

            expect(result.message).toBe('Server error occurred');
        });

        it('should format circuit breaker errors', () => {
            const error = new Error('Circuit breaker is open');
            const result = formatApiError(error);

            expect(result.message).toBe('Service temporarily unavailable');
            expect(result.details).toContain('Multiple requests have failed recently.');
        });

        it('should format no auth token errors', () => {
            const error = new Error('No authentication token found. Please run "stint login" first.');
            const result = formatApiError(error);

            expect(result.message).toBe('Not logged in');
            expect(result.details).toContain('Run "stint login" to authenticate.');
        });

        it('should handle unknown errors with generic message', () => {
            const error = new Error('Something completely unexpected happened');
            const result = formatApiError(error);

            expect(result.message).toBe('Connection error');
            expect(result.details).toContain('An unexpected error occurred. Please try again.');
        });

        it('should extract HTTP status for unknown status codes', () => {
            const error = new Error('API request failed: 418 I\'m a teapot');
            const result = formatApiError(error);

            expect(result.message).toBe('Request failed (HTTP 418)');
        });
    });

    describe('isServiceUnavailable', () => {
        it('should return true for 503 errors', () => {
            const error = new Error('API request failed: 503');
            expect(isServiceUnavailable(error)).toBe(true);
        });

        it('should return true for Service Unavailable message', () => {
            const error = new Error('Service Unavailable');
            expect(isServiceUnavailable(error)).toBe(true);
        });

        it('should return true for connection refused errors', () => {
            const error = new Error('fetch failed: ECONNREFUSED');
            expect(isServiceUnavailable(error)).toBe(true);
        });

        it('should return true for DNS errors', () => {
            const error = new Error('getaddrinfo ENOTFOUND api.stint.codes');
            expect(isServiceUnavailable(error)).toBe(true);
        });

        it('should return true for circuit breaker errors', () => {
            const error = new Error('Circuit breaker is open');
            expect(isServiceUnavailable(error)).toBe(true);
        });

        it('should return false for auth errors', () => {
            const error = new Error('API request failed: 401 Unauthorized');
            expect(isServiceUnavailable(error)).toBe(false);
        });

        it('should return false for generic errors', () => {
            const error = new Error('Something went wrong');
            expect(isServiceUnavailable(error)).toBe(false);
        });
    });
});
