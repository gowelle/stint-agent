import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.js';

describe('Crypto Utils', () => {
    describe('encrypt and decrypt', () => {
        it('should encrypt and decrypt a basic string', () => {
            const original = 'hello-world-token';
            const encrypted = encrypt(original);
            const decrypted = decrypt(encrypted);

            expect(decrypted).toBe(original);
            expect(encrypted).not.toBe(original);
        });

        it('should encrypt and decrypt an empty string', () => {
            const original = '';
            const encrypted = encrypt(original);
            const decrypted = decrypt(encrypted);

            expect(decrypted).toBe(original);
        });

        it('should encrypt and decrypt a long string', () => {
            const original = 'a'.repeat(10000);
            const encrypted = encrypt(original);
            const decrypted = decrypt(encrypted);

            expect(decrypted).toBe(original);
        });

        it('should encrypt and decrypt special characters', () => {
            const original = '!@#$%^&*()_+-=[]{}|;:,.<>?`~"\'\\n\\t';
            const encrypted = encrypt(original);
            const decrypted = decrypt(encrypted);

            expect(decrypted).toBe(original);
        });

        it('should encrypt and decrypt unicode characters', () => {
            const original = '你好世界 🌍 émojis 日本語';
            const encrypted = encrypt(original);
            const decrypted = decrypt(encrypted);

            expect(decrypted).toBe(original);
        });

        it('should produce different encrypted values for same input (due to random IV)', () => {
            const original = 'test-token';
            const encrypted1 = encrypt(original);
            const encrypted2 = encrypt(original);

            expect(encrypted1).not.toBe(encrypted2);
            expect(decrypt(encrypted1)).toBe(original);
            expect(decrypt(encrypted2)).toBe(original);
        });

        it('should throw error when decrypting invalid data', () => {
            expect(() => decrypt('invalid-encrypted-data')).toThrow();
        });

        it('should throw error when decrypting tampered data', () => {
            const original = 'secret-token';
            const encrypted = encrypt(original);

            // Tamper with the encrypted data
            const tampered = encrypted.slice(0, -2) + 'XX';

            expect(() => decrypt(tampered)).toThrow();
        });

        it('should throw error when decrypting truncated data', () => {
            const original = 'secret-token';
            const encrypted = encrypt(original);

            // Truncate the encrypted data
            const truncated = encrypted.slice(0, 32);

            expect(() => decrypt(truncated)).toThrow();
        });
    });
});
