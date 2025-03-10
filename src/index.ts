import "dotenv/config"

import {
  Client,
  Events,
  GatewayIntentBits,
  VoiceState,
  AutocompleteInteraction,
  ChannelType,
} from "discord.js"
import { logger } from "./logger/index.js"
import {
  initializeDatabase,
  getCreationChannelById,
  deleteCreationChannel,
  getCreatedVoiceChannel,
  deleteCreatedVoiceChannel,
} from "./db/index.js"
import { handleVoiceStateUpdate } from "./voice-handlers.js"
import { registerCommands } from "./commands/index.js"

// Environment variables
const TOKEN = process.env.DISCORD_BOT_TOKEN
const CLIENT_ID = process.env.DISCORD_APPLICATION_ID

if (!TOKEN || !CLIENT_ID) {
  logger.error(
    "Missing required environment variables: DISCORD_BOT_TOKEN and/or DISCORD_APPLICATION_ID"
  )
  process.exit(1)
}

// Initialize the Discord client
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // Required for voice channel events
  ],
})

// Startup logic
async function main() {
  try {
    // Initialize database
    await initializeDatabase()

    // Login to Discord
    await client.login(TOKEN)
  } catch (error) {
    logger.error("Failed to start the bot:")
    logger.error(error)
    process.exit(1)
  }
}

client.on(
  "voiceStateUpdate",
  async (oldState: VoiceState, newState: VoiceState) => {
    try {
      await handleVoiceStateUpdate(oldState, newState)
    } catch (error) {
      logger.error("Error handling voice state update:")
      logger.error(error)
    }
  }
)

// Add channel deletion event listener
client.on(Events.ChannelDelete, async (channel) => {
  // Only process voice channels
  if (channel.type !== ChannelType.GuildVoice) return

  // Get the channel ID now since we need it in multiple places
  const channelId = channel.id
  const channelName = channel.name

  // First check if this was a creation channel
  try {
    const creationChannel = await getCreationChannelById(channelId)
    if (creationChannel) {
      // This was a creation channel, remove it from the database
      await deleteCreationChannel(channelId)
      logger.info(
        `Removed creation channel ${channelName} (${channelId}) from database after Discord channel deletion`
      )
    }
  } catch (creationError) {
    logger.error("Error handling creation channel deletion:")
    logger.error(creationError)
    // Continue to the next check even if this one failed
  }

  // Then check if it was a created voice channel
  try {
    const createdChannel = await getCreatedVoiceChannel(channelId)
    if (createdChannel) {
      // This was a dynamically created channel, remove it from tracking
      await deleteCreatedVoiceChannel(channelId)
      logger.info(
        `Removed created channel ${channelName} (${channelId}) from tracking after Discord channel deletion`
      )
    }
  } catch (createdError) {
    logger.error("Error handling created channel deletion:")
    logger.error(createdError)
  }
})

// Client ready event
client.once(Events.ClientReady, async () => {
  // Register slash commands - Explicitly cast CLIENT_ID to string since we verified it exists above
  await registerCommands(client, CLIENT_ID as string)

  logger.info("Discord client is ready")
})

// Error handling
client.on("error", (error) => {
  logger.error("Discord client error:")
  logger.error(error)
})

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:")
  logger.error(error)
})

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:")
  logger.error(reason)
})

// Start the bot
main()
