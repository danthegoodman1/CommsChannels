export interface CreationChannel {
  id: string
  guild_id: string
  name: string
  required_role_id: string | null
  user_limit: number | null
  created_at: number
  updated_at: number
}

export interface CreatedVoiceChannel {
  id: string
  guild_id: string
  creator_id: string
  created_at: number
}
