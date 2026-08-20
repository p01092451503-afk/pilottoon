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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      character_images: {
        Row: {
          character_id: string
          created_at: string
          id: string
          is_primary: boolean
          seq: number
          storage_path: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          seq?: number
          storage_path: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          seq?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_images_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          created_at: string
          id: string
          order_index: number
          project_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          project_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_results: {
        Row: {
          created_at: string
          generation_id: string
          height: number | null
          id: string
          seed: number | null
          seq: number
          source_url: string | null
          source_url_expires_at: string | null
          storage_path: string | null
          thumb_path: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          generation_id: string
          height?: number | null
          id?: string
          seed?: number | null
          seq?: number
          source_url?: string | null
          source_url_expires_at?: string | null
          storage_path?: string | null
          thumb_path?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          generation_id?: string
          height?: number | null
          id?: string
          seed?: number | null
          seq?: number
          source_url?: string | null
          source_url_expires_at?: string | null
          storage_path?: string | null
          thumb_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_results_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          api_model: string | null
          api_size: string | null
          aspect_ratio: string | null
          batch_count: number
          compiled_prompt: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          figure_map: Json
          final_prompt: string | null
          id: string
          mode: string
          options: Json
          panel_id: string | null
          prompt_edited: boolean
          raw_prompt: string | null
          raw_responses: Json
          reference_files: Json
          seed: number | null
          status: string
          tenant_id: string
          user_id: string | null
          user_memo: string | null
          warnings: Json
          work_label: string
        }
        Insert: {
          api_model?: string | null
          api_size?: string | null
          aspect_ratio?: string | null
          batch_count?: number
          compiled_prompt?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          figure_map?: Json
          final_prompt?: string | null
          id?: string
          mode?: string
          options?: Json
          panel_id?: string | null
          prompt_edited?: boolean
          raw_prompt?: string | null
          raw_responses?: Json
          reference_files?: Json
          seed?: number | null
          status?: string
          tenant_id: string
          user_id?: string | null
          user_memo?: string | null
          warnings?: Json
          work_label?: string
        }
        Update: {
          api_model?: string | null
          api_size?: string | null
          aspect_ratio?: string | null
          batch_count?: number
          compiled_prompt?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          figure_map?: Json
          final_prompt?: string | null
          id?: string
          mode?: string
          options?: Json
          panel_id?: string | null
          prompt_edited?: boolean
          raw_prompt?: string | null
          raw_responses?: Json
          reference_files?: Json
          seed?: number | null
          status?: string
          tenant_id?: string
          user_id?: string | null
          user_memo?: string | null
          warnings?: Json
          work_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "generations_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      panels: {
        Row: {
          caption: string | null
          chosen_result_id: string | null
          created_at: string
          episode_id: string
          generation_id: string | null
          id: string
          order_index: number
          status: string
        }
        Insert: {
          caption?: string | null
          chosen_result_id?: string | null
          created_at?: string
          episode_id: string
          generation_id?: string | null
          id?: string
          order_index?: number
          status?: string
        }
        Update: {
          caption?: string | null
          chosen_result_id?: string | null
          created_at?: string
          episode_id?: string
          generation_id?: string | null
          id?: string
          order_index?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "panels_chosen_result_id_fkey"
            columns: ["chosen_result_id"]
            isOneToOne: false
            referencedRelation: "generation_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panels_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panels_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      presets: {
        Row: {
          active: boolean
          created_at: string
          id: string
          item_id: string
          label_en: string | null
          label_ko: string
          level: number
          preview_path: string | null
          prompt_text: string | null
          sheet: string
          sort_order: number
          tenant_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          item_id: string
          label_en?: string | null
          label_ko: string
          level?: number
          preview_path?: string | null
          prompt_text?: string | null
          sheet: string
          sort_order?: number
          tenant_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          item_id?: string
          label_en?: string | null
          label_ko?: string
          level?: number
          preview_path?: string | null
          prompt_text?: string | null
          sheet?: string
          sort_order?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cast: {
        Row: {
          character_id: string
          project_id: string
          role_label: string | null
        }
        Insert: {
          character_id: string
          project_id: string
          role_label?: string | null
        }
        Update: {
          character_id?: string
          project_id?: string
          role_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_cast_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cast_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          est_api_cost: number | null
          est_storage_bytes: number | null
          generation_id: string | null
          id: string
          image_count: number
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          est_api_cost?: number | null
          est_storage_bytes?: number | null
          generation_id?: string | null
          id?: string
          image_count?: number
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          est_api_cost?: number | null
          est_storage_bytes?: number | null
          generation_id?: string | null
          id?: string
          image_count?: number
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      video_generations: {
        Row: {
          actual_duration_seconds: number | null
          actual_resolution: string | null
          api_model: string | null
          api_model_version: string | null
          aspect_ratio: string | null
          camera_fixed: boolean
          completed_at: string | null
          created_at: string
          duration_seconds: number
          error_message: string | null
          final_prompt: string
          id: string
          image_paths: Json
          mode: string
          moderation_details: Json
          moderation_status: string
          negative_prompt: string | null
          options: Json
          prompt_edited: boolean
          raw_prompt: string | null
          resolution: string | null
          seed: number | null
          status: string
          task_id: string | null
          tenant_id: string
          user_id: string
          work_label: string
        }
        Insert: {
          actual_duration_seconds?: number | null
          actual_resolution?: string | null
          api_model?: string | null
          api_model_version?: string | null
          aspect_ratio?: string | null
          camera_fixed?: boolean
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          error_message?: string | null
          final_prompt: string
          id?: string
          image_paths?: Json
          mode?: string
          moderation_details?: Json
          moderation_status?: string
          negative_prompt?: string | null
          options?: Json
          prompt_edited?: boolean
          raw_prompt?: string | null
          resolution?: string | null
          seed?: number | null
          status?: string
          task_id?: string | null
          tenant_id: string
          user_id: string
          work_label?: string
        }
        Update: {
          actual_duration_seconds?: number | null
          actual_resolution?: string | null
          api_model?: string | null
          api_model_version?: string | null
          aspect_ratio?: string | null
          camera_fixed?: boolean
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          error_message?: string | null
          final_prompt?: string
          id?: string
          image_paths?: Json
          mode?: string
          moderation_details?: Json
          moderation_status?: string
          negative_prompt?: string | null
          options?: Json
          prompt_edited?: boolean
          raw_prompt?: string | null
          resolution?: string | null
          seed?: number | null
          status?: string
          task_id?: string | null
          tenant_id?: string
          user_id?: string
          work_label?: string
        }
        Relationships: []
      }
      video_results: {
        Row: {
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          metadata: Json
          moderation_status: string
          poster_path: string | null
          seq: number
          source_url: string | null
          storage_path: string
          video_generation_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          moderation_status?: string
          poster_path?: string | null
          seq?: number
          source_url?: string | null
          storage_path: string
          video_generation_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          moderation_status?: string
          poster_path?: string | null
          seq?: number
          source_url?: string | null
          storage_path?: string
          video_generation_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_results_video_generation_id_fkey"
            columns: ["video_generation_id"]
            isOneToOne: false
            referencedRelation: "video_generations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
