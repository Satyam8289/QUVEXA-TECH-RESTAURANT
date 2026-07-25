# Deploying to a DigitalOcean VPS

Step-by-step, copy-paste friendly. Run the VPS commands over SSH.

## 1. Create the Droplet
- DigitalOcean → Create → Droplet
- Image: **Ubuntu 24.04 LTS**
- Plan: Basic, $6/mo is enough to start (1GB RAM)
- Add your SSH key (or use password auth)
- Create, note the **IP address**

## 2. First login + basic setup
```bash
ssh root@YOUR_DROPLET_IP

apt update && apt upgrade -y
apt install -y nginx git curl

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PM2 (keeps the app running, restarts on crash/reboot)
npm install -g pm2

node -v   # should print v20.x
```

## 3. Clone your repo and install
```bash
cd /var/www
git clone https://github.com/Satyam8289/QUVEXA-TECH-RESTAURANT.git
cd QUVEXA-TECH-RESTAURANT/backend
npm install --omit=dev
```

## 4. Database — pick ONE option

**Option A — Managed Postgres (recommended, has backups):**
Neon.tech or Supabase, free tier. Copy the connection string.

**Option B — Postgres on the same VPS:**
```bash
apt install -y postgresql
sudo -u postgres psql -c "CREATE DATABASE foodhouse;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'a-strong-password-here';"
# Your DATABASE_URL will be:
# postgres://postgres:a-strong-password-here@localhost:5432/foodhouse
```

## 5. Configure environment variables
```bash
cd /var/www/QUVEXA-TECH-RESTAURANT/backend
nano .env
```
Paste (fill in your real values):
```
PORT=4000
NODE_ENV=production
DATABASE_URL=postgres://...           # from step 4
PGSSL=true                            # only if using Neon/Supabase (Option A)
JWT_SECRET=a-long-random-string-here
PLATFORM_ADMIN_USER=admin
PLATFORM_ADMIN_PASSWORD=a-strong-password
```
Save (Ctrl+O, Enter, Ctrl+X).

## 6. Start the app with PM2
```bash
cd /var/www/QUVEXA-TECH-RESTAURANT/backend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # run the command it prints, so it survives reboots
```
Check it's alive: `curl http://localhost:4000/api/health` → should print `{"ok":true,...}`

## 7. Nginx reverse proxy (so port 80/443 reaches your app)
```bash
cp /var/www/QUVEXA-TECH-RESTAURANT/deploy/nginx.conf.example /etc/nginx/sites-available/foodhouse
nano /etc/nginx/sites-available/foodhouse   # change server_name to your real domain
ln -s /etc/nginx/sites-available/foodhouse /etc/nginx/sites-enabled/
nginx -t                # should say "syntax is ok"
systemctl reload nginx
```

## 8. Point your domain at the Droplet
In your domain registrar's DNS settings, add an **A record**:
- Host: `admin` (or `@` for the root domain)
- Value: `YOUR_DROPLET_IP`
- Wait a few minutes for DNS to propagate.

## 9. Free HTTPS (Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d admin.yourplatform.com
```
Certbot edits the Nginx config for you and auto-renews every 90 days.

## 10. Verify
- `https://admin.yourplatform.com/superadmin.html` → log in with `PLATFORM_ADMIN_USER` / `PLATFORM_ADMIN_PASSWORD`
- `https://admin.yourplatform.com/login.html` → staff login (any restaurant)
- `https://admin.yourplatform.com/index.html?r=food-house` → sample customer view

## Later: adding a restaurant's own domain (e.g. foodhouse.com)
1. Restaurant owner (or you, from Super Admin) points their domain's DNS **A record** at the same Droplet IP.
2. Add another `server_name` line (or a new server block) in the Nginx config for that domain, run `certbot --nginx -d foodhouse.com` again.
3. In Settings (owner) or Super Admin, set the Custom Domain field to `foodhouse.com`.
No new deploy needed — one server handles every restaurant's domain.

## Redeploying after code changes
```bash
cd /var/www/QUVEXA-TECH-RESTAURANT
git pull
cd backend && npm install --omit=dev
pm2 restart foodhouse-api
```
