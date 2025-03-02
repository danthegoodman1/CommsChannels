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
const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = process.env.CLIENT_ID

if (!TOKEN || !CLIENT_ID) {
  logger.error(
    "Missing required environment variables: DISCORD_TOKEN and/or CLIENT_ID"
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
    initializeDatabase()

    // Login to Discord
    await client.login(TOKEN)
  } catch (error) {
    logger.error(`Failed to start the bot: ${error}`)
    process.exit(1)
  }
}

client.on(
  "voiceStateUpdate",
  async (oldState: VoiceState, newState: VoiceState) => {
    try {
      await handleVoiceStateUpdate(oldState, newState)
    } catch (error) {
      logger.error(`Error handling voice state update: ${error}`)
    }
  }
)

// Add channel deletion event listener
client.on(Events.ChannelDelete, async (channel) => {
  try {
    // Check if this was a creation channel
    if (channel.type === ChannelType.GuildVoice) {
      const creationChannel = getCreationChannelById(channel.id)
      if (creationChannel) {
        // This was a creation channel, remove it from the database
        deleteCreationChannel(channel.id)
        logger.info(
          `Removed creation channel ${channel.name} (${channel.id}) from database after Discord channel deletion`
        )
      }

      // Also check if it was a created voice channel
      const createdChannel = getCreatedVoiceChannel(channel.id)
      if (createdChannel) {
        // This was a dynamically created channel, remove it from tracking
        deleteCreatedVoiceChannel(channel.id)
        logger.info(
          `Removed created channel ${channel.name} (${channel.id}) from tracking after Discord channel deletion`
        )
      }
    }
  } catch (error) {
    const errorMessage = String(error)
    if (
      errorMessage.includes("Missing Access") ||
      errorMessage.includes("50001")
    ) {
      logger.info(
        `Non-critical error during channel deletion handling: ${errorMessage}`
      )
    } else {
      logger.error(`Error handling channel deletion: ${errorMessage}`)
    }
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
  logger.error(`Discord client error: ${error}`)
})

process.on("uncaughtException", (error) => {
  logger.error(`Uncaught exception: ${error}`)
})

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${reason}`)
})

// Start the bot
main()
