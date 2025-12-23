import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;
    let operation: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        breaker = new CircuitBreaker({
            failureThreshold: 3,
            successThreshold: 2,
            timeout: 1000,
            windowSize: 5000,
        });
        operation = vi.fn();
    });

    describe('CLOSED state', () => {
        it('should execute operations normally', async () => {
            operation.mockResolvedValue('success');

            const result = await breaker.execute(operation);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
            expect(breaker.getState()).toBe('CLOSED');
        });

        it('should transition to OPEN after threshold failures', async () => {
            operation.mockRejectedValue(new Error('failure'));

            // First 2 failures
            await expect(breaker.execute(operation)).rejects.toThrow('failure');
            await expect(breaker.execute(operation)).rejects.toThrow('failure');
            expect(breaker.getState()).toBe('CLOSED');

            // 3rd failure should open circuit
            await expect(breaker.execute(operation)).rejects.toThrow('failure');
            expect(breaker.getState()).toBe('OPEN');
            expect(breaker.getFailureCount()).toBe(3);
        });
    });

    describe('OPEN state', () => {
        beforeEach(async () => {
            // Trigger circuit to open
            operation.mockRejectedValue(new Error('failure'));
            await expect(breaker.execute(operation)).rejects.toThrow();
            await expect(breaker.execute(operation)).rejects.toThrow();
            await expect(breaker.execute(operation)).rejects.toThrow();
            expect(breaker.getState()).toBe('OPEN');
            operation.mockClear();
        });

        it('should reject requests immediately without calling operation', async () => {
            await expect(breaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
            expect(operation).not.toHaveBeenCalled();
        });

        it('should use fallback when provided', async () => {
            const fallback = vi.fn().mockReturnValue('fallback-value');

            const result = await breaker.execute(operation, fallback);

            expect(result).toBe('fallback-value');
            expect(operation).not.toHaveBeenCalled();
            expect(fallback).toHaveBeenCalledTimes(1);
        });

        it('should transition to HALF_OPEN after timeout', async () => {
            vi.useFakeTimers();

            // Advance time past timeout
            vi.advanceTimersByTime(1001);

            operation.mockResolvedValue('success');
            await breaker.execute(operation);

            // After one success in HALF_OPEN, should still be HALF_OPEN
            expect(breaker.getState()).toBe('HALF_OPEN');

            // Second success should close it
            await breaker.execute(operation);
            expect(breaker.getState()).toBe('CLOSED');

            vi.useRealTimers();
        });
    });

    describe('HALF_OPEN state', () => {
        beforeEach(async () => {
            vi.useFakeTimers();

            // Open the circuit
            operation.mockRejectedValue(new Error('failure'));
            await expect(breaker.execute(operation)).rejects.toThrow();
            await expect(breaker.execute(operation)).rejects.toThrow();
            await expect(breaker.execute(operation)).rejects.toThrow();

            // Wait for timeout to enter HALF_OPEN
            vi.advanceTimersByTime(1001);
            operation.mockClear();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should close after success threshold', async () => {
            operation.mockResolvedValue('success');

            // First success
            await breaker.execute(operation);
            expect(breaker.getState()).toBe('HALF_OPEN');

            // Second success should close
            await breaker.execute(operation);
            expect(breaker.getState()).toBe('CLOSED');
        });

        it('should reopen on any failure', async () => {
            operation.mockRejectedValue(new Error('failure'));

            await expect(breaker.execute(operation)).rejects.toThrow('failure');
            expect(breaker.getState()).toBe('OPEN');
        });
    });

    describe('Failure window', () => {
        it('should only count failures within window', async () => {
            vi.useFakeTimers();
            operation.mockRejectedValue(new Error('failure'));

            // First failure
            await expect(breaker.execute(operation)).rejects.toThrow();
            expect(breaker.getFailureCount()).toBe(1);

            // Advance past window
            vi.advanceTimersByTime(6000);

            // This failure should be the only one counted
            await expect(breaker.execute(operation)).rejects.toThrow();
            expect(breaker.getFailureCount()).toBe(1);
            expect(breaker.getState()).toBe('CLOSED');

            vi.useRealTimers();
        });
    });

    describe('reset', () => {
        it('should reset circuit to CLOSED state', async () => {
            operation.mockRejectedValue(new Error('failure'));

            // Open the circuit
            await expect(breaker.execute(operation)).rejects.toThrow();
            await expect(breaker.execute(operation)).rejects.toThrow();
            await expect(breaker.execute(operation)).rejects.toThrow();
            expect(breaker.getState()).toBe('OPEN');

            // Reset
            breaker.reset();

            expect(breaker.getState()).toBe('CLOSED');
            expect(breaker.getFailureCount()).toBe(0);

            // Should work normally
            operation.mockResolvedValue('success');
            const result = await breaker.execute(operation);
            expect(result).toBe('success');
        });
    });
});
