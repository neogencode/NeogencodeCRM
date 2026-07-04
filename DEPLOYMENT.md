# Deploying NeoGenCode CRM (Client-Server Architecture)

This project has been refactored into a secure **Client-Server architecture** with a Node.js Express backend (`backend/`) that hosts APIs and serves static frontend files (`frontend/`).

To deploy the application to a cloud host (like Render, Railway, or Heroku) and connect a live **Turso Cloud Database**, follow the instructions below.

---

## ☁️ Option 1: Deploying to Render (Recommended & Free)
Render is an excellent free hosting platform for Node.js web services.

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
