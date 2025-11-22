import { User } from '../types/index.js';
import { config } from '../utils/config.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

class AuthServiceImpl {
    async saveToken(token: string): Promise<void> {
        try {
            const encryptedToken = encrypt(token);
            config.setToken(encryptedToken);
            logger.info('auth', 'Token saved successfully');
        } catch (error) {
            logger.error('auth', 'Failed to save token', error as Error);
            throw error;
        }
    }

    async getToken(): Promise<string | null> {
        try {
            const encryptedToken = config.getToken();
            if (!encryptedToken) {
                return null;
            }
            return decrypt(encryptedToken);
        } catch (error) {
            logger.error('auth', 'Failed to decrypt token', error as Error);
            return null;
        }
    }

    async clearToken(): Promise<void> {
        config.clearToken();
        logger.info('auth', 'Token cleared');
    }

    async validateToken(): Promise<User | null> {
        const token = await this.getToken();
        if (!token) {
            return null;
        }

        try {
            // This will be implemented when we have the API service
            // For now, we'll import it dynamically to avoid circular dependencies
            const { apiService } = await import('./api.js');
            const response = await fetch(`${config.getApiUrl()}/api/user`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                logger.warn('auth', 'Token validation failed');
                return null;
            }

            const user = await response.json() as User;
            logger.info('auth', `Token validated for user: ${user.email}`);
            return user;
        } catch (error) {
            logger.error('auth', 'Failed to validate token', error as Error);
            return null;
        }
    }

    getMachineId(): string {
        return config.getMachineId();
    }

    getMachineName(): string {
        return config.getMachineName();
    }
}

export const authService = new AuthServiceImpl();
