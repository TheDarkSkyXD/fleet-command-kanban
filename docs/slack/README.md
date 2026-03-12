# Slack Integration

Fleet Command can notify you and ask questions in a Slack channel (or DM) while it works. Each ticket gets its own thread so conversations stay organized.

## Prerequisites

- A Slack workspace where you have permission to install apps
- A running fleet-command daemon (`fleet-command start`)

## 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From a manifest**
3. Select your workspace
4. Switch the manifest format to **YAML** and paste the contents of [`manifest.yaml`](./manifest.yaml) (in this directory)
5. Click **Create**

## 2. Enable Socket Mode

1. In your new app's settings, go to **Settings → Basic Information**
2. Scroll to **App-Level Tokens** and click **Generate Token and Scopes**
3. Name the token (e.g. `fleet-command`) and add the **`connections:write`** scope
4. Click **Generate** — copy the token that starts with `xapp-`

## 3. Install the App

1. Go to **Settings → Install App**
2. Click **Install to Workspace** and approve the permissions
3. Copy the **Bot User OAuth Token** — it starts with `xoxb-`

## 4. Configure fleet-command

Edit `~/.fleet-command/config.json` and add a `slack` key with your two tokens:

```json
{
  "slack": {
    "botToken": "xoxb-your-bot-token",
    "appToken": "xapp-your-app-token",
    "channelId": "C0123456789"
  },
  "daemon": {
    "port": 8443
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `botToken` | Yes | Bot User OAuth Token (`xoxb-...`) from step 3 |
| `appToken` | Yes | App-Level Token (`xapp-...`) from step 2 |
| `channelId` | No | Channel or member ID — see below |

> **Keep tokens secret.** Do not commit `config.json` to version control.

## 5. Choose Where Messages Go

### Option A: Specific channel (recommended)

Set `channelId` to a channel ID like `C0123456789`.

To find a channel ID: open Slack, right-click the channel name → **View channel details** — the ID is at the bottom of the dialog.

Make sure to **invite the bot** to the channel (`/invite @Fleet Command`).

### Option B: Direct message

Set `channelId` to a user's **member ID** like `U0123456789`.

To find a member ID: click a user's profile picture → **⋮ More** → **Copy member ID**.

### Option C: Auto-discovery (fallback)

Omit `channelId` entirely. The bot will find the first non-#general public channel it belongs to.

Add the bot to exactly one channel for predictable behavior. If the bot isn't in any channel, it will log a warning and remain silent until you add it to one.

## 6. Restart the Daemon

```bash
fleet-command stop && fleet-command start
```

The daemon reads `config.json` at startup. Look for a log line like:

```
[SlackProvider] Using configured channel: C0123456789
```

or, if using auto-discovery:

```
[SlackProvider] Auto-discovered channel: #your-channel (C0123456789)
```

Slack integration is now active. Fleet Command will create a new thread in your channel for each ticket and ask questions there as it works.
