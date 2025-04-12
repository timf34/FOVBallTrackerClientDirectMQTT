// server.js
const express = require('express');
const path = require('path');
const awsIot = require('aws-iot-device-sdk');

const app = express();
app.use(express.json());

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// API route
app.post('/api/mqtt-publish', async (req, res) => {
  try {
    const AWS_IOT_ENDPOINT = process.env.AWS_IOT_ENDPOINT;
    const AWS_IOT_KEY  = Buffer.from(process.env.AWS_IOT_KEY_BASE64,  'base64');
    const AWS_IOT_CERT = Buffer.from(process.env.AWS_IOT_CERT_BASE64, 'base64');
    const AWS_IOT_CA   = Buffer.from(process.env.AWS_IOT_CA_BASE64,   'base64');

    const { topic, message } = req.body;
    if (!topic || !message) return res.status(400).json({ error: 'Missing topic/message' });

    const device = awsIot.device({
      privateKey: AWS_IOT_KEY,
      clientCert: AWS_IOT_CERT,
      caCert: AWS_IOT_CA,
      clientId: `server-${Date.now()}`,
      host: AWS_IOT_ENDPOINT,
      region: 'eu-west-1'
    });

    await new Promise((resolve, reject) => {
      device.on('connect', resolve);
      device.on('error', reject);
      setTimeout(() => reject(new Error('Timeout connecting to AWS IoT')), 5000);
    });

    await new Promise((resolve, reject) => {
      device.publish(topic, JSON.stringify(message), { qos: 1 }, err => {
        if (err) return reject(err);
        resolve();
      });
    });

    device.end(false);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});
