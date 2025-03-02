With NodeJS and Typescript, I would like to build the following discord bot (using discord.js).

This bot will allow discord server users to dynamically create voice channels without needing the permission to create channels in a server.

The way that works is there are dedicated voice channels for creation, that when a new user connects to the channel, the bot will create a new voice channel named `{username}'s channel` and move the user into it. These users will have permission to set the channel status, and rename the channel as well.

For these dynamically created channels, when the last user leaves the channel, it should be deleted.

All state should be stored in a sqlite table if needed.

You never need to look at messages, or send messages either. This is _purely_ channel management based on connect/disconnect events.

You should use the existing logger in `src/logger/index.ts` rather than `console.*`

Keep the code very simple and readable so it's easy to maintain.

Do not directly modify the package.json, just run the relevant `npm i ...` commands to install packages so the latest versions are fetched.

## Configuration

Configuration of this bot will be done entirely through discord commands, all of which require `PermissionsBitField.Flags.ManageGuild` on the server to use.

The commands that need to be implemented are:

- Create a "Creation Channel", which will create/rename the current creation channel to some provided text input, and the minimum user role required to join (and thus dynamically create a channel). It can optionally be configured to have a limit to the number of people allowed to join as well, which gets applied to the newly created channel. For the role check, use Discord's native permissions system (we shouldn't need to check)
- Delete one of these creation channels

## Readme

Create a readme that explains how the bot works, how to install the bot with https://discord.com/oauth2/authorize?client_id=1345860342349037568&permissions=1104&integration_type=0&scope=bot and how to use each of the commands
