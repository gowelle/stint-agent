import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const CONFIG_PATH = path.join(APPDATA, 'stint-nodejs', 'Config', 'config.json');

console.log(`Reading config from: ${CONFIG_PATH}`);
const configRaw = fs.readFileSync(CONFIG_PATH, 'utf8');
const config = JSON.parse(configRaw);

// Mock socket ID
const SOCKET_ID = '146962653.544300471';
// Using the user ID from the config to construct the channel name
// Assuming user object is stored or we need to extract from token?
// Actually, earlier logs showed channel: private-user.01kcdd2j9fx3v6d1mk53vpkq8c
// Let's assume the user ID is somehow available or hardcode the one from logs for now.
// Better: Decode the token to get the sub (user ID) if possible, but let's just use the one from the logs.
const USER_ID = '01kcdd2j9fx3v6d1mk53vpkq8c';
const CHANNEL_NAME = `private-user.${USER_ID}`;

const token = config.token;

console.log('Testing authentication...');
console.log(`Endpoint: https://stint.codes/broadcasting/auth`);
console.log(`Token: ${token ? 'Present' : 'Missing'}`);
console.log(`Channel: ${CHANNEL_NAME}`);

const postData = JSON.stringify({
    socket_id: SOCKET_ID,
    channel_name: CHANNEL_NAME
});

const endpoints = [
    '/broadcasting/auth',
    '/api/broadcasting/auth',
    '/api/agent/broadcasting/auth',
    '/api/user/broadcasting/auth',
    '/stint/broadcasting/auth'
];

async function probe(endpoint) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'stint.codes',
            port: 443,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'stint-agent/1.0.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                console.log(`[${endpoint}] Status: ${res.statusCode}`);
                console.log(`[${endpoint}] Body: ${data.substring(0, 100)}...`);
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`[${endpoint}] Error: ${e.message}`);
            resolve();
        });

        req.write(postData);
        req.end();
    });
}

(async () => {
    for (const endpoint of endpoints) {
        await probe(endpoint);
    }
})();
