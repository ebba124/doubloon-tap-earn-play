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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_roles: {
        Row: {
          created_at: string
          created_by: number | null
          role: Database["public"]["Enums"]["admin_role"]
          telegram_id: number
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          role: Database["public"]["Enums"]["admin_role"]
          telegram_id: number
        }
        Update: {
          created_at?: string
          created_by?: number | null
          role?: Database["public"]["Enums"]["admin_role"]
          telegram_id?: number
        }
        Relationships: []
      }
      achievements: {
        Row: {
          achievement_id: string
          unlocked_at: string
          user_id: number
        }
        Insert: {
          achievement_id: string
          unlocked_at?: string
          user_id: number
        }
        Update: {
          achievement_id?: string
          unlocked_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          delta: number | null
          id: number
          meta: Json | null
          user_id: number | null
        }
        Insert: {
          action: string
          created_at?: string
          delta?: number | null
          id?: number
          meta?: Json | null
          user_id?: number | null
        }
        Update: {
          action?: string
          created_at?: string
          delta?: number | null
          id?: number
          meta?: Json | null
          user_id?: number | null
        }
        Relationships: []
      }
      economy_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: number | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: number | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: number | null
          value?: Json
        }
        Relationships: []
      }
      idempotency: {
        Row: {
          created_at: string
          key: string
          user_id: number
        }
        Insert: {
          created_at?: string
          key: string
          user_id: number
        }
        Update: {
          created_at?: string
          key?: string
          user_id?: number
        }
        Relationships: []
      }
      pending_referrals: {
        Row: {
          created_at: string
          referred_id: number
          referrer_id: number
        }
        Insert: {
          created_at?: string
          referred_id: number
          referrer_id: number
        }
        Update: {
          created_at?: string
          referred_id?: number
          referrer_id?: number
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: number
          referred_id: number
          referrer_id: number
          reward_paid: boolean
        }
        Insert: {
          created_at?: string
          id?: number
          referred_id: number
          referrer_id: number
          reward_paid?: boolean
        }
        Update: {
          created_at?: string
          id?: number
          referred_id?: number
          referrer_id?: number
          reward_paid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks_done: {
        Row: {
          completed_at: string
          task_id: string
          user_id: number
        }
        Insert: {
          completed_at?: string
          task_id: string
          user_id: number
        }
        Update: {
          completed_at?: string
          task_id?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_done_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          balance: number
          created_at: string
          energy: number
          energy_limit_level: number
          energy_max: number
          energy_regen_per_sec: number
          first_name: string | null
          gems: number
          id: number
          is_vip: boolean
          language_code: string | null
          last_daily_claim: string | null
          last_energy_update: string
          last_name: string | null
          level: number
          longest_streak: number
          multitap_level: number
          photo_url: string | null
          referred_by: number | null
          streak_day: number
          streak_freezes: number
          tap_multiplier_permanent: number
          tap_value: number
          total_taps: number
          username: string | null
          xp: number
        }
        Insert: {
          balance?: number
          created_at?: string
          energy?: number
          energy_limit_level?: number
          energy_max?: number
          energy_regen_per_sec?: number
          first_name?: string | null
          gems?: number
          id: number
          is_vip?: boolean
          language_code?: string | null
          last_daily_claim?: string | null
          last_energy_update?: string
          last_name?: string | null
          level?: number
          longest_streak?: number
          multitap_level?: number
          photo_url?: string | null
          referred_by?: number | null
          streak_day?: number
          streak_freezes?: number
          tap_multiplier_permanent?: number
          tap_value?: number
          total_taps?: number
          username?: string | null
          xp?: number
        }
        Update: {
          balance?: number
          created_at?: string
          energy?: number
          energy_limit_level?: number
          energy_max?: number
          energy_regen_per_sec?: number
          first_name?: string | null
          gems?: number
          id?: number
          is_vip?: boolean
          language_code?: string | null
          last_daily_claim?: string | null
          last_energy_update?: string
          last_name?: string | null
          level?: number
          longest_streak?: number
          multitap_level?: number
          photo_url?: string | null
          referred_by?: number | null
          streak_day?: number
          streak_freezes?: number
          tap_multiplier_permanent?: number
          tap_value?: number
          total_taps?: number
          username?: string | null
          xp?: number
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          address: string
          amount_dbl: number
          amount_usdt: number
          created_at: string
          id: number
          method: string
          reviewed_at: string | null
          reviewer_note: string | null
          status: string
          user_id: number
        }
        Insert: {
          address: string
          amount_dbl: number
          amount_usdt: number
          created_at?: string
          id?: number
          method: string
          reviewed_at?: string | null
          reviewer_note?: string | null
          status?: string
          user_id: number
        }
        Update: {
          address?: string
          amount_dbl?: number
          amount_usdt?: number
          created_at?: string
          id?: number
          method?: string
          reviewed_at?: string | null
          reviewer_note?: string | null
          status?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      admin_role: "superadmin" | "withdraw_reviewer" | "economy_editor"
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
      admin_role: ["superadmin", "withdraw_reviewer", "economy_editor"],
    },
  },
} as const
