import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const CONFIG_PATH = path.join(APPDATA, 'stint-nodejs', 'Config', 'config.json');

console.log(`Reading config from: ${CONFIG_PATH}`);
const configRaw = fs.readFileSync(CONFIG_PATH, 'utf8');
const config = JSON.parse(configRaw);

// Latest socket ID from logs
const SOCKET_ID = '452476800.131148187';

// User ID from config (using one from recent logs/memory)
const USER_ID = '01kcdd2j9fx3v6d1mk53vpkq8c';

// TEST: Remove 'private-' prefix
const CHANNEL_NAME = `user.${USER_ID}`;

const token = config.token;

console.log('Testing authentication...');
console.log(`Endpoint: https://stint.codes/api/broadcasting/auth`);
console.log(`Token provided: ${!!token}`);
console.log(`Channel: ${CHANNEL_NAME}`);

const postData = JSON.stringify({
    socket_id: SOCKET_ID,
    channel_name: CHANNEL_NAME
});

const options = {
    hostname: 'stint.codes',
    port: 443,
    path: '/api/broadcasting/auth',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'stint-agent/1.0.0'
    }
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('BODY:');
        console.log(data);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
