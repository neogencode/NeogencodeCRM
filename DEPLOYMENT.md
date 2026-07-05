# Deploying NeoGenCode CRM (Client-Server Architecture)

This project has been refactored into a secure **Client-Server architecture** with a Node.js Express backend (`backend/`) that hosts APIs and serves static frontend files (`frontend/`).

To deploy the application and connect a live **Turso Cloud Database** with **Gmail SMTP** 100% free forever, follow the instructions below.

---

## ⚡ Option 1: Vercel (Recommended - Lifetime Free & SMTP Unblocked)
Vercel offers a lifetime free tier for hosting Serverless Node.js applications. Because it runs on AWS Lambda infrastructure, **outgoing SMTP ports are not blocked**, allowing your Gmail OTP system to work perfectly.

### 1. Push Code to GitHub
Ensure you have pushed the entire workspace (including `vercel.json`, `backend/`, and `frontend/`) to your GitHub repository:
`https://github.com/neogencode/NeogencodeCRM-Backend.git`

### 2. Import to Vercel
1. Sign up/Log in at [vercel.com](https://vercel.com) using your GitHub account.
2. Click **Add New** > **Project**.
3. Import your `NeogencodeCRM-Backend` repository.
4. Keep the default framework presets (Vercel will auto-detect the root `vercel.json` configuration and build parameters).
5. Open the **Environment Variables** panel and add the following keys:
   - `JWT_SECRET` = `neogencode-super-secret-key-2026`
   - `SMTP_HOST` = `smtp.gmail.com`
   - `SMTP_PORT` = `587`
   - `SMTP_SECURE` = `false`
   - `SMTP_USER` = `neogencodecrm@gmail.com`
   - `SMTP_PASS` = `yuqwmhelolmijfll`
   - `SMTP_FROM` = `"Neogencode CRM" <neogencodecrm@gmail.com>`
   - `TURSO_URL` = `libsql://your-database-name.turso.io`
   - `TURSO_TOKEN` = `eyJhbGciOiJFUzI1NiIs...`
6. Click **Deploy**. Vercel will build and host your application, providing a lifetime-free URL (e.g. `neogencode-crm.vercel.app`).

---

## ☁️ Option 2: Deploying to Render (Free Tier - Outbound SMTP Blocked)
Render is an alternative hosting platform for Node.js web services. Note: direct SMTP email sending is blocked on Render's free tier.

1. Create a free account at [render.com](https://render.com).
2. Click **New +** and select **Web Service**.
3. Connect your Git repository.
4. Set the following configuration details:
   - **Name**: `neogencode-crm` (or choose your own name)
   - **Runtime**: `Node`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
5. Click **Advanced** to add **Environment Variables** (see list below).
6. Click **Create Web Service**. Your app will be live at `https://neogencode-crm.onrender.com`.

---

## ⚡ Option 2: Deploying to Railway (Fastest)
Railway is extremely quick for hosting Node.js projects.

1. Sign up on [railway.app](https://railway.app).
2. Click **New Project** > **Deploy from GitHub repo**.
3. Under variables, add the Environment Variables list.
4. Railway will automatically detect the entry point and deploy the server.

---

## 🗄️ Setting Up Your Free Turso Database
Turso is a fast, edge-hosted SQLite-compatible database with a generous free tier.

1. Sign up at [turso.tech](https://turso.tech) and install the Turso CLI or use the Web Dashboard.
2. Create a new database:
   ```bash
   turso db create neogencode-crm
   ```
3. Retrieve your **Database URL**:
   ```bash
   turso db show neogencode-crm --url
   # Example output: libsql://neogencode-crm-yourusername.turso.io
   ```
4. Generate an **Authorization JWT Token**:
   ```bash
   turso db tokens create neogencode-crm
   # Example output: eyJhbGciOiJFUzI1NiIs...
   ```
5. Add these two values to your host's environment variables (`TURSO_URL` and `TURSO_TOKEN`). The backend will automatically connect, initialize the SQLite schema, and seed default user accounts upon deployment!

---

## 🔑 Required Environment Variables
Configure the following variables on your hosting provider dashboard:

| Variable | Description | Value |
| :--- | :--- | :--- |
| `PORT` | The port the backend listens on | `5000` (or leave blank for default) |
| `JWT_SECRET` | Secret key for signing authorization tokens | Choose a strong random string |
| `SMTP_HOST` | Outgoing SMTP mail server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | Set secure SSL connection | `false` |
| `SMTP_USER` | Your email username | `neogencodecrm@gmail.com` |
| `SMTP_PASS` | Your Gmail App Password | `yuqwmhelolmijfll` |
| `SMTP_FROM` | Sender Name & Address header | `"Neogencode CRM" <neogencodecrm@gmail.com>` |
| `TURSO_URL` | Turso edge database connection URL | `libsql://your-db.turso.io` |
| `TURSO_TOKEN` | Turso edge database access token | `eyJhbGciOiJFUzI1NiIs...` |

---

## 🔌 Chrome Extension Sync Settings
To link your **neogencode-extractor** extension:
1. Log in to the deployed portal.
2. Go to **Settings** / **Sync Settings** in the dashboard header.
3. The platform will display a **Connection Token**. Copy this token.
4. Click the Chrome Extension popup, paste the token, and click **Connect**.
5. Leads will now sync directly to your live cloud database!
