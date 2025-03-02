# Discord Dynamic Voice Channel Bot

A Discord bot that allows users to dynamically create their own voice channels without needing channel creation permissions.

## How It Works

1. Server admins create designated "Creation Channels"
2. When a user joins one of these creation channels, the bot:
   - Creates a new voice channel named "[User]'s channel"
   - Moves the user to the new channel
   - Gives the user permissions to rename and modify their channel
3. When the last user leaves a dynamically created channel, it gets automatically deleted

## Features

- Create voice channels on-demand without giving users permission to create channels
- Users can rename and manage their own channels
- Automatic cleanup when channels are no longer in use
- Option to restrict creation to specific user roles
- Option to set user limits on created channels
- Creation channels are automatically removed from the system when deleted in Discord

## Installation

### Official hosted Bot

1. [Click here to invite the offically hosted bot to your server](https://discord.com/oauth2/authorize?client_id=1345860342349037568&permissions=16778256&integration_type=0&scope=bot)
2. Make sure the bot has the following permissions:
   - Manage Channels
   - View Channels
   - Move Member

### Self-hosting

#### Creating a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Under the "Bot" tab:
   - Copy the "TOKEN" (you may need to click "Reset Token" first)
4. Go to the "General Information" tab and copy the "APPLICATION ID"
5. Generate an invite link from the OAuth2 tab:
   - Select the "bot" scope
   - Select these permissions: "Manage Channels", "View Channels", and "Move Member"
   - Use the generated URL to invite the bot to your server

#### Environment Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   # Discord Bot Configuration
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_APPLICATION_ID=your_application_id
   ```
   Replace `your_discord_bot_token` and `your_application_id` with the values you copied from the Discord Developer Portal.

#### Running the Bot

**Development Mode** (with hot reloading):

```
npm run dev
```

**Production Mode**:

```
npm run build
npm start
```

The bot should now be running and will respond to the commands listed below.

## Commands

All commands require the "Manage Server" permission to use.

### Creating a Channel Creator

Use the `/createcommschannel` command, which takes the following parameters:

- **name** (required): The name for the creation channel
- **role** (optional): The minimum role required to create a channel (defaults to @everyone)
- **limit** (optional): The maximum number of users allowed in created channels (will apply to both created channels and the creation channel itself)

The command will create a new voice channel with the specified settings. When users join this channel, they will automatically get their own voice channel.

When the last user in the dynamically creates channel leaves, it will delete the channel.

### Managing Channel Creators

To remove a creation channel, simply delete the voice channel in your server. The bot will automatically detect this and remove it from its system.

## Support

If you encounter any issues or have questions about the bot, create a Github Issue at https://github.com/danthegoodman1/CommsChannels
