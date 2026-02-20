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
      foreign_assets: {
        Row: {
          id: string
          user_id: string
          asset_type: string
          country_code: string
          entity_name: string
          account_number: string | null
          peak_value_inr: number | null
          closing_balance_inr: number | null
          acquisition_date: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          asset_type: string
          country_code: string
          entity_name: string
          account_number?: string | null
          peak_value_inr?: number | null
          closing_balance_inr?: number | null
          acquisition_date?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          asset_type?: string
          country_code?: string
          entity_name?: string
          account_number?: string | null
          peak_value_inr?: number | null
          closing_balance_inr?: number | null
          acquisition_date?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      gst_invoices: {
        Row: {
          id: string
          user_id: string
          invoice_number: string
          invoice_date: string
          vendor_name: string
          vendor_gstin: string | null
          taxable_value: number
          igst: number | null
          cgst: number | null
          sgst: number | null
          total_value: number
          is_purchase: boolean | null
          match_status: string | null
          confidence_score: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          invoice_number: string
          invoice_date: string
          vendor_name: string
          vendor_gstin?: string | null
          taxable_value?: number
          igst?: number | null
          cgst?: number | null
          sgst?: number | null
          total_value?: number
          is_purchase?: boolean | null
          match_status?: string | null
          confidence_score?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          invoice_number?: string
          invoice_date?: string
          vendor_name?: string
          vendor_gstin?: string | null
          taxable_value?: number
          igst?: number | null
          cgst?: number | null
          sgst?: number | null
          total_value?: number
          is_purchase?: boolean | null
          match_status?: string | null
          confidence_score?: number | null
          created_at?: string
        }
        Relationships: []
      }
      foreign_income: {
        Row: {
          id: string
          user_id: string
          income_type: string
          country_code: string
          gross_income_fcy: number
          tax_paid_fcy: number | null
          conversion_rate: number
          is_dtaa_relief_claimed: boolean | null
          dtaa_article: string | null
          section_relief: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          income_type: string
          country_code: string
          gross_income_fcy: number
          tax_paid_fcy?: number | null
          conversion_rate: number
          is_dtaa_relief_claimed?: boolean | null
          dtaa_article?: string | null
          section_relief?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          income_type?: string
          country_code?: string
          gross_income_fcy?: number
          tax_paid_fcy?: number | null
          conversion_rate?: number
          is_dtaa_relief_claimed?: boolean | null
          dtaa_article?: string | null
          section_relief?: string | null
          created_at?: string
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
      ais_records: {
        Row: {
          id: string
          user_id: string
          category: string
          reported_value: number
          source_name: string | null
          status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category: string
          reported_value: number
          source_name?: string | null
          status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category?: string
          reported_value?: number
          source_name?: string | null
          status?: string | null
          created_at?: string
        }
        Relationships: []
      }
      family_groups: {
        Row: {
          id: string
          head_user_id: string
          member_user_id: string
          relation: string | null
          access_level: string | null
        }
        Insert: {
          id?: string
          head_user_id: string
          member_user_id: string
          relation?: string | null
          access_level?: string | null
        }
        Update: {
          id?: string
          head_user_id?: string
          member_user_id?: string
          relation?: string | null
          access_level?: string | null
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
      crypto_inventory_lots: {
        Row: {
          id: string
          user_id: string
          token_symbol: string
          remaining_quantity: number
          purchase_price_inr: number
          purchase_date: string
          exchange: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token_symbol: string
          remaining_quantity: number
          purchase_price_inr: number
          purchase_date: string
          exchange?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token_symbol?: string
          remaining_quantity?: number
          purchase_price_inr?: number
          purchase_date?: string
          exchange?: string | null
          created_at?: string
        }
        Relationships: []
      }
      raw_transactions: {
        Row: {
          id: string
          user_id: string
          source: string
          exchange: string
          external_id: string | null
          content_hash: string
          raw_payload: Json
          sync_session_id: string
          ingested_at: string
        }
        Insert: {
          id?: string
          user_id: string
          source: string
          exchange?: string
          external_id?: string | null
          content_hash: string
          raw_payload: Json
          sync_session_id: string
          ingested_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          source?: string
          exchange?: string
          external_id?: string | null
          content_hash?: string
          raw_payload?: Json
          sync_session_id?: string
          ingested_at?: string
        }
        Relationships: []
      }
      normalized_transactions: {
        Row: {
          id: string
          user_id: string
          raw_transaction_id: string | null
          external_id: string
          exchange: string
          transaction_type: string
          event_class: string
          is_taxable_event: boolean
          asset_symbol: string
          quote_asset: string
          pair: string
          quantity: number
          price_per_unit: number
          price_inr: number
          gross_amount_quote: number
          gross_amount_inr: number
          fee_amount: number | null
          fee_asset: string | null
          fee_inr: number | null
          tds_amount: number | null
          tds_rate: number | null
          trade_timestamp: string
          financial_year: string
          assessment_year: string
          source: string
          source_priority: number
          content_hash: string
          description: string | null
          order_id: string | null
          tx_hash: string | null
          counter_asset: string | null
          counter_quantity: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          raw_transaction_id?: string | null
          external_id: string
          exchange?: string
          transaction_type: string
          event_class: string
          is_taxable_event?: boolean
          asset_symbol: string
          quote_asset?: string
          pair: string
          quantity: number
          price_per_unit: number
          price_inr: number
          gross_amount_quote: number
          gross_amount_inr: number
          fee_amount?: number | null
          fee_asset?: string | null
          fee_inr?: number | null
          tds_amount?: number | null
          tds_rate?: number | null
          trade_timestamp: string
          financial_year: string
          assessment_year: string
          source: string
          source_priority?: number
          content_hash: string
          description?: string | null
          order_id?: string | null
          tx_hash?: string | null
          counter_asset?: string | null
          counter_quantity?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          raw_transaction_id?: string | null
          external_id?: string
          exchange?: string
          transaction_type?: string
          event_class?: string
          is_taxable_event?: boolean
          asset_symbol?: string
          quote_asset?: string
          pair?: string
          quantity?: number
          price_per_unit?: number
          price_inr?: number
          gross_amount_quote?: number
          gross_amount_inr?: number
          fee_amount?: number | null
          fee_asset?: string | null
          fee_inr?: number | null
          tds_amount?: number | null
          tds_rate?: number | null
          trade_timestamp?: string
          financial_year?: string
          assessment_year?: string
          source?: string
          source_priority?: number
          content_hash?: string
          description?: string | null
          order_id?: string | null
          tx_hash?: string | null
          counter_asset?: string | null
          counter_quantity?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_lots: {
        Row: {
          id: string
          user_id: string
          computation_id: string
          lot_id: string
          buy_transaction_id: string
          asset_symbol: string
          original_quantity: number
          remaining_quantity: number
          is_fully_consumed: boolean
          cost_basis_per_unit: number
          total_cost_inr: number
          acquisition_date: string
          acquisition_type: string
          financial_year: string
          exchange: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          computation_id: string
          lot_id: string
          buy_transaction_id: string
          asset_symbol: string
          original_quantity: number
          remaining_quantity: number
          is_fully_consumed?: boolean
          cost_basis_per_unit: number
          total_cost_inr: number
          acquisition_date: string
          acquisition_type: string
          financial_year: string
          exchange?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          computation_id?: string
          lot_id?: string
          buy_transaction_id?: string
          asset_symbol?: string
          original_quantity?: number
          remaining_quantity?: number
          is_fully_consumed?: boolean
          cost_basis_per_unit?: number
          total_cost_inr?: number
          acquisition_date?: string
          acquisition_type?: string
          financial_year?: string
          exchange?: string
          created_at?: string
        }
        Relationships: []
      }
      disposal_events: {
        Row: {
          id: string
          user_id: string
          computation_id: string
          sell_transaction_id: string
          buy_lot_id: string
          asset_symbol: string
          matched_quantity: number
          buy_price_per_unit: number
          sell_price_per_unit: number
          cost_of_acquisition: number
          sale_consideration: number
          gain_loss: number
          buy_date: string
          sell_date: string
          holding_days: number
          accounting_method: string
          financial_year: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          computation_id: string
          sell_transaction_id: string
          buy_lot_id: string
          asset_symbol: string
          matched_quantity: number
          buy_price_per_unit: number
          sell_price_per_unit: number
          cost_of_acquisition: number
          sale_consideration: number
          gain_loss: number
          buy_date: string
          sell_date: string
          holding_days: number
          accounting_method?: string
          financial_year: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          computation_id?: string
          sell_transaction_id?: string
          buy_lot_id?: string
          asset_symbol?: string
          matched_quantity?: number
          buy_price_per_unit?: number
          sell_price_per_unit?: number
          cost_of_acquisition?: number
          sale_consideration?: number
          gain_loss?: number
          buy_date?: string
          sell_date?: string
          holding_days?: number
          accounting_method?: string
          financial_year?: string
          created_at?: string
        }
        Relationships: []
      }
      other_income_events: {
        Row: {
          id: string
          user_id: string
          computation_id: string
          transaction_id: string
          income_type: string
          asset_symbol: string
          quantity: number
          price_inr_at_receipt: number
          gross_value_inr: number
          receipt_date: string
          financial_year: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          computation_id: string
          transaction_id: string
          income_type: string
          asset_symbol: string
          quantity: number
          price_inr_at_receipt: number
          gross_value_inr: number
          receipt_date: string
          financial_year: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          computation_id?: string
          transaction_id?: string
          income_type?: string
          asset_symbol?: string
          quantity?: number
          price_inr_at_receipt?: number
          gross_value_inr?: number
          receipt_date?: string
          financial_year?: string
          created_at?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          id: string
          user_id: string
          sync_type: string
          exchange: string
          status: string
          total_records_fetched: number | null
          new_records_added: number | null
          duplicate_records: number | null
          error_records: number | null
          earliest_tx_date: string | null
          latest_tx_date: string | null
          has_data_gaps: boolean | null
          gap_details: Json | null
          last_from_id: string | null
          last_timestamp: number | null
          started_at: string
          completed_at: string | null
          error_message: string | null
          warnings: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          sync_type: string
          exchange?: string
          status?: string
          total_records_fetched?: number | null
          new_records_added?: number | null
          duplicate_records?: number | null
          error_records?: number | null
          earliest_tx_date?: string | null
          latest_tx_date?: string | null
          has_data_gaps?: boolean | null
          gap_details?: Json | null
          last_from_id?: string | null
          last_timestamp?: number | null
          started_at?: string
          completed_at?: string | null
          error_message?: string | null
          warnings?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          sync_type?: string
          exchange?: string
          status?: string
          total_records_fetched?: number | null
          new_records_added?: number | null
          duplicate_records?: number | null
          error_records?: number | null
          earliest_tx_date?: string | null
          latest_tx_date?: string | null
          has_data_gaps?: boolean | null
          gap_details?: Json | null
          last_from_id?: string | null
          last_timestamp?: number | null
          started_at?: string
          completed_at?: string | null
          error_message?: string | null
          warnings?: string[] | null
          created_at?: string
        }
        Relationships: []
      }
      reconciliation_logs: {
        Row: {
          id: string
          user_id: string
          computation_id: string
          financial_year: string
          recon_type: string
          expected_value: number | null
          computed_value: number | null
          discrepancy: number | null
          discrepancy_pct: number | null
          status: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          computation_id: string
          financial_year: string
          recon_type: string
          expected_value?: number | null
          computed_value?: number | null
          discrepancy?: number | null
          discrepancy_pct?: number | null
          status: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          computation_id?: string
          financial_year?: string
          recon_type?: string
          expected_value?: number | null
          computed_value?: number | null
          discrepancy?: number | null
          discrepancy_pct?: number | null
          status?: string
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          organization_id: string | null
          user_id: string
          action: string
          severity: string | null
          metadata: Json | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          user_id: string
          action: string
          severity?: string | null
          metadata?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          user_id?: string
          action?: string
          severity?: string | null
          metadata?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      filing_steps_state: {
        Row: {
          user_id: string
          current_step: string | null
          completed_steps: string[] | null
          answers: Json | null
          updated_at: string | null
        }
        Insert: {
          user_id: string
          current_step?: string | null
          completed_steps?: string[] | null
          answers?: Json | null
          updated_at?: string | null
        }
        Update: {
          user_id?: string
          current_step?: string | null
          completed_steps?: string[] | null
          answers?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tax_documents: {
        Row: {
          id: string
          user_id: string
          document_type: string
          file_name: string
          file_url: string
          assessment_year: string | null
          category: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_type: string
          file_name: string
          file_url: string
          assessment_year?: string | null
          category?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_type?: string
          file_name?: string
          file_url?: string
          assessment_year?: string | null
          category?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      advance_tax_payments: {
        Row: {
          id: string
          user_id: string
          installment_number: number
          amount_paid: number
          payment_date: string
          challan_number: string | null
          bsr_code: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          installment_number: number
          amount_paid: number
          payment_date: string
          challan_number?: string | null
          bsr_code?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          installment_number?: number
          amount_paid?: number
          payment_date?: string
          challan_number?: string | null
          bsr_code?: string | null
          created_at?: string
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
