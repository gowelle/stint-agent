import notifier from 'node-notifier';
import { logger } from './logger.js';

export interface NotificationOptions {
    title: string;
    message: string;
    open?: string;
}

export function notify(options: NotificationOptions): void {
    try {
        notifier.notify({
            title: options.title,
            message: options.message,
            open: options.open,
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
