# 🧀 Cheezy Poof Digital Currency

A real server-based digital currency system with gift box animations, accounts, and an admin panel.

---

## 🚀 How to Deploy (Step by Step)

### Step 1 — Install Node.js
1. Go to **https://nodejs.org**
2. Download the **LTS** version (big green button)
3. Install it (just click Next, Next, Finish)
4. Restart your computer after installing

### Step 2 — Install Git
1. Go to **https://git-scm.com/downloads**
2. Download and install Git for your OS
3. Restart your computer

### Step 3 — Create a GitHub account
1. Go to **https://github.com** and sign up (it's free)

### Step 4 — Upload this project to GitHub
1. Create a new repository on GitHub called `cheezypoof`
2. Open a terminal (search "Terminal" on Mac or "Command Prompt" on Windows)
3. Navigate to this folder:
   ```
   cd path/to/cheezypoof
   ```
4. Run these commands one by one:
   ```
   npm install
   git init
   git add .
   git commit -m "Initial Cheezy Poof launch 🧀"
   git branch -M main
   git remote add origin https://github.com/YOURUSERNAME/cheezypoof.git
   git push -u origin main
   ```
   (Replace YOURUSERNAME with your GitHub username)

### Step 5 — Deploy to Railway (free hosting)
1. Go to **https://railway.app** and sign up with your GitHub account
2. Click **"New Project"**
3. Click **"Deploy from GitHub repo"**
4. Select your `cheezypoof` repository
5. Railway will automatically detect it's a Node.js app and deploy it!
6. Once deployed, click **"Settings"** → **"Domains"** → **"Generate Domain"**
7. You'll get a free URL like `cheezypoof.up.railway.app` — share this with your users!

---

## 🔐 Admin Login
- **Name:** Chase Petrosky
- **Cred ID:** `10219982`
- **Protection ID:** `3491`

---

## 📁 Project Structure
```
cheezypoof/
├── server.js          ← The backend server
├── package.json       ← Dependencies
├── Procfile           ← Tells Railway how to start the app
├── data/
│   └── db.json        ← Auto-created database (all accounts & transactions)
└── public/
    └── index.html     ← The frontend (all screens, animations, UI)
```

---

## ✨ Features
- 🎁 Gift box animation when sending money (flies up into the sky!)
- 👤 Accounts: First Name, Last Name, Cred ID (8 digits), Protection ID (4 digits)
- 💰 View balance and transaction history
- 📤 Send Cheezy Poofs to anyone by their Cred ID
- 🔐 Admin panel (Chase Petrosky only):
  - View all accounts
  - Give or remove money from any account
  - Create new accounts
  - Delete accounts
  - View all transactions

---

## 🛠 Running Locally (for testing)
```bash
npm install
node server.js
```
Then open http://localhost:3000 in your browser.
