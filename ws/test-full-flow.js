const WebSocket = require('ws');
const { createClient } = require('redis');

console.log('🔍 Testing Full WebSocket Flow...\n');

// Test 1: Connect to WebSocket
console.log('1️⃣ Testing WebSocket Connection...');
const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
    console.log('✅ WebSocket connected');
    
    // Test 2: Subscribe to channels
    console.log('\n2️⃣ Testing Subscriptions...');
    
    const subscribeMsg = {
        method: "SUBSCRIBE",
        params: ["depth.SOL_USDC", "ticker.SOL_USDC", "trade.SOL_USDC"]
    };
    
    console.log('📤 Sending subscription:', JSON.stringify(subscribeMsg, null, 2));
    ws.send(JSON.stringify(subscribeMsg));
});

ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('\n📨 Received WebSocket message:');
    console.log(JSON.stringify(message, null, 2));
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
});

ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed: ${code} ${reason}`);
});

// Test 3: Check Redis channels directly
console.log('\n3️⃣ Testing Redis Channels...');
const redisClient = createClient();

redisClient.connect().then(() => {
    console.log('✅ Redis connected');
    
    // Subscribe to all channels
    const channels = ['depth.SOL_USDC', 'ticker.SOL_USDC', 'trade.SOL_USDC'];
    
    channels.forEach(channel => {
        redisClient.subscribe(channel, (message) => {
            console.log(`\n📨 Redis message on ${channel}:`);
            console.log(JSON.stringify(JSON.parse(message), null, 2));
        });
        console.log(`📡 Subscribed to Redis channel: ${channel}`);
    });
    
}).catch(err => {
    console.error('❌ Redis connection failed:', err);
});

// Test 4: Publish test message to Redis
setTimeout(() => {
    console.log('\n4️⃣ Publishing test message to Redis...');
    
    const testMessage = {
        stream: "depth.SOL_USDC",
        data: {
            a: [["1005.5", "1.7"]],
            b: [["994.2", "4.0"]],
            e: "depth"
        }
    };
    
    redisClient.publish('depth.SOL_USDC', JSON.stringify(testMessage));
    console.log('📤 Published test message to depth.SOL_USDC');
    
}, 2000);

// Keep alive for 10 seconds
setTimeout(() => {
    console.log('\n⏰ Test complete, closing connections');
    ws.close();
    redisClient.disconnect();
    process.exit(0);
}, 10000);
