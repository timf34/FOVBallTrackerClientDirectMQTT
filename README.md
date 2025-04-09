# Ball Tracker Web Client Direct MQTT 

For seeting this up, you need a .env file with the AWS certs info. Note that they're BASE64 encoding so as to fit into the .env files. This .env file should be placed in the root directory for local development, or when deploying to Vercel, you should copy paste the .env file into the Environment Variables on the vercel project.

**For running locally:**
```
npm install 
npx vercel dev
```

**For running on Vercel:**

It should run immediately once you've connected it to the github, just be sure to fill in the Environment Variables. 