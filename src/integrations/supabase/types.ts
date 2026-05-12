export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          app_version: string | null
          auth_user_id: string | null
          created_at: string
          device_id: string | null
          event_name: string
          game_id: string | null
          game_mode: string | null
          id: string
          local_user_id: string | null
          metadata: Json | null
          platform: string | null
          session_id: string | null
        }
        Insert: {
          app_version?: string | null
          auth_user_id?: string | null
          created_at?: string
          device_id?: string | null
          event_name: string
          game_id?: string | null
          game_mode?: string | null
          id?: string
          local_user_id?: string | null
          metadata?: Json | null
          platform?: string | null
          session_id?: string | null
        }
        Update: {
          app_version?: string | null
          auth_user_id?: string | null
          created_at?: string
          device_id?: string | null
          event_name?: string
          game_id?: string | null
          game_mode?: string | null
          id?: string
          local_user_id?: string | null
          metadata?: Json | null
          platform?: string | null
          session_id?: string | null
        }
        Relationships: []
      }
      analytics_sessions: {
        Row: {
          app_version: string | null
          device_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          last_seen_at: string
          platform: string | null
          started_at: string
        }
        Insert: {
          app_version?: string | null
          device_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id: string
          last_seen_at?: string
          platform?: string | null
          started_at?: string
        }
        Update: {
          app_version?: string | null
          device_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          platform?: string | null
          started_at?: string
        }
        Relationships: []
      }
      friend_match_results: {
        Row: {
          created_at: string
          game_id: string | null
          game_mode: string
          id: string
          player_1_id: string
          player_1_name: string
          player_1_score: number
          player_2_id: string
          player_2_name: string
          player_2_score: number
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          game_id?: string | null
          game_mode?: string
          id?: string
          player_1_id: string
          player_1_name: string
          player_1_score?: number
          player_2_id: string
          player_2_name: string
          player_2_score?: number
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string | null
          game_mode?: string
          id?: string
          player_1_id?: string
          player_1_name?: string
          player_1_score?: number
          player_2_id?: string
          player_2_name?: string
          player_2_score?: number
          winner_id?: string | null
        }
        Relationships: []
      }
      game_players: {
        Row: {
          game_id: string
          id: string
          joined_at: string
          last_active_at: string
          player_index: number
          player_name: string
          scores: Json
          session_id: string
        }
        Insert: {
          game_id: string
          id?: string
          joined_at?: string
          last_active_at?: string
          player_index: number
          player_name: string
          scores?: Json
          session_id: string
        }
        Update: {
          game_id?: string
          id?: string
          joined_at?: string
          last_active_at?: string
          player_index?: number
          player_name?: string
          scores?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          current_player_index: number
          dice: number[]
          forfeited_by: string | null
          game_code: string
          id: string
          is_rolling: boolean
          locked_dice: boolean[]
          max_players: number
          rolls_left: number
          round: number
          status: Database["public"]["Enums"]["game_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_player_index?: number
          dice?: number[]
          forfeited_by?: string | null
          game_code: string
          id?: string
          is_rolling?: boolean
          locked_dice?: boolean[]
          max_players?: number
          rolls_left?: number
          round?: number
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_player_index?: number
          dice?: number[]
          forfeited_by?: string | null
          game_code?: string
          id?: string
          is_rolling?: boolean
          locked_dice?: boolean[]
          max_players?: number
          rolls_left?: number
          round?: number
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          delivered: boolean
          game_id: string
          id: string
          kind: string
          metadata: Json | null
          opened_at: string | null
          player_index: number | null
          recipient_device_id: string | null
          recipient_session_id: string
          round: number | null
          sent_at: string
        }
        Insert: {
          delivered?: boolean
          game_id: string
          id?: string
          kind: string
          metadata?: Json | null
          opened_at?: string | null
          player_index?: number | null
          recipient_device_id?: string | null
          recipient_session_id: string
          round?: number | null
          sent_at?: string
        }
        Update: {
          delivered?: boolean
          game_id?: string
          id?: string
          kind?: string
          metadata?: Json | null
          opened_at?: string | null
          player_index?: number | null
          recipient_device_id?: string | null
          recipient_session_id?: string
          round?: number | null
          sent_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          device_id: string
          reminder_notifications: boolean
          turn_notifications: boolean
          updated_at: string
        }
        Insert: {
          device_id: string
          reminder_notifications?: boolean
          turn_notifications?: boolean
          updated_at?: string
        }
        Update: {
          device_id?: string
          reminder_notifications?: boolean
          turn_notifications?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_id: string
          enabled: boolean
          id: string
          platform: string
          session_id: string | null
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id: string
          enabled?: boolean
          id?: string
          platform: string
          session_id?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          enabled?: boolean
          id?: string
          platform?: string
          session_id?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_game_with_code: {
        Args: { p_player_name: string; p_session_id: string }
        Returns: Json
      }
      heartbeat: {
        Args: { p_game_id: string; p_session_id: string }
        Returns: undefined
      }
      join_game: {
        Args: {
          p_game_code: string
          p_player_name: string
          p_session_id: string
        }
        Returns: Json
      }
      perform_forfeit: {
        Args: { p_game_id: string; p_session_id: string }
        Returns: Json
      }
      perform_roll_dice: {
        Args: { p_game_id: string; p_session_id: string }
        Returns: Json
      }
      perform_start_game: {
        Args: { p_game_id: string; p_session_id: string }
        Returns: Json
      }
      perform_submit_score: {
        Args: { p_category_id: string; p_game_id: string; p_session_id: string }
        Returns: Json
      }
      perform_toggle_lock: {
        Args: { p_dice_index: number; p_game_id: string; p_session_id: string }
        Returns: Json
      }
      skip_inactive_turn: {
        Args: { p_game_id: string; p_timeout_seconds?: number }
        Returns: Json
      }
      validate_game_session: {
        Args: { p_game_id: string; p_session_id: string }
        Returns: Json
      }
    }
    Enums: {
      game_status: "waiting" | "playing" | "finished"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      game_status: ["waiting", "playing", "finished"],
    },
  },
} as const
