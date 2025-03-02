import Database from "better-sqlite3"
import { logger } from "../logger/index.js"
import path from "path"
import { fileURLToPath } from "url"
import { CreationChannel, CreatedVoiceChannel } from "./types.js"
import fs from "fs"
import {
  ChannelType,
  PermissionsBitField,
  OverwriteResolvable,
} from "discord.js"

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Database path
const dbDir = path.join(__dirname, "../../data")
const dbPath = path.join(dbDir, "database.sqlite")

// Ensure the data directory exists
if (!fs.existsSync(dbDir)) {
  logger.info(`Creating data directory at ${dbDir}`)
  fs.mkdirSync(dbDir, { recursive: true })
}

// Initialize the database
export const db = new Database(dbPath)

// Ensure the tables exist
export function initializeDatabase() {
  logger.info("Initializing database...")

  // Creation channels table
  db.exec(`
    CREATE TABLE IF NOT EXISTS creation_channels (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      required_role_id TEXT,
      user_limit INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Created voice channels table (for tracking channels created by users)
  db.exec(`
    CREATE TABLE IF NOT EXISTS created_voice_channels (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  logger.info("Database initialization complete")
}

// Creation channels operations
export function getCreationChannels(guildId: string): CreationChannel[] {
  return db
    .prepare("SELECT * FROM creation_channels WHERE guild_id = ?")
    .all(guildId) as CreationChannel[]
}

export function getCreationChannelById(
  channelId: string
): CreationChannel | undefined {
  return db
    .prepare("SELECT * FROM creation_channels WHERE id = ?")
    .get(channelId) as CreationChannel | undefined
}

export function createCreationChannel(
  channelId: string,
  guildId: string,
  name: string,
  requiredRoleId: string | null,
  userLimit: number | null
) {
  const now = Date.now()
  db.prepare(
    `
    INSERT INTO creation_channels (id, guild_id, name, required_role_id, user_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(channelId, guildId, name, requiredRoleId, userLimit, now, now)
}

export function updateCreationChannel(
  channelId: string,
  name: string,
  requiredRoleId: string | null,
  userLimit: number | null
) {
  const now = Date.now()
  db.prepare(
    `
    UPDATE creation_channels 
    SET name = ?, required_role_id = ?, user_limit = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(name, requiredRoleId, userLimit, now, channelId)
}

export function deleteCreationChannel(channelId: string) {
  db.prepare("DELETE FROM creation_channels WHERE id = ?").run(channelId)
}

// Created voice channels operations
export function trackCreatedVoiceChannel(
  channelId: string,
  guildId: string,
  creatorId: string
) {
  const now = Date.now()
  db.prepare(
    `
    INSERT INTO created_voice_channels (id, guild_id, creator_id, created_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(channelId, guildId, creatorId, now)
}

export function getCreatedVoiceChannel(
  channelId: string
): CreatedVoiceChannel | undefined {
  return db
    .prepare("SELECT * FROM created_voice_channels WHERE id = ?")
    .get(channelId) as CreatedVoiceChannel | undefined
}

export function deleteCreatedVoiceChannel(channelId: string) {
  db.prepare("DELETE FROM created_voice_channels WHERE id = ?").run(channelId)
}

// Helper function to create or update a creation channel without requiring a specific channel ID
export async function createOrUpdateCreationChannel(
  guildId: string,
  name: string,
  requiredRoleId: string | null | undefined,
  userLimit: number | null
) {
  // Check if a creation channel with this name already exists in the guild
  const existingChannels = getCreationChannels(guildId)
  const existingChannel = existingChannels.find((ch) => ch.name === name)

  if (existingChannel) {
    // Update the existing channel
    updateCreationChannel(
      existingChannel.id,
      name,
      requiredRoleId ?? null,
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
        if (requiredRoleId) {
          // Set up permissions - deny Connect for @everyone, allow for the specific role
          const permissionOverwrites: OverwriteResolvable[] = [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.Connect],
            },
            {
              id: requiredRoleId,
              allow: [PermissionsBitField.Flags.Connect],
            },
          ]

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

      if (requiredRoleId) {
        permissionOverwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.Connect],
          },
          {
            id: requiredRoleId,
            allow: [PermissionsBitField.Flags.Connect],
          },
        ]

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
        createCreationChannel(
          newChannel.id,
          guildId,
          name,
          requiredRoleId ?? null,
          userLimit
        )

        return {
          id: newChannel.id,
          guild_id: guildId,
          name,
          required_role_id: requiredRoleId,
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
