<div align="center">
  <h1>Shiro『NGNL』Daily</h1>
  <img src="https://raw.githubusercontent.com/qbekun/Shiro-NGNL-Daily/refs/heads/main/img/shiro.jpg" height="128" />
  <p>Daily Shiro pictures via Discord webhook</p>
</div>

## Setup

### 1. Create a Discord webhook
- Go to the channel where you want to receive the pictures
- **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**
- Copy the webhook URL

### 2. Get an API key from Gelbooru
- Log in to [gelbooru.com](https://gelbooru.com)
- Go to **My Account** → **Options**
- Copy your `API Key` and `User ID`

### 3. Fork the repository
- Click **Fork** at the top of the page

### 4. Add Secrets
- Go to your repository → **Settings** → **Secrets and variables** → **Actions**
- Click **New repository secret** and add:
  - `API_KEY` → your Gelbooru API key
  - `USER_ID` → your Gelbooru User ID
  - `WEBHOOK` → your Discord webhook URL

### 5. Run
- Go to the **Actions** tab
- Click **"Run workflow"**
- The bot will send one random Shiro picture every day at **08:00 UTC**
