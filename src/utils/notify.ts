import notifier from 'node-notifier';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Assuming dist/ is where this code runs, and assets/ is sibling
const DEFAULT_ICON = path.resolve(__dirname, '../assets/logo.png');

export interface NotificationOptions {
    title: string;
    message: string;
    open?: string;
    icon?: string;
}

export function notify(options: NotificationOptions): void {
    // Check if notifications are enabled
    if (!config.areNotificationsEnabled()) {
        logger.debug('notify', 'Notifications disabled, skipping notification');
        return;
    }

    try {
        notifier.notify({
            title: options.title,
            message: options.message,
            open: options.open,
            icon: options.icon || DEFAULT_ICON,
            sound: true,
            wait: false,
            appID: 'Stint Agent',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any, (error) => {
            if (error) {
                logger.error('notify', 'Failed to send notification', error as Error);
            }
        });
    } catch (error) {
        logger.error('notify', 'Failed to send notification', error as Error);
    }
}
