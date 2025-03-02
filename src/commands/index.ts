import { REST, Routes } from "discord.js"
import { logger } from "../logger/index.js"
import { Client } from "discord.js"
import { createChannelCommand } from "./create-channel.js"

// List of all commands
const commands = [createChannelCommand]

/**
 * Register all slash commands with Discord
 */
export async function registerCommands(client: Client, clientId: string) {
  try {
    logger.info("Started refreshing application (/) commands.")

    // Set up command handlers
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return

      try {
        // Find the command handler
        const command = commands.find(
          (cmd) => cmd.data.name === interaction.commandName
        )

        if (!command) {
          logger.warn(
            `No command matching ${interaction.commandName} was found.`
          )
          return
        }

        // Execute the command
        await command.execute(interaction)
      } catch (error) {
        logger.error(
          `Error executing command ${interaction.commandName}: ${error}`
        )

        const errorMessage = "There was an error while executing this command!"
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true })
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true })
        }
      }
    })

    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!)

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((command) => command.data.toJSON()),
    })

    logger.info("Successfully reloaded application (/) commands.")
  } catch (error) {
    logger.error("Error registering application commands:")
    logger.error(error)
  }
}
