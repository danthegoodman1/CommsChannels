import {
  Client,
  ChannelType,
  VoiceState,
  PermissionsBitField,
  GuildMember,
  OverwriteResolvable,
} from "discord.js"
import { logger } from "./logger/index.js"
import {
  getCreationChannelById,
  trackCreatedVoiceChannel,
  getCreatedVoiceChannel,
  deleteCreatedVoiceChannel,
} from "./db/index.js"

/**
 * Handle voice state updates to create or delete dynamic voice channels
 */
export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
) {
  // User joined a voice channel
  if (
    newState.channelId &&
    (!oldState.channelId || oldState.channelId !== newState.channelId)
  ) {
    await handleUserJoinedChannel(newState)
  }

  // User left a voice channel
  if (
    oldState.channelId &&
    (!newState.channelId || oldState.channelId !== newState.channelId)
  ) {
    await handleUserLeftChannel(oldState)
  }
}

/**
 * Handle a user joining a voice channel
 */
async function handleUserJoinedChannel(state: VoiceState) {
  // Check if this is a creation channel
  const creationChannel = await getCreationChannelById(state.channelId!)
  if (!creationChannel) return

  logger.info(
    `User ${state.member?.user.tag} joined creation channel ${state.channel?.name}`
  )

  // We no longer need to check for roles since Discord will handle permissions
  // Users without the required role won't be able to join the channel
  // If a join role is specified, it also controls access to the creation channel

  try {
    // Create a new voice channel for the user
    const guild = state.guild
    const username =
      state.member?.displayName || state.member?.user.username || "User"

    // Check bot permissions
    const botMember = guild.members.me
    if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      logger.error(
        `Bot doesn't have the ManageChannels permission in guild ${guild.id}`
      )
      return
    }

    // Safely get parent category (if any)
    const parentId = state.channel?.parent?.id

    try {
      // Set up basic permission overwrites for the creator
      const permissionOverwrites: OverwriteResolvable[] = [
        {
          id: state.member!.id,
          allow: [
            PermissionsBitField.Flags.ManageChannels, // Allows the user to rename the channel
          ],
        },
      ]

      // If join role is specified, simply apply it - let Discord handle permissions
      if (creationChannel.join_role_id) {
        // Deny @everyone
        permissionOverwrites.push({
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.Connect],
        })

        // Allow the specified role
        permissionOverwrites.push({
          id: creationChannel.join_role_id,
          allow: [PermissionsBitField.Flags.Connect],
        })
      }

      // Always ensure the bot can manage the channel
      if (guild.members.me) {
        permissionOverwrites.push({
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.ManageChannels,
          ],
        })
      }

      const newChannel = await guild.channels.create({
        name: `${username}'s channel`,
        type: ChannelType.GuildVoice,
        parent: parentId,
        userLimit: creationChannel.user_limit || undefined,
        permissionOverwrites,
      })

      // Move the user to the new channel
      await state.setChannel(newChannel)

      // Track the created channel in the database
      await trackCreatedVoiceChannel(newChannel.id, guild.id, state.member!.id)

      logger.info(
        `Created voice channel ${newChannel.name} for user ${state.member?.user.tag}`
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      if (errorMessage.includes("Missing Permissions")) {
        logger.error(
          `Missing permissions to create voice channel in guild ${guild.id}. Check bot permissions.`
        )
      } else {
        logger.error(
          `Failed to create voice channel for user ${state.member?.user.tag}: ${errorMessage}`
        )
      }
    }
  } catch (outerError) {
    logger.error(
      `Unexpected error in handleUserJoinedChannel: ${
        outerError instanceof Error ? outerError.message : String(outerError)
      }`
    )
  }
}

/**
 * Handle a user leaving a voice channel
 */
async function handleUserLeftChannel(state: VoiceState) {
  // Check if this is a dynamically created channel
  const createdChannel = await getCreatedVoiceChannel(state.channelId!)
  if (!createdChannel) return

  const channel = state.channel

  // Don't delete the channel if there are still users in it
  if (channel && channel.members.size > 0) {
    return
  }

  try {
    // No members left in the channel, delete it
    if (channel) {
      await deleteCreatedVoiceChannel(state.channelId!)
      await channel.delete(`Last user left the dynamically created channel`)
      logger.info(`Deleted empty voice channel ${channel.name}`)
    }
  } catch (error) {
    logger.error("Failed to delete voice channel:")
    logger.error(error)
  }
}
