# CoinDCX Trading Bot — Production Architecture & Deployment Guide

## 1. Architectural Overview & Why Vercel Cannot Host the Bot Backend

### The Serverless Freeze Problem
A cryptocurrency trading bot is an **event-driven, continuous background system**. It relies on:
- An active `setInterval` loop evaluating price ticks and technical indicators (every 5–10 seconds).
- Persistent bi-directional WebSocket connections (`Socket.IO`) to broadcast price updates, orders, and P&L changes to the frontend in real time.
- Immediate trigger execution when Stop-Loss or Take-Profit thresholds are breached.

**Why Vercel Serverless Fails for the Backend:**
Vercel executes backend code as AWS Lambda-style **serverless functions**. Serverless functions only execute in response to an incoming HTTP request. Once the HTTP response is sent, the container process is frozen or torn down.
- Background timers (`setInterval`) are suspended.
- WebSocket servers cannot maintain persistent duplex connections.
- If no user is clicking on the website, the bot will stop evaluating prices, meaning stop-losses will NOT trigger!

---

## 2. Recommended Production Architecture

| Layer | Recommended Platform | Why? |
|---|---|---|
| **Frontend UI** | **Vercel** / Cloudflare Pages / Netlify | Free, global Edge CDN, sub-second latency for static React/Vite build, automatic SSL. |
| **Backend API & Bot Loop** | **Render** (Web Service) / **Railway** / **VPS (Ubuntu + PM2)** | Always-on, persistent Node.js process, continuous WebSocket support, zero-sleep background evaluation. |
| **Database** | **MongoDB Atlas** | Managed, free M0 tier, automatic backups, persistent across redeployments. |

---

## 3. Backend Deployment Guide

### Option A: Render (Web Service) — Recommended & Free/Low Cost
1. Sign up on [Render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Set the following configuration:
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free or Starter (Starter is recommended for uninterrupted 24/7 uptime without free-tier cold starts).
5. Add **Environment Variables** in the Render Dashboard:
   ```env
   NODE_ENV=production
   PORT=5000
   API_SECRET_KEY=your_super_strong_random_secret_here_32chars
   CORS_ORIGIN=https://your-frontend.vercel.app
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/coindcx_bot
   TRADING_MODE=PAPER_TRADING
   DEFAULT_PAIR=BTCUSDT
   MAX_TRADE_AMOUNT=50
   MAX_DAILY_LOSS=100
   STOP_LOSS_PERCENT=2.0
   TAKE_PROFIT_PERCENT=4.0
   MAX_OPEN_POSITIONS=2
   EVAL_INTERVAL_MS=10000
   COINDCX_API_KEY=your_key_when_live
   COINDCX_API_SECRET=your_secret_when_live
   ```
6. Click **Create Web Service**. Note down the assigned URL (e.g. `https://coindcx-trading-bot-api.onrender.com`).

---

### Option B: VPS (DigitalOcean / AWS EC2 / Hetzner) with PM2
For maximum speed, low latency, and zero cold starts, a $4–$6/month VPS is the gold standard for crypto bots.

1. SSH into your VPS:
   ```bash
   ssh root@your_server_ip
   ```
2. Install Node.js (v20+), Git, and PM2:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   sudo npm install -g pm2
   ```
3. Clone your repository:
   ```bash
   git clone https://github.com/sujeet-bhardwaj/coindcx-trading-bot.git
   cd coindcx-trading-bot/backend
   npm install --production
   ```
4. Configure `.env`:
   ```bash
   cp .env.example .env
   nano .env
   # Fill in API_SECRET_KEY, MONGODB_URI, and other settings
   ```
5. Launch the backend with PM2:
   ```bash
   pm2 start src/server.js --name "coindcx-bot"
   pm2 save
   pm2 startup
   ```
6. (Optional) Set up Nginx as reverse proxy with Certbot SSL:
   ```nginx
   server {
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## 4. Frontend Deployment on Vercel

1. Push your project to GitHub.
2. Sign up / Log in to [Vercel](https://vercel.com).
3. Click **Add New...** -> **Project**.
4. Import your repository.
5. In **Project Settings**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
6. In **Environment Variables**, add:
   ```env
   VITE_BACKEND_URL=https://coindcx-trading-bot-api.onrender.com
   VITE_API_SECRET_KEY=your_super_strong_random_secret_here_32chars
   ```
   *(Ensure `VITE_API_SECRET_KEY` matches the `API_SECRET_KEY` defined on the backend)*
7. Click **Deploy**. Vercel will build the React SPA and provide a live URL (e.g. `https://coindcx-bot.vercel.app`).
8. Return to your backend (Render/Railway/VPS) and set `CORS_ORIGIN=https://coindcx-bot.vercel.app` to secure the API.

---

## 5. Security & Verification Checklist

- [x] **API Authentication**: `/api/bot/*` mutation endpoints require `Authorization: Bearer <API_SECRET_KEY>`.
- [x] **CORS Locked**: `CORS_ORIGIN` matches frontend domain in production (prevents unauthorized external origins).
- [x] **Risk Settings Validation**: Numerical boundaries prevent negative trade amounts or runaway stop-losses.
- [x] **Synthetic Price Guard**: Mock prices (`85000.00`) are rejected; bot pauses/holds if real market feed drops.
- [x] **Multi-Position Tracking**: Concurrently holds up to `MAX_OPEN_POSITIONS` with individual SL/TP tracking.
- [x] **Paper Trading State Persisted**: Virtual balances and open positions survive container redeployments via MongoDB.
