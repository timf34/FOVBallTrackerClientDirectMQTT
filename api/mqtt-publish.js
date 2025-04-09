// api/mqtt-publish.js
const awsIot = require('aws-iot-device-sdk');

module.exports = async (req, res) => {
  // CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get environment variables
    const AWS_IOT_ENDPOINT = process.env.AWS_IOT_ENDPOINT;

    // Decode base64 certificates
    const AWS_IOT_KEY  = Buffer.from(process.env.AWS_IOT_KEY_BASE64,  'base64');
    const AWS_IOT_CERT = Buffer.from(process.env.AWS_IOT_CERT_BASE64, 'base64');
    const AWS_IOT_CA   = Buffer.from(process.env.AWS_IOT_CA_BASE64,   'base64');
    
    // Validate request body
    const { topic, message } = req.body;
    if (!topic || !message) {
      return res.status(400).json({ error: 'Topic and message are required' });
    }

    // api/mqtt-publish.js
    const device = awsIot.device({
        privateKey: AWS_IOT_KEY,
        clientCert: AWS_IOT_CERT,
        caCert: AWS_IOT_CA,
        clientId: `server-${Date.now()}`,
        host: AWS_IOT_ENDPOINT,
        region: 'eu-west-1'
    });
  

    // Wait for device to connect
    await new Promise((resolve, reject) => {
      device.on('connect', () => {
        console.log('Connected to AWS IoT Core');
        resolve();
      });
      
      device.on('error', (err) => {
        console.error('Connection error:', err);
        reject(err);
      });
      
      // Add timeout to avoid hanging
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Publish message
    await new Promise((resolve, reject) => {
      console.log(`Publishing to topic ${topic}:`, message);
      
      device.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
        if (err) {
          console.error('Publish error:', err);
          reject(err);
        } else {
          console.log('Message published successfully');
          resolve();
        }
      });
    });

    // Disconnect after sending
    device.end(false);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('MQTT error:', error);
    return res.status(500).json({ error: error.message });
  }
};