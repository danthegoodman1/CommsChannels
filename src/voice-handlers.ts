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

// In-memory counter for channel creation
// Key: creation channel ID, Value: counter
const channelCounters = new Map<string, number>()

/**
 * Helper function to add permission overwrite if it doesn't exist
 */
function addPermissionIfNotExists(
  overwrites: OverwriteResolvable[],
  id: string,
  allow?: bigint[],
  deny?: bigint[]
) {
  const exists = overwrites.some((ow) => ow.id === id)
  if (!exists) {
    overwrites.push({
      id,
      ...(allow && { allow }),
      ...(deny && { deny }),
    })
  }
}

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

    // Get and increment the counter for this creation channel
    const creationChannelId = state.channelId!
    const currentCount = channelCounters.get(creationChannelId) || 0
    const newCount = currentCount + 1
    channelCounters.set(creationChannelId, newCount)

    // Generate channel name based on creation channel name + counter
    const channelName = `${creationChannel.name} ${newCount}`

    try {
      // Copy permission overwrites from the creation channel
      const creationChannelDiscord = state.channel
      const permissionOverwrites: OverwriteResolvable[] = []

      // Inherit all existing permission overwrites from the creation channel
      if (creationChannelDiscord?.permissionOverwrites) {
        creationChannelDiscord.permissionOverwrites.cache.forEach(
          (overwrite) => {
            permissionOverwrites.push({
              id: overwrite.id,
              allow: overwrite.allow.bitfield,
              deny: overwrite.deny.bitfield,
            })
          }
        )
      }

      // Add supplemental role-based permissions from database settings
      if (creationChannel.join_role_id) {
        addPermissionIfNotExists(
          permissionOverwrites,
          creationChannel.join_role_id,
          [PermissionsBitField.Flags.Connect]
        )
        addPermissionIfNotExists(
          permissionOverwrites,
          guild.roles.everyone.id,
          undefined,
          [PermissionsBitField.Flags.Connect]
        )
      }

      if (creationChannel.view_role_id) {
        addPermissionIfNotExists(
          permissionOverwrites,
          creationChannel.view_role_id,
          [PermissionsBitField.Flags.ViewChannel],
          [PermissionsBitField.Flags.Connect]
        )
      }

      // Ensure creator has manage permissions
      addPermissionIfNotExists(
        permissionOverwrites,
        state.member!.id,
        [PermissionsBitField.Flags.ManageChannels]
      )

      // Ensure bot can manage the channel
      if (guild.members.me) {
        addPermissionIfNotExists(
          permissionOverwrites,
          guild.members.me.id,
          [
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.ManageChannels,
          ]
        )
      }

      const newChannel = await guild.channels.create({
        name: channelName,
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

  let channel = state.channel

  // If the channel is not in cache (e.g., if it was renamed), fetch it
  if (!channel) {
    try {
      const fetchedChannel = await state.guild.channels.fetch(state.channelId!)
      if (!fetchedChannel || !fetchedChannel.isVoiceBased()) {
        // Channel doesn't exist or is not a voice channel, clean up database
        await deleteCreatedVoiceChannel(state.channelId!)
        return
      }
      channel = fetchedChannel
    } catch (error) {
      // Channel no longer exists, clean up database
      logger.info(
        `Channel ${state.channelId} no longer exists, cleaning up database`
      )
      await deleteCreatedVoiceChannel(state.channelId!)
      return
    }
  }

  // Don't delete the channel if there are still users in it
  if (channel.members.size > 0) {
    return
  }

  try {
    // No members left in the channel, delete it
    await deleteCreatedVoiceChannel(state.channelId!)
    await channel.delete(`Last user left the dynamically created channel`)
    logger.info(`Deleted empty voice channel ${channel.name}`)
  } catch (error) {
    logger.error("Failed to delete voice channel:")
    logger.error(error)
  }
}
