import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js"
import { logger } from "../logger/index.js"
import {
  createCreationChannel,
  updateCreationChannel,
  getCreationChannelById,
  createOrUpdateCreationChannel,
} from "../db/index.js"

export const createChannelCommand = {
  data: new SlashCommandBuilder()
    .setName("createcommschannel")
    .setDescription("Create or update a voice channel creator")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name for the creation channel")
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription(
          "The minimum role required to create a channel (leave empty for @everyone)"
        )
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription(
          "The maximum number of users allowed in created channels"
        )
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(99)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      })
      return
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      const guildId = interaction.guildId!
      const channelName = interaction.options.getString("name")!
      const role = interaction.options.getRole("role")
      const userLimit = interaction.options.getInteger("limit")

      // Create a new creation channel
      const creationChannel = await createOrUpdateCreationChannel(
        guildId,
        channelName,
        role ? role.id : null,
        userLimit
      )

      await interaction.editReply(
        `✅ Creation channel ${
          creationChannel ? "updated" : "created"
        } successfully!\n` +
          `Name: **${channelName}**\n` +
          `Required role: ${role ? `**${role.name}**` : "**@everyone**"}\n` +
          `User limit for new channels: ${
            userLimit ? `**${userLimit}**` : "**No limit**"
          }`
      )

      logger.info(
        `Created/updated creation channel ${
          creationChannel ? creationChannel.id : "unknown"
        } in guild ${guildId}`
      )
    } catch (error) {
      logger.error(`Error creating/updating creation channel: ${error}`)

      let errorMessage =
        "There was an error creating the creation channel. Please try again later."

      // Check for permissions error
      const errorStr = String(error)
      if (
        errorStr.includes("Missing permissions") ||
        errorStr.includes("Missing Permissions")
      ) {
        errorMessage =
          "I don't have permission to create voice channels. Please make sure:\n" +
          "1. My role has the **Manage Channels** permission\n" +
          "2. I have permission to see and manage the category where you want to create channels"
      }

      await interaction.editReply(errorMessage)
    }
  },
}
