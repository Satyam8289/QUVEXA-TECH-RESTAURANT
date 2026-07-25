/* PM2 process config — keeps the Node server running 24x7 on the VPS,
   restarts it automatically if it crashes, and restarts it on server reboot
   (once you also run `pm2 startup` + `pm2 save`, see deploy/VPS_SETUP.md). */
module.exports = {
  apps: [
    {
      name: "foodhouse-api",
      script: "src/server.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
    },
  ],
};
