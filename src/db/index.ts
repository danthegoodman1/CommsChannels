import pkg, { PoolClient } from "pg"
const { Pool } = pkg
import { logger } from "../logger/index.js"
import { CreationChannel, CreatedVoiceChannel } from "./types.js"
import {
  ChannelType,
  PermissionsBitField,
  OverwriteResolvable,
} from "discord.js"

// Initialize PostgreSQL connection pool
export const pool = new Pool({
  connectionString: process.env.PG_DSN,
  // Optional: Configure pool settings
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // how long to wait for a connection
})

// Ensure the pool logs errors
pool.on("error", (err) => {
  logger.error("Unexpected error on idle PostgreSQL client", err)
  process.exit(-1)
})

// Ensure the tables exist
export async function initializeDatabase() {
  logger.info("Initializing database...")
  const client = await pool.connect()

  try {
    // Start a transaction
    await client.query("BEGIN")

    // Creation channels table
    await client.query(`
      CREATE TABLE IF NOT EXISTS creation_channels (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        required_role_id TEXT,
        join_role_id TEXT,
        user_limit INTEGER,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)

    // Created voice channels table (for tracking channels created by users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS created_voice_channels (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `)

    // Commit the transaction
    await client.query("COMMIT")
    logger.info("Database initialization complete")
  } catch (error) {
    // If anything fails, roll back the transaction
    await client.query("ROLLBACK")
    logger.error("Database initialization failed:", error)
    throw error
  } finally {
    // Release the client back to the pool
    client.release()
  }
}

// Creation channels operations
export async function getCreationChannels(
  guildId: string
): Promise<CreationChannel[]> {
  const result = await pool.query(
    "SELECT * FROM creation_channels WHERE guild_id = $1",
    [guildId]
  )
  return result.rows
}

export async function getCreationChannelById(
  channelId: string
): Promise<CreationChannel | undefined> {
  const result = await pool.query(
    "SELECT * FROM creation_channels WHERE id = $1",
    [channelId]
  )
  return result.rows.length > 0 ? result.rows[0] : undefined
}

