import notifier from 'node-notifier';
import { logger } from './logger.js';
import { config } from './config.js';

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
            icon: options.icon,
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
