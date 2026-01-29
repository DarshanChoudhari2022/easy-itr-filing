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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          client_name: string
          client_pan: string | null
          client_user_id: string
          created_at: string
          id: string
          notes: string | null
          professional_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          client_name: string
          client_pan?: string | null
          client_user_id: string
          created_at?: string
          id?: string
          notes?: string | null
          professional_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string
          client_pan?: string | null
          client_user_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          professional_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crypto_trades: {
        Row: {
          assessment_year: string
          buy_price: number
          created_at: string
          exchange: string
          gain_loss: number | null
          id: string
          metadata: Json | null
          quantity: number
          sell_price: number | null
          tds_paid: number | null
          token_name: string | null
          token_symbol: string
          trade_date: string
          trade_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assessment_year?: string
          buy_price: number
          created_at?: string
          exchange: string
          gain_loss?: number | null
          id?: string
          metadata?: Json | null
          quantity: number
          sell_price?: number | null
          tds_paid?: number | null
          token_name?: string | null
          token_symbol: string
          trade_date: string
          trade_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assessment_year?: string
          buy_price?: number
          created_at?: string
          exchange?: string
          gain_loss?: number | null
          id?: string
          metadata?: Json | null
          quantity?: number
          sell_price?: number | null
          tds_paid?: number | null
          token_name?: string | null
          token_symbol?: string
          trade_date?: string
          trade_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deductions: {
        Row: {
          amount: number
          assessment_year: string
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          proof_document_url: string | null
          section: Database["public"]["Enums"]["deduction_section"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          assessment_year?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          proof_document_url?: string | null
          section: Database["public"]["Enums"]["deduction_section"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          assessment_year?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          proof_document_url?: string | null
          section?: Database["public"]["Enums"]["deduction_section"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      income_sources: {
        Row: {
          amount: number
          assessment_year: string
          created_at: string
          description: string | null
          employer_name: string | null
          id: string
          metadata: Json | null
          source_type: Database["public"]["Enums"]["income_source_type"]
          tds_deducted: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          assessment_year?: string
          created_at?: string
          description?: string | null
          employer_name?: string | null
          id?: string
          metadata?: Json | null
          source_type: Database["public"]["Enums"]["income_source_type"]
          tds_deducted?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          assessment_year?: string
          created_at?: string
          description?: string | null
          employer_name?: string | null
          id?: string
          metadata?: Json | null
          source_type?: Database["public"]["Enums"]["income_source_type"]
          tds_deducted?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          aadhaar_last_four: string | null
          assessment_year: string | null
          created_at: string
          email: string | null
          filing_status: Database["public"]["Enums"]["filing_status"]
          full_name: string | null
          id: string
          pan_number: string | null
          phone: string | null
          suggested_itr_form: Database["public"]["Enums"]["itr_form"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aadhaar_last_four?: string | null
          assessment_year?: string | null
          created_at?: string
          email?: string | null
          filing_status?: Database["public"]["Enums"]["filing_status"]
          full_name?: string | null
          id?: string
          pan_number?: string | null
          phone?: string | null
          suggested_itr_form?: Database["public"]["Enums"]["itr_form"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aadhaar_last_four?: string | null
          assessment_year?: string | null
          created_at?: string
          email?: string | null
          filing_status?: Database["public"]["Enums"]["filing_status"]
          full_name?: string | null
          id?: string
          pan_number?: string | null
          phone?: string | null
          suggested_itr_form?: Database["public"]["Enums"]["itr_form"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tax_summaries: {
        Row: {
          assessment_year: string
          calculated_at: string | null
          created_at: string
          id: string
          suggested_itr_form: Database["public"]["Enums"]["itr_form"] | null
          suggested_regime: Database["public"]["Enums"]["tax_regime"] | null
          tax_new_regime: number | null
          tax_old_regime: number | null
          tax_payable: number | null
          tax_refund: number | null
          taxable_income_new: number | null
          taxable_income_old: number | null
          tds_total: number | null
          total_deductions: number | null
          total_income: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assessment_year?: string
          calculated_at?: string | null
          created_at?: string
          id?: string
          suggested_itr_form?: Database["public"]["Enums"]["itr_form"] | null
          suggested_regime?: Database["public"]["Enums"]["tax_regime"] | null
          tax_new_regime?: number | null
          tax_old_regime?: number | null
          tax_payable?: number | null
          tax_refund?: number | null
          taxable_income_new?: number | null
          taxable_income_old?: number | null
          tds_total?: number | null
          total_deductions?: number | null
          total_income?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assessment_year?: string
          calculated_at?: string | null
          created_at?: string
          id?: string
          suggested_itr_form?: Database["public"]["Enums"]["itr_form"] | null
          suggested_regime?: Database["public"]["Enums"]["tax_regime"] | null
          tax_new_regime?: number | null
          tax_old_regime?: number | null
          tax_payable?: number | null
          tax_refund?: number | null
          taxable_income_new?: number | null
          taxable_income_old?: number | null
          tds_total?: number | null
          total_deductions?: number | null
          total_income?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_user_data: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_professional_of_client: {
        Args: { _client_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "individual" | "professional" | "admin"
      deduction_section:
        | "section_80c"
        | "section_80d"
        | "section_80e"
        | "section_80g"
        | "section_80tta"
        | "section_80ttb"
        | "hra"
        | "lta"
        | "other"
      filing_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "processed"
        | "rejected"
      income_source_type:
        | "salary"
        | "house_property"
        | "capital_gains_equity"
        | "capital_gains_debt"
        | "capital_gains_property"
        | "business_professional"
        | "other_sources"
      itr_form: "ITR-1" | "ITR-2" | "ITR-3" | "ITR-4"
      tax_regime: "old" | "new"
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
      app_role: ["individual", "professional", "admin"],
      deduction_section: [
        "section_80c",
        "section_80d",
        "section_80e",
        "section_80g",
        "section_80tta",
        "section_80ttb",
        "hra",
        "lta",
        "other",
      ],
      filing_status: [
        "not_started",
        "in_progress",
        "submitted",
        "processed",
        "rejected",
      ],
      income_source_type: [
        "salary",
        "house_property",
        "capital_gains_equity",
        "capital_gains_debt",
        "capital_gains_property",
        "business_professional",
        "other_sources",
      ],
      itr_form: ["ITR-1", "ITR-2", "ITR-3", "ITR-4"],
      tax_regime: ["old", "new"],
    },
  },
} as const