export async function createCreationChannel(
  channelId: string,
  guildId: string,
  name: string,
  requiredRoleId: string | null,
  joinRoleId: string | null,
  userLimit: number | null
) {
  const now = Date.now()
  await pool.query(
    `
    INSERT INTO creation_channels (id, guild_id, name, required_role_id, join_role_id, user_limit, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [channelId, guildId, name, requiredRoleId, joinRoleId, userLimit, now, now]
  )
}

export async function updateCreationChannel(
  channelId: string,
  name: string,
  requiredRoleId: string | null,
  joinRoleId: string | null,
  userLimit: number | null
) {
  const now = Date.now()
  await pool.query(
    `UPDATE creation_channels 
     SET name = $1, required_role_id = $2, join_role_id = $3, user_limit = $4, updated_at = $5
     WHERE id = $6`,
    [name, requiredRoleId, joinRoleId, userLimit, now, channelId]
  )
}

export async function deleteCreationChannel(channelId: string) {
  await pool.query("DELETE FROM creation_channels WHERE id = $1", [channelId])
}

// Created voice channels operations
export async function trackCreatedVoiceChannel(
  channelId: string,
  guildId: string,
  creatorId: string
) {
  const now = Date.now()
  await pool.query(
    `
    INSERT INTO created_voice_channels (id, guild_id, creator_id, created_at)
    VALUES ($1, $2, $3, $4)
    `,
    [channelId, guildId, creatorId, now]
  )
}

export async function getCreatedVoiceChannel(
  channelId: string
): Promise<CreatedVoiceChannel | undefined> {
  const result = await pool.query(
    "SELECT * FROM created_voice_channels WHERE id = $1",
    [channelId]
  )
  return result.rows.length > 0 ? result.rows[0] : undefined
}

export async function deleteCreatedVoiceChannel(channelId: string) {
  await pool.query("DELETE FROM created_voice_channels WHERE id = $1", [
    channelId,
  ])
}

// Helper function to create or update a creation channel without requiring a specific channel ID
export async function createOrUpdateCreationChannel(
  guildId: string,
  name: string,
  requiredRoleId: string | null | undefined,
  joinRoleId: string | null | undefined,
  userLimit: number | null
) {
  // Check if a creation channel with this name already exists in the guild
  const existingChannels = await getCreationChannels(guildId)
  const existingChannel = existingChannels.find((ch) => ch.name === name)

  if (existingChannel) {
    // Update the existing channel
    await updateCreationChannel(
      existingChannel.id,
      name,
      requiredRoleId ?? null,
      joinRoleId ?? null,
      userLimit
    )

    // Also update the Discord channel properties (specifically user limit and permissions)
    try {
      const guild = await (
        await import("../index.js")
      ).client.guilds.fetch(guildId)
      const channel = await guild.channels.fetch(existingChannel.id)
      if (channel && channel.isVoiceBased()) {
        // Update user limit
        await channel.setUserLimit(userLimit ?? 0) // 0 means unlimited

        // Update permissions if a role is specified
        if (requiredRoleId || joinRoleId) {
          // Set up permissions - deny Connect for @everyone, allow for the specific role
          const permissionOverwrites: OverwriteResolvable[] = [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.Connect],
            },
          ]

          // If joinRoleId is specified, it overrides requiredRoleId for connection permissions
          const roleToUse = joinRoleId || requiredRoleId

          permissionOverwrites.push({
            id: roleToUse!,
            allow: [PermissionsBitField.Flags.Connect],
          })

          // Don't forget to allow the bot to connect
          if (guild.members.me) {
            permissionOverwrites.push({
              id: guild.members.me.id,
              allow: [
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.ManageChannels,
              ],
            })
          }

          await channel.permissionOverwrites.set(permissionOverwrites)
        } else {
          // If no role requirement, reset to default (everyone can connect)
          await channel.permissionOverwrites.set([])
        }
      }
    } catch (error) {
      logger.error("Failed to update Discord channel properties:")
      logger.error(error)
      // Continue anyway since we've updated the database
    }

    return existingChannel
  } else {
    try {
      // Create a new voice channel in Discord
      const guild = await (
        await import("../index.js")
      ).client.guilds.fetch(guildId)

      // Check if bot has necessary permissions
      const botMember = guild.members.me
      if (!botMember?.permissions.has("ManageChannels")) {
        const errorMessage = `Bot doesn't have the ManageChannels permission in guild ${guildId}. Please update the bot's role permissions.`
        logger.error(errorMessage)
        throw new Error(errorMessage)
      }

      // Set up permission overwrites if a role is specified
      let permissionOverwrites: OverwriteResolvable[] = []

      if (requiredRoleId || joinRoleId) {
        permissionOverwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.Connect],
          },
        ]

        // If joinRoleId is specified, it overrides requiredRoleId for connection permissions
        const roleToUse = joinRoleId || requiredRoleId

        permissionOverwrites.push({
          id: roleToUse!,
          allow: [PermissionsBitField.Flags.Connect],
        })

        // Don't forget to allow the bot to connect
        if (guild.members.me) {
          permissionOverwrites.push({
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.ManageChannels,
            ],
          })
        }
      }

      try {
        const newChannel = await guild.channels.create({
          name,
          type: ChannelType.GuildVoice,
          reason: "Creating comms channel creator",
          userLimit: userLimit ?? 0, // 0 means unlimited
          permissionOverwrites: permissionOverwrites,
        })

        // Register it as a creation channel
        await createCreationChannel(
          newChannel.id,
          guildId,
          name,
          requiredRoleId ?? null,
          joinRoleId ?? null,
          userLimit
        )

        return {
          id: newChannel.id,
          guild_id: guildId,
          name,
          required_role_id: requiredRoleId,
          join_role_id: joinRoleId,
          user_limit: userLimit,
          created_at: Date.now(),
          updated_at: Date.now(),
        }
      } catch (channelError) {
        const errorStr = String(channelError)
        if (errorStr.includes("Missing Permissions")) {
          const errorMessage = `Missing permissions to create a voice channel. Make sure the bot has the "Manage Channels" permission and appropriate category permissions.`
          logger.error(errorMessage)
          throw new Error(errorMessage)
        }
        throw channelError
      }
    } catch (error) {
      if (!String(error).includes("Missing permissions")) {
        logger.error("Error creating voice channel:")
        logger.error(error)
      }
      throw error
    }
  }
}
