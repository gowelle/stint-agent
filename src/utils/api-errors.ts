/**
 * Utility functions for parsing and formatting API errors into user-friendly messages
 */

interface FriendlyError {
    message: string;
    details: string[];
}

/**
 * Parse an API error and return a user-friendly message
 */
export function formatApiError(error: Error): FriendlyError {
    const errorMessage = error.message;

    // Service unavailable (503)
    if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
        return {
            message: 'Service temporarily unavailable',
            details: [
                'The Stint server is currently down for maintenance or experiencing issues.',
                'Please try again in a few minutes.',
            ],
        };
    }

    // Network/connection errors
    if (
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('fetch failed')
    ) {
        return {
            message: 'Unable to reach the server',
            details: [
                'Check your internet connection.',
                'Verify the API server is accessible.',
            ],
        };
    }

    // Unauthorized (401)
    if (errorMessage.includes('401')) {
        return {
            message: 'Authentication expired or invalid',
            details: ['Run "stint login" to re-authenticate.'],
        };
    }

    // Forbidden (403)
    if (errorMessage.includes('403')) {
        return {
            message: 'Access denied',
            details: [
                'You may not have permission for this action.',
                'Try logging in again with "stint login".',
            ],
        };
    }

    // Not found (404)
    if (errorMessage.includes('404')) {
        return {
            message: 'Resource not found',
            details: ['The requested resource does not exist.'],
        };
    }

    // Rate limited (429)
    if (errorMessage.includes('429')) {
        return {
            message: 'Too many requests',
            details: ['Please wait a moment before trying again.'],
        };
    }

    // Internal server error (500)
    if (errorMessage.includes('500')) {
        return {
            message: 'Server error occurred',
            details: [
                'The server encountered an unexpected error.',
                'Please try again later or contact support if the issue persists.',
            ],
        };
    }

    // Circuit breaker open
    if (errorMessage.includes('Circuit breaker is open')) {
        return {
            message: 'Service temporarily unavailable',
            details: [
                'Multiple requests have failed recently.',
                'The system is in protection mode. Please wait a moment before retrying.',
            ],
        };
    }

    // No auth token
    if (errorMessage.includes('No authentication token')) {
        return {
            message: 'Not logged in',
            details: ['Run "stint login" to authenticate.'],
        };
    }

    // Default fallback - try to extract just the HTTP status if present
    const statusMatch = errorMessage.match(/API request failed: (\d{3})/);
    if (statusMatch) {
        return {
            message: `Request failed (HTTP ${statusMatch[1]})`,
            details: ['An unexpected error occurred. Please try again.'],
        };
    }

    // Generic fallback
    return {
        message: 'Connection error',
        details: ['An unexpected error occurred. Please try again.'],
    };
}

/**
 * Check if an error indicates a service is unavailable (vs auth issues)
 */
export function isServiceUnavailable(error: Error): boolean {
    const msg = error.message;
    return (
        msg.includes('503') ||
        msg.includes('Service Unavailable') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('Circuit breaker')
    );
}
