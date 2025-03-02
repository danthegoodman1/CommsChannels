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

1. [Click here to invite the bot to your server](https://discord.com/oauth2/authorize?client_id=1345860342349037568&permissions=16778256&integration_type=0&scope=bot)
2. Make sure the bot has the following permissions:
   - Manage Channels
   - Move Members
   - Connect to Voice Channels

## Commands

All commands require the "Manage Server" permission to use.

### Creating a Channel Creator

```
/createcommschannel name:[channel name] role:[minimum role required] limit:[user limit]
```

- **name** (required): The name for the creation channel
- **role** (optional): The minimum role required to create a channel (defaults to @everyone)
- **limit** (optional): The maximum number of users allowed in created channels (will apply to both created channels and the creation channel itself)

The command will create a new voice channel with the specified settings. When users join this channel, they will automatically get their own voice channel.

### Managing Channel Creators

To remove a creation channel, simply delete the voice channel in your server. The bot will automatically detect this and remove it from its system.

## Example Setup

1. Use the command: `/createcommschannel name:Create a Room`
2. A new voice channel named "Create a Room" will be created
3. Now when users join "Create a Room", they'll automatically get their own voice channel
4. To remove it, just delete the channel through Discord's normal interface

## Support

If you encounter any issues or have questions about the bot, please contact the bot owner or report issues on the support server.
