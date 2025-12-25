import notifier from 'node-notifier';

console.log('Testing notification...');

notifier.notify({
    title: 'Test Notification',
    message: 'If you see this, notifications are working!',
    sound: true,
    wait: false,
    appID: 'Stint Agent',
}, (error) => {
    if (error) {
        console.error('Notification failed:', error);
    } else {
        console.log('Notification sent successfully!');
    }
});

console.log('Notification triggered. Check your system notifications.');
