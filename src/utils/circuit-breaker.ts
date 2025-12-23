/**
 * Circuit Breaker pattern implementation to prevent cascading failures
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, reject requests immediately
 * - HALF_OPEN: Testing if service recovered
 */

export interface CircuitBreakerOptions {
    failureThreshold: number;      // Number of failures before opening
    successThreshold: number;       // Number of successes to close from half-open
    timeout: number;                // Time in ms before trying half-open from open
    windowSize?: number;            // Time window for counting failures (ms)
}

export class CircuitBreaker {
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private failures: number = 0;
    private successes: number = 0;
    private lastFailureTime: number = 0;
    private openedAt: number = 0;
    private failureTimestamps: number[] = [];

    constructor(private options: CircuitBreakerOptions) {
        this.options.windowSize = options.windowSize || 60000; // Default 60s window
    }

    /**
     * Execute an operation through the circuit breaker
     */
    async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
        // Check if we should transition from OPEN to HALF_OPEN
        if (this.state === 'OPEN') {
            if (Date.now() - this.openedAt >= this.options.timeout) {
                this.state = 'HALF_OPEN';
                this.successes = 0;
            } else {
                if (fallback) {
                    return fallback();
                }
                throw new Error('Circuit breaker is OPEN - service unavailable');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Handle successful operation
     */
    private onSuccess(): void {
        this.failures = 0;

        if (this.state === 'HALF_OPEN') {
            this.successes++;
            if (this.successes >= this.options.successThreshold) {
                this.state = 'CLOSED';
                this.successes = 0;
                this.failureTimestamps = [];
            }
        }
    }

    /**
     * Handle failed operation
     */
    private onFailure(): void {
        this.lastFailureTime = Date.now();
        this.failureTimestamps.push(this.lastFailureTime);

        // Remove old failures outside the window
        const windowStart = this.lastFailureTime - this.options.windowSize!;
        this.failureTimestamps = this.failureTimestamps.filter(ts => ts > windowStart);

        this.failures = this.failureTimestamps.length;

        if (this.state === 'HALF_OPEN') {
            // Any failure in half-open state reopens the circuit
            this.state = 'OPEN';
            this.openedAt = Date.now();
            this.successes = 0;
        } else if (this.state === 'CLOSED') {
            // Check if we've exceeded the failure threshold
            if (this.failures >= this.options.failureThreshold) {
                this.state = 'OPEN';
                this.openedAt = Date.now();
            }
        }
    }

    /**
     * Get current state
     */
    getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
        return this.state;
    }

    /**
     * Get failure count in current window
     */
    getFailureCount(): number {
        return this.failures;
    }

    /**
     * Reset the circuit breaker to CLOSED state
     */
    reset(): void {
        this.state = 'CLOSED';
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
    }
}
