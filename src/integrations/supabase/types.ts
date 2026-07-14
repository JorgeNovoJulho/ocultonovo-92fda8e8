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
      ab_assignments: {
        Row: {
          assigned_at: string
          conversion_value: number | null
          converted_at: string | null
          experiment_id: string
          id: string
          metadata: Json | null
          session_id: string | null
          user_id: string | null
          variant_id: string
        }
        Insert: {
          assigned_at?: string
          conversion_value?: number | null
          converted_at?: string | null
          experiment_id: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          user_id?: string | null
          variant_id: string
        }
        Update: {
          assigned_at?: string
          conversion_value?: number | null
          converted_at?: string | null
          experiment_id?: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          user_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_experiment_results"
            referencedColumns: ["experiment_id"]
          },
          {
            foreignKeyName: "ab_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_experiment_results"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "ab_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_conversions: {
        Row: {
          assignment_id: string
          conversion_type: string
          created_at: string
          experiment_id: string
          id: string
          metadata: Json | null
          value: number | null
          variant_id: string
        }
        Insert: {
          assignment_id: string
          conversion_type: string
          created_at?: string
          experiment_id: string
          id?: string
          metadata?: Json | null
          value?: number | null
          variant_id: string
        }
        Update: {
          assignment_id?: string
          conversion_type?: string
          created_at?: string
          experiment_id?: string
          id?: string
          metadata?: Json | null
          value?: number | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_conversions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "ab_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_conversions_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_experiment_results"
            referencedColumns: ["experiment_id"]
          },
          {
            foreignKeyName: "ab_conversions_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_conversions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_experiment_results"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "ab_conversions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_experiments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          hypothesis: string | null
          id: string
          metric_key: string
          name: string
          start_date: string | null
          statistical_significance: number | null
          status: string
          target_sample_size: number | null
          traffic_percentage: number
          updated_at: string
          winner_variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          hypothesis?: string | null
          id?: string
          metric_key: string
          name: string
          start_date?: string | null
          statistical_significance?: number | null
          status?: string
          target_sample_size?: number | null
          traffic_percentage?: number
          updated_at?: string
          winner_variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          hypothesis?: string | null
          id?: string
          metric_key?: string
          name?: string
          start_date?: string | null
          statistical_significance?: number | null
          status?: string
          target_sample_size?: number | null
          traffic_percentage?: number
          updated_at?: string
          winner_variant_id?: string | null
        }
        Relationships: []
      }
      ab_test_configs: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          metric_key: string | null
          test_name: string
          traffic_percentage: number | null
          updated_at: string | null
          variants: Json | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metric_key?: string | null
          test_name: string
          traffic_percentage?: number | null
          updated_at?: string | null
          variants?: Json | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          metric_key?: string | null
          test_name?: string
          traffic_percentage?: number | null
          updated_at?: string | null
          variants?: Json | null
        }
        Relationships: []
      }
      ab_variants: {
        Row: {
          config: Json | null
          conversion_rate: number | null
          conversions: number
          created_at: string
          description: string | null
          experiment_id: string
          id: string
          impressions: number
          is_control: boolean
          name: string
          revenue: number | null
          weight: number
        }
        Insert: {
          config?: Json | null
          conversion_rate?: number | null
          conversions?: number
          created_at?: string
          description?: string | null
          experiment_id: string
          id?: string
          impressions?: number
          is_control?: boolean
          name: string
          revenue?: number | null
          weight?: number
        }
        Update: {
          config?: Json | null
          conversion_rate?: number | null
          conversions?: number
          created_at?: string
          description?: string | null
          experiment_id?: string
          id?: string
          impressions?: number
          is_control?: boolean
          name?: string
          revenue?: number | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "ab_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_experiment_results"
            referencedColumns: ["experiment_id"]
          },
          {
            foreignKeyName: "ab_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          category: string | null
          code: string
          color: string | null
          created_at: string
          criteria: Json | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_secret: boolean | null
          name: string
          rarity: string | null
          sort_order: number | null
          xp_reward: number | null
        }
        Insert: {
          category?: string | null
          code: string
          color?: string | null
          created_at?: string
          criteria?: Json | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_secret?: boolean | null
          name: string
          rarity?: string | null
          sort_order?: number | null
          xp_reward?: number | null
        }
        Update: {
          category?: string | null
          code?: string
          color?: string | null
          created_at?: string
          criteria?: Json | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_secret?: boolean | null
          name?: string
          rarity?: string | null
          sort_order?: number | null
          xp_reward?: number | null
        }
        Relationships: []
      }
      ad_campaigns: {
        Row: {
          clicks_count: number | null
          created_at: string | null
          created_by: string | null
          cta_text: string | null
          description: string | null
          ends_at: string | null
          id: string
          image_url: string
          impressions_count: number | null
          is_active: boolean | null
          placement: string
          priority: number | null
          starts_at: string | null
          target_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          clicks_count?: number | null
          created_at?: string | null
          created_by?: string | null
          cta_text?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          image_url: string
          impressions_count?: number | null
          is_active?: boolean | null
          placement?: string
          priority?: number | null
          starts_at?: string | null
          target_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          clicks_count?: number | null
          created_at?: string | null
          created_by?: string | null
          cta_text?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string
          impressions_count?: number | null
          is_active?: boolean | null
          placement?: string
          priority?: number | null
          starts_at?: string | null
          target_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ad_interactions: {
        Row: {
          ad_id: string
          created_at: string | null
          id: string
          interaction_type: string
          user_id: string | null
        }
        Insert: {
          ad_id: string
          created_at?: string | null
          id?: string
          interaction_type: string
          user_id?: string | null
        }
        Update: {
          ad_id?: string
          created_at?: string | null
          id?: string
          interaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_interactions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      addon_configs: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_enabled: boolean
          min_plan: string
          name: string
          price_monthly: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean
          min_plan?: string
          name: string
          price_monthly?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean
          min_plan?: string
          name?: string
          price_monthly?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_impersonation_sessions: {
        Row: {
          admin_user_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          target_user_id: string
          target_user_name: string | null
          target_user_plan: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          target_user_id: string
          target_user_name?: string | null
          target_user_plan?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          target_user_id?: string
          target_user_name?: string | null
          target_user_plan?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      admin_staff: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          last_active: string | null
          name: string
          permissions: Json | null
          region: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_active?: string | null
          name: string
          permissions?: Json | null
          region?: string | null
          role: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_active?: string | null
          name?: string
          permissions?: Json | null
          region?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      album_access_logs: {
        Row: {
          accessed_at: string | null
          album_id: string
          id: string
          viewer_id: string
        }
        Insert: {
          accessed_at?: string | null
          album_id: string
          id?: string
          viewer_id: string
        }
        Update: {
          accessed_at?: string | null
          album_id?: string
          id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_access_logs_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "time_locked_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_access_logs_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "album_access_logs_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_access_logs_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_access_logs_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      album_items: {
        Row: {
          album_id: string
          created_at: string | null
          id: string
          media_type: string | null
          media_url: string
          sort_order: number | null
        }
        Insert: {
          album_id: string
          created_at?: string | null
          id?: string
          media_type?: string | null
          media_url: string
          sort_order?: number | null
        }
        Update: {
          album_id?: string
          created_at?: string | null
          id?: string
          media_type?: string | null
          media_url?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "album_items_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "time_locked_albums"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_alert_logs: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_id: string | null
          created_at: string | null
          id: string
          message: string | null
          threshold_value: number
          triggered_value: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_id?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          threshold_value: number
          triggered_value: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_id?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          threshold_value?: number
          triggered_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_alert_logs_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "analytics_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_alerts: {
        Row: {
          comparison_period: string | null
          condition_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          metric_type: string
          name: string
          notification_channels: string[] | null
          threshold_value: number
        }
        Insert: {
          comparison_period?: string | null
          condition_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          metric_type: string
          name: string
          notification_channels?: string[] | null
          threshold_value: number
        }
        Update: {
          comparison_period?: string | null
          condition_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          metric_type?: string
          name?: string
          notification_channels?: string[] | null
          threshold_value?: number
        }
        Relationships: []
      }
      analytics_goals: {
        Row: {
          achieved_at: string | null
          created_at: string | null
          created_by: string | null
          current_value: number | null
          description: string | null
          end_date: string
          id: string
          metric_type: string
          name: string
          period_type: string | null
          start_date: string
          status: string | null
          target_value: number
          updated_at: string | null
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_value?: number | null
          description?: string | null
          end_date: string
          id?: string
          metric_type: string
          name: string
          period_type?: string | null
          start_date: string
          status?: string | null
          target_value: number
          updated_at?: string | null
        }
        Update: {
          achieved_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_value?: number | null
          description?: string | null
          end_date?: string
          id?: string
          metric_type?: string
          name?: string
          period_type?: string | null
          start_date?: string
          status?: string | null
          target_value?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      analytics_snapshots: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          metric_name: string
          metric_type: string
          metric_value: number
          snapshot_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_type: string
          metric_value?: number
          snapshot_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_type?: string
          metric_value?: number
          snapshot_date?: string
        }
        Relationships: []
      }
      anonymous_reports: {
        Row: {
          action_taken: string | null
          auto_flagged: boolean | null
          category: string
          created_at: string
          description: string | null
          evidence_urls: string[] | null
          id: string
          is_urgent: boolean | null
          priority_score: number | null
          reporter_hash: string | null
          reporter_session_id: string | null
          resolution_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string | null
          status: string | null
          target_id: string | null
          target_type: string
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          auto_flagged?: boolean | null
          category: string
          created_at?: string
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          is_urgent?: boolean | null
          priority_score?: number | null
          reporter_hash?: string | null
          reporter_session_id?: string | null
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          status?: string | null
          target_id?: string | null
          target_type: string
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          auto_flagged?: boolean | null
          category?: string
          created_at?: string
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          is_urgent?: boolean | null
          priority_score?: number | null
          reporter_hash?: string | null
          reporter_session_id?: string | null
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          status?: string | null
          target_id?: string | null
          target_type?: string
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "anonymous_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "anonymous_reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: string[] | null
          rate_limit: number | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: string[] | null
          rate_limit?: number | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: string[] | null
          rate_limit?: number | null
          usage_count?: number | null
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          api_key_id: string | null
          created_at: string | null
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          request_body: Json | null
          response_time_ms: number | null
          status_code: number | null
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          request_body?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          request_body?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_bids: {
        Row: {
          amount: number
          auction_id: string
          bidder_id: string
          created_at: string | null
          id: string
          is_winning: boolean | null
          notified: boolean | null
          outbid_at: string | null
        }
        Insert: {
          amount: number
          auction_id: string
          bidder_id: string
          created_at?: string | null
          id?: string
          is_winning?: boolean | null
          notified?: boolean | null
          outbid_at?: string | null
        }
        Update: {
          amount?: number
          auction_id?: string
          bidder_id?: string
          created_at?: string | null
          id?: string
          is_winning?: boolean | null
          notified?: boolean | null
          outbid_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_bids_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "auction_bids_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      auctions: {
        Row: {
          content_delivered: boolean | null
          created_at: string | null
          creator_id: string
          current_bid: number | null
          current_bidder_id: string | null
          description: string | null
          ends_at: string
          id: string
          media_type: string | null
          media_url: string
          min_increment: number
          original_end_at: string
          starting_price: number
          starts_at: string | null
          status: string | null
          title: string
          total_bids: number | null
          updated_at: string | null
          winner_charged: boolean | null
          winner_id: string | null
        }
        Insert: {
          content_delivered?: boolean | null
          created_at?: string | null
          creator_id: string
          current_bid?: number | null
          current_bidder_id?: string | null
          description?: string | null
          ends_at: string
          id?: string
          media_type?: string | null
          media_url: string
          min_increment?: number
          original_end_at: string
          starting_price?: number
          starts_at?: string | null
          status?: string | null
          title: string
          total_bids?: number | null
          updated_at?: string | null
          winner_charged?: boolean | null
          winner_id?: string | null
        }
        Update: {
          content_delivered?: boolean | null
          created_at?: string | null
          creator_id?: string
          current_bid?: number | null
          current_bidder_id?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          media_type?: string | null
          media_url?: string
          min_increment?: number
          original_end_at?: string
          starting_price?: number
          starts_at?: string | null
          status?: string | null
          title?: string
          total_bids?: number | null
          updated_at?: string | null
          winner_charged?: boolean | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auctions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "auctions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_current_bidder_id_fkey"
            columns: ["current_bidder_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "auctions_current_bidder_id_fkey"
            columns: ["current_bidder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_current_bidder_id_fkey"
            columns: ["current_bidder_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_current_bidder_id_fkey"
            columns: ["current_bidder_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "auctions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          admin_id: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_resource: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_resource?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_resource?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      aura_xp_global_config: {
        Row: {
          billing_enabled: boolean
          id: string
          updated_at: string | null
        }
        Insert: {
          billing_enabled?: boolean
          id?: string
          updated_at?: string | null
        }
        Update: {
          billing_enabled?: boolean
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      aura_xp_interaction_config: {
        Row: {
          action_key: string
          actor_cost: number
          category: string
          description: string | null
          enabled: boolean
          id: string
          receiver_reward: number
          updated_at: string | null
        }
        Insert: {
          action_key: string
          actor_cost?: number
          category?: string
          description?: string | null
          enabled?: boolean
          id?: string
          receiver_reward?: number
          updated_at?: string | null
        }
        Update: {
          action_key?: string
          actor_cost?: number
          category?: string
          description?: string | null
          enabled?: boolean
          id?: string
          receiver_reward?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      aura_xp_interaction_configs: {
        Row: {
          action_key: string
          actor_cost: number
          category: string
          created_at: string | null
          description: string | null
          enabled: boolean
          receiver_reward: number
          updated_at: string | null
        }
        Insert: {
          action_key: string
          actor_cost?: number
          category?: string
          created_at?: string | null
          description?: string | null
          enabled?: boolean
          receiver_reward?: number
          updated_at?: string | null
        }
        Update: {
          action_key?: string
          actor_cost?: number
          category?: string
          created_at?: string | null
          description?: string | null
          enabled?: boolean
          receiver_reward?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          backup_type: string
          completed_at: string | null
          created_by: string | null
          error_message: string | null
          file_size_bytes: number | null
          id: string
          media_count: number | null
          media_included: boolean | null
          metadata: Json | null
          schedule_id: string | null
          started_at: string | null
          status: string | null
          storage_path: string | null
          tables_included: Json | null
        }
        Insert: {
          backup_type: string
          completed_at?: string | null
          created_by?: string | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          media_count?: number | null
          media_included?: boolean | null
          metadata?: Json | null
          schedule_id?: string | null
          started_at?: string | null
          status?: string | null
          storage_path?: string | null
          tables_included?: Json | null
        }
        Update: {
          backup_type?: string
          completed_at?: string | null
          created_by?: string | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          media_count?: number | null
          media_included?: boolean | null
          metadata?: Json | null
          schedule_id?: string | null
          started_at?: string | null
          status?: string | null
          storage_path?: string | null
          tables_included?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_history_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "backup_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_restorations: {
        Row: {
          backup_id: string
          completed_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          notes: string | null
          records_restored: number | null
          started_at: string | null
          status: string | null
          tables_restored: Json | null
        }
        Insert: {
          backup_id: string
          completed_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          notes?: string | null
          records_restored?: number | null
          started_at?: string | null
          status?: string | null
          tables_restored?: Json | null
        }
        Update: {
          backup_id?: string
          completed_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          notes?: string | null
          records_restored?: number | null
          started_at?: string | null
          status?: string | null
          tables_restored?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_restorations_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "backup_history"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_schedules: {
        Row: {
          created_at: string | null
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          frequency: string
          id: string
          include_media: boolean | null
          include_messages: boolean | null
          is_active: boolean | null
          last_run_at: string | null
          name: string
          next_run_at: string | null
          retention_days: number | null
          time_of_day: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          frequency: string
          id?: string
          include_media?: boolean | null
          include_messages?: boolean | null
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          retention_days?: number | null
          time_of_day?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string
          id?: string
          include_media?: boolean | null
          include_messages?: boolean | null
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          retention_days?: number | null
          time_of_day?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      badges: {
        Row: {
          category: string | null
          code: string
          color: string | null
          created_at: string | null
          criteria: Json | null
          description: string | null
          icon: string
          id: string
          is_automatic: boolean | null
          name: string
          points: number | null
        }
        Insert: {
          category?: string | null
          code: string
          color?: string | null
          created_at?: string | null
          criteria?: Json | null
          description?: string | null
          icon?: string
          id?: string
          is_automatic?: boolean | null
          name: string
          points?: number | null
        }
        Update: {
          category?: string | null
          code?: string
          color?: string | null
          created_at?: string | null
          criteria?: Json | null
          description?: string | null
          icon?: string
          id?: string
          is_automatic?: boolean | null
          name?: string
          points?: number | null
        }
        Relationships: []
      }
      bidder_cards: {
        Row: {
          card_brand: string | null
          card_last_four: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_valid: boolean | null
          stripe_payment_method_id: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          card_brand?: string | null
          card_last_four?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_valid?: boolean | null
          stripe_payment_method_id: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          card_brand?: string | null
          card_last_four?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_valid?: boolean | null
          stripe_payment_method_id?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bidder_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "bidder_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidder_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidder_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_contacts: {
        Row: {
          block_type: string
          blocked_user_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          block_type?: string
          blocked_user_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          block_type?: string
          blocked_user_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_contacts_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "blocked_contacts_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_contacts_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_contacts_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "blocked_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_deliveries: {
        Row: {
          broadcast_id: string
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          message_id: string | null
          paid_amount: number | null
          read_at: string | null
          recipient_id: string
          status: string | null
          unlocked_at: string | null
        }
        Insert: {
          broadcast_id: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          paid_amount?: number | null
          read_at?: string | null
          recipient_id: string
          status?: string | null
          unlocked_at?: string | null
        }
        Update: {
          broadcast_id?: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          paid_amount?: number | null
          read_at?: string | null
          recipient_id?: string
          status?: string | null
          unlocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_deliveries_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_deliveries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "broadcast_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience_type: string
          completed_at: string | null
          content: string | null
          created_at: string | null
          creator_id: string
          delivered_count: number | null
          error_message: string | null
          id: string
          is_ppv: boolean | null
          is_scheduled: boolean | null
          media_type: string | null
          media_url: string | null
          ppv_price: number | null
          read_count: number | null
          scheduled_for: string | null
          started_at: string | null
          status: string | null
          total_recipients: number | null
          total_revenue: number | null
          unlock_count: number | null
        }
        Insert: {
          audience_type: string
          completed_at?: string | null
          content?: string | null
          created_at?: string | null
          creator_id: string
          delivered_count?: number | null
          error_message?: string | null
          id?: string
          is_ppv?: boolean | null
          is_scheduled?: boolean | null
          media_type?: string | null
          media_url?: string | null
          ppv_price?: number | null
          read_count?: number | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string | null
          total_recipients?: number | null
          total_revenue?: number | null
          unlock_count?: number | null
        }
        Update: {
          audience_type?: string
          completed_at?: string | null
          content?: string | null
          created_at?: string | null
          creator_id?: string
          delivered_count?: number | null
          error_message?: string | null
          id?: string
          is_ppv?: boolean | null
          is_scheduled?: boolean | null
          media_type?: string | null
          media_url?: string | null
          ppv_price?: number | null
          read_count?: number | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string | null
          total_recipients?: number | null
          total_revenue?: number | null
          unlock_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "broadcasts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_items: {
        Row: {
          bundle_id: string
          created_at: string | null
          id: string
          item_id: string
          position: number | null
        }
        Insert: {
          bundle_id: string
          created_at?: string | null
          id?: string
          item_id: string
          position?: number | null
        }
        Update: {
          bundle_id?: string
          created_at?: string | null
          id?: string
          item_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_executions: {
        Row: {
          campaign_id: string
          channel: string
          clicked_at: string | null
          converted_at: string | null
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          opened_at: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          channel: string
          clicked_at?: string | null
          converted_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          clicked_at?: string | null
          converted_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_executions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_abandonment: {
        Row: {
          amount: number
          attempts_count: number | null
          clicked_at: string | null
          coupon_code: string | null
          created_at: string | null
          creator_id: string | null
          ghost_mode: boolean | null
          id: string
          last_error: string | null
          magic_link_expires_at: string | null
          magic_link_token: string | null
          phone_number: string
          plan_type: string
          recovered_at: string | null
          scheduled_send_at: string | null
          sent_at: string | null
          status: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          amount: number
          attempts_count?: number | null
          clicked_at?: string | null
          coupon_code?: string | null
          created_at?: string | null
          creator_id?: string | null
          ghost_mode?: boolean | null
          id?: string
          last_error?: string | null
          magic_link_expires_at?: string | null
          magic_link_token?: string | null
          phone_number: string
          plan_type: string
          recovered_at?: string | null
          scheduled_send_at?: string | null
          sent_at?: string | null
          status?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          amount?: number
          attempts_count?: number | null
          clicked_at?: string | null
          coupon_code?: string | null
          created_at?: string | null
          creator_id?: string | null
          ghost_mode?: boolean | null
          id?: string
          last_error?: string | null
          magic_link_expires_at?: string | null
          magic_link_token?: string | null
          phone_number?: string
          plan_type?: string
          recovered_at?: string | null
          scheduled_send_at?: string | null
          sent_at?: string | null
          status?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_abandonment_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "cart_abandonment_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_abandonment_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_abandonment_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_abandonment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "cart_abandonment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_abandonment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_abandonment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      chargeback_logs: {
        Row: {
          access_revoked: boolean | null
          affiliate_debit: number | null
          affiliate_id: string | null
          amount: number
          created_at: string | null
          creator_debit: number | null
          creator_id: string | null
          event_type: string
          id: string
          metadata: Json | null
          payment_external_id: string
          plan_revoked: string | null
          processed_at: string | null
          transaction_id: string | null
          user_fingerprint: string | null
          user_id: string | null
          user_ip: string | null
        }
        Insert: {
          access_revoked?: boolean | null
          affiliate_debit?: number | null
          affiliate_id?: string | null
          amount?: number
          created_at?: string | null
          creator_debit?: number | null
          creator_id?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          payment_external_id: string
          plan_revoked?: string | null
          processed_at?: string | null
          transaction_id?: string | null
          user_fingerprint?: string | null
          user_id?: string | null
          user_ip?: string | null
        }
        Update: {
          access_revoked?: boolean | null
          affiliate_debit?: number | null
          affiliate_id?: string | null
          amount?: number
          created_at?: string | null
          creator_debit?: number | null
          creator_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          payment_external_id?: string
          plan_revoked?: string | null
          processed_at?: string | null
          transaction_id?: string | null
          user_fingerprint?: string | null
          user_id?: string | null
          user_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargeback_logs_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "chargeback_logs_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_logs_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_logs_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_logs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "chargeback_logs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_logs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_logs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_unlocks: {
        Row: {
          amount_paid: number
          created_at: string
          creator_profile_id: string
          expires_at: string | null
          id: string
          payment_method: string | null
          transaction_id: string | null
          unlocker_user_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          creator_profile_id: string
          expires_at?: string | null
          id?: string
          payment_method?: string | null
          transaction_id?: string | null
          unlocker_user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          creator_profile_id?: string
          expires_at?: string | null
          id?: string
          payment_method?: string | null
          transaction_id?: string | null
          unlocker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_unlocks_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "chat_unlocks_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_unlocks_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_unlocks_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_health_logs: {
        Row: {
          check_name: string
          created_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          response_time_ms: number | null
          status: string
        }
        Insert: {
          check_name: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          status: string
        }
        Update: {
          check_name?: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          status?: string
        }
        Relationships: []
      }
      checkout_incidents: {
        Row: {
          affected_checks: string[] | null
          created_at: string | null
          description: string | null
          id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
        }
        Insert: {
          affected_checks?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          title: string
        }
        Update: {
          affected_checks?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      churn_alerts: {
        Row: {
          abandoned_at: string | null
          amount: number
          checkout_started_at: string
          created_at: string
          id: string
          metadata: Json | null
          product_id: string | null
          product_type: string
          recovered_at: string | null
          recovery_channel: string | null
          recovery_sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          abandoned_at?: string | null
          amount?: number
          checkout_started_at?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          product_id?: string | null
          product_type: string
          recovered_at?: string | null
          recovery_channel?: string | null
          recovery_sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          abandoned_at?: string | null
          amount?: number
          checkout_started_at?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          product_id?: string | null
          product_type?: string
          recovered_at?: string | null
          recovery_channel?: string | null
          recovery_sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      cohort_data: {
        Row: {
          cohort_date: string
          cohort_type: string | null
          created_at: string | null
          id: string
          period_number: number
          retained_count: number | null
          revenue: number | null
          users_count: number | null
        }
        Insert: {
          cohort_date: string
          cohort_type?: string | null
          created_at?: string | null
          id?: string
          period_number: number
          retained_count?: number | null
          revenue?: number | null
          users_count?: number | null
        }
        Update: {
          cohort_date?: string
          cohort_type?: string | null
          created_at?: string | null
          id?: string
          period_number?: number
          retained_count?: number | null
          revenue?: number | null
          users_count?: number | null
        }
        Relationships: []
      }
      comment_edit_history: {
        Row: {
          comment_id: string
          edited_at: string
          edited_by: string
          id: string
          previous_content: string
        }
        Insert: {
          comment_id: string
          edited_at?: string
          edited_by: string
          id?: string
          previous_content: string
        }
        Update: {
          comment_id?: string
          edited_at?: string
          edited_by?: string
          id?: string
          previous_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_edit_history_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_edit_history_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "comment_edit_history_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_edit_history_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_edit_history_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          category: string
          content_hidden: boolean | null
          created_at: string | null
          description: string | null
          evidence_urls: string[] | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          post_id: string | null
          priority_level: string
          reported_user_id: string | null
          reporter_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          sla_deadline: string | null
          status: string
          story_id: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          content_hidden?: boolean | null
          created_at?: string | null
          description?: string | null
          evidence_urls?: string[] | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          post_id?: string | null
          priority_level?: string
          reported_user_id?: string | null
          reporter_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sla_deadline?: string | null
          status?: string
          story_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          content_hidden?: boolean | null
          created_at?: string | null
          description?: string | null
          evidence_urls?: string[] | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          post_id?: string | null
          priority_level?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sla_deadline?: string | null
          status?: string
          story_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "content_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          has_unread_priority: boolean | null
          id: string
          is_archived: boolean | null
          joined_at: string
          last_read_at: string | null
          priority_responded: boolean | null
          total_priority_amount: number | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          has_unread_priority?: boolean | null
          id?: string
          is_archived?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          priority_responded?: boolean | null
          total_priority_amount?: number | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          has_unread_priority?: boolean | null
          id?: string
          is_archived?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          priority_responded?: boolean | null
          total_priority_amount?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversion_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          plan_type: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          plan_type?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          plan_type?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "conversion_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      cookie_consents: {
        Row: {
          analytics: boolean
          consented_at: string | null
          essential: boolean
          id: string
          marketing: boolean
          personalization: boolean
          session_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          analytics?: boolean
          consented_at?: string | null
          essential?: boolean
          id?: string
          marketing?: boolean
          personalization?: boolean
          session_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          analytics?: boolean
          consented_at?: string | null
          essential?: boolean
          id?: string
          marketing?: boolean
          personalization?: boolean
          session_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      couple_verification_docs: {
        Row: {
          created_at: string
          document_type: string
          id: string
          needs_admin_review: boolean | null
          partner_number: number
          profile_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: string
          id?: string
          needs_admin_review?: boolean | null
          partner_number: number
          profile_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          needs_admin_review?: boolean | null
          partner_number?: number
          profile_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "couple_verification_docs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "couple_verification_docs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_verification_docs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_verification_docs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_verification_docs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "couple_verification_docs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_verification_docs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_verification_docs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          campaign_name: string
          clicks_count: number | null
          code: string
          conversions_count: number | null
          created_at: string | null
          creator_id: string
          current_uses: number | null
          discount: number
          end_date: string
          id: string
          is_active: boolean | null
          max_uses: number | null
          platform_source: string | null
          start_date: string
          total_revenue_generated: number | null
        }
        Insert: {
          campaign_name: string
          clicks_count?: number | null
          code: string
          conversions_count?: number | null
          created_at?: string | null
          creator_id: string
          current_uses?: number | null
          discount: number
          end_date: string
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          platform_source?: string | null
          start_date: string
          total_revenue_generated?: number | null
        }
        Update: {
          campaign_name?: string
          clicks_count?: number | null
          code?: string
          conversions_count?: number | null
          created_at?: string | null
          creator_id?: string
          current_uses?: number | null
          discount?: number
          end_date?: string
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          platform_source?: string | null
          start_date?: string
          total_revenue_generated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "coupons_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_founder_applications: {
        Row: {
          applicant_email: string | null
          applicant_name: string | null
          career_description: string
          created_at: string
          id: string
          photo_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          social_links: Json
          status: string
          updated_at: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          applicant_email?: string | null
          applicant_name?: string | null
          career_description: string
          created_at?: string
          id?: string
          photo_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_links?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          applicant_email?: string | null
          applicant_name?: string | null
          career_description?: string
          created_at?: string
          id?: string
          photo_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_links?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      creator_founders: {
        Row: {
          application_id: string | null
          approved_at: string
          created_at: string
          free_period_ends: string
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          application_id?: string | null
          approved_at?: string
          created_at?: string
          free_period_ends?: string
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          application_id?: string | null
          approved_at?: string
          created_at?: string
          free_period_ends?: string
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_founders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "creator_founder_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_goals: {
        Row: {
          contributors_count: number | null
          created_at: string
          creator_id: string
          current_amount: number
          description: string | null
          id: string
          is_active: boolean
          media_type: string | null
          media_url: string | null
          target_amount: number
          title: string
          updated_at: string
        }
        Insert: {
          contributors_count?: number | null
          created_at?: string
          creator_id: string
          current_amount?: number
          description?: string | null
          id?: string
          is_active?: boolean
          media_type?: string | null
          media_url?: string | null
          target_amount?: number
          title: string
          updated_at?: string
        }
        Update: {
          contributors_count?: number | null
          created_at?: string
          creator_id?: string
          current_amount?: number
          description?: string | null
          id?: string
          is_active?: boolean
          media_type?: string | null
          media_url?: string | null
          target_amount?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_goals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_goals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_goals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_goals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_pricing_config: {
        Row: {
          auction_min_increment: number | null
          auction_starting_price: number | null
          id: string
          platform_fee_pct: number | null
          price_per_message: number | null
          price_per_photo: number | null
          price_per_video: number | null
          profile_id: string
          subscription_annual: number | null
          subscription_enabled: boolean | null
          subscription_lifetime: number | null
          subscription_monthly: number | null
          super_dm_enabled: boolean | null
          super_dm_min_price: number | null
          tax_reserve_pct: number | null
          updated_at: string | null
        }
        Insert: {
          auction_min_increment?: number | null
          auction_starting_price?: number | null
          id?: string
          platform_fee_pct?: number | null
          price_per_message?: number | null
          price_per_photo?: number | null
          price_per_video?: number | null
          profile_id: string
          subscription_annual?: number | null
          subscription_enabled?: boolean | null
          subscription_lifetime?: number | null
          subscription_monthly?: number | null
          super_dm_enabled?: boolean | null
          super_dm_min_price?: number | null
          tax_reserve_pct?: number | null
          updated_at?: string | null
        }
        Update: {
          auction_min_increment?: number | null
          auction_starting_price?: number | null
          id?: string
          platform_fee_pct?: number | null
          price_per_message?: number | null
          price_per_photo?: number | null
          price_per_video?: number | null
          profile_id?: string
          subscription_annual?: number | null
          subscription_enabled?: boolean | null
          subscription_lifetime?: number | null
          subscription_monthly?: number | null
          super_dm_enabled?: boolean | null
          super_dm_min_price?: number | null
          tax_reserve_pct?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_pricing_config_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_pricing_config_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_pricing_config_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_pricing_config_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_referral_commissions: {
        Row: {
          commission_amount: number
          created_at: string | null
          creator_amount: number
          description: string | null
          gross_amount: number
          id: string
          platform_fee_net: number
          platform_fee_original: number
          referral_id: string
          transaction_id: string | null
        }
        Insert: {
          commission_amount: number
          created_at?: string | null
          creator_amount: number
          description?: string | null
          gross_amount: number
          id?: string
          platform_fee_net: number
          platform_fee_original: number
          referral_id: string
          transaction_id?: string | null
        }
        Update: {
          commission_amount?: number
          created_at?: string | null
          creator_amount?: number
          description?: string | null
          gross_amount?: number
          id?: string
          platform_fee_net?: number
          platform_fee_original?: number
          referral_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_referral_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "creator_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_referral_commissions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_referrals: {
        Row: {
          afilhada_id: string
          created_at: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          last_commission_at: string | null
          madrinha_id: string
          referral_code: string
          started_at: string | null
          total_commission_earned: number | null
          updated_at: string | null
        }
        Insert: {
          afilhada_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          last_commission_at?: string | null
          madrinha_id: string
          referral_code: string
          started_at?: string | null
          total_commission_earned?: number | null
          updated_at?: string | null
        }
        Update: {
          afilhada_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          last_commission_at?: string | null
          madrinha_id?: string
          referral_code?: string
          started_at?: string | null
          total_commission_earned?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_referrals_afilhada_id_fkey"
            columns: ["afilhada_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_referrals_afilhada_id_fkey"
            columns: ["afilhada_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_referrals_afilhada_id_fkey"
            columns: ["afilhada_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_referrals_afilhada_id_fkey"
            columns: ["afilhada_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_referrals_madrinha_id_fkey"
            columns: ["madrinha_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_referrals_madrinha_id_fkey"
            columns: ["madrinha_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_referrals_madrinha_id_fkey"
            columns: ["madrinha_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_referrals_madrinha_id_fkey"
            columns: ["madrinha_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_dashboards: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_public: boolean | null
          layout: Json | null
          name: string
          updated_at: string | null
          widgets: Json | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          layout?: Json | null
          name: string
          updated_at?: string | null
          widgets?: Json | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          layout?: Json | null
          name?: string
          updated_at?: string | null
          widgets?: Json | null
        }
        Relationships: []
      }
      custom_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          tag_name: string
          tag_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          tag_name: string
          tag_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          tag_name?: string
          tag_type?: string
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          metric_date: string
          metric_type: string
          metric_value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_date: string
          metric_type: string
          metric_value?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_date?: string
          metric_type?: string
          metric_value?: number
        }
        Relationships: []
      }
      daily_spins: {
        Row: {
          created_at: string | null
          id: string
          prize_code: string | null
          prize_id: string | null
          prize_type: string
          prize_value: number | null
          spin_date: string
          streak_days: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          prize_code?: string | null
          prize_id?: string | null
          prize_type: string
          prize_value?: number | null
          spin_date?: string
          streak_days?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          prize_code?: string | null
          prize_id?: string | null
          prize_type?: string
          prize_value?: number | null
          spin_date?: string
          streak_days?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_spins_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "spin_prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_spins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "daily_spins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_spins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_spins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      discipline_history: {
        Row: {
          action_type: string
          admin_id: string
          created_at: string | null
          details: Json | null
          id: string
          profile_id: string
          reason: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          profile_id: string
          reason?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          profile_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discipline_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "discipline_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      early_bird_claim_history: {
        Row: {
          bonus_months: number
          claimed_at: string | null
          counter_id: string | null
          counter_type: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          bonus_months: number
          claimed_at?: string | null
          counter_id?: string | null
          counter_type: string
          id?: string
          position: number
          user_id: string
        }
        Update: {
          bonus_months?: number
          claimed_at?: string | null
          counter_id?: string | null
          counter_type?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "early_bird_claim_history_counter_id_fkey"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "early_bird_counters"
            referencedColumns: ["id"]
          },
        ]
      }
      early_bird_counters: {
        Row: {
          bonus_months: number
          counter_type: string
          created_at: string | null
          current_count: number
          id: string
          is_active: boolean | null
          max_count: number
          updated_at: string | null
        }
        Insert: {
          bonus_months?: number
          counter_type: string
          created_at?: string | null
          current_count?: number
          id?: string
          is_active?: boolean | null
          max_count?: number
          updated_at?: string | null
        }
        Update: {
          bonus_months?: number
          counter_type?: string
          created_at?: string | null
          current_count?: number
          id?: string
          is_active?: boolean | null
          max_count?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      early_bird_subscriptions: {
        Row: {
          bonus_months: number
          counter_type: string
          created_at: string | null
          id: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          bonus_months: number
          counter_type: string
          created_at?: string | null
          id?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          bonus_months?: number
          counter_type?: string
          created_at?: string | null
          id?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          bounce_reason: string | null
          bounced_at: string | null
          clicked_at: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          opened_at: string | null
          recipient_email: string
          recipient_user_id: string | null
          resend_message_id: string | null
          status: string | null
          subject: string | null
          template_key: string
        }
        Insert: {
          bounce_reason?: string | null
          bounced_at?: string | null
          clicked_at?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          resend_message_id?: string | null
          status?: string | null
          subject?: string | null
          template_key: string
        }
        Update: {
          bounce_reason?: string | null
          bounced_at?: string | null
          clicked_at?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          resend_message_id?: string | null
          status?: string | null
          subject?: string | null
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "email_logs_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          html_content: string
          id: string
          is_active: boolean | null
          name: string
          subject: string
          template_key: string
          updated_at: string | null
          updated_by: string | null
          variables: Json | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          html_content: string
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          template_key: string
          updated_at?: string | null
          updated_by?: string | null
          variables?: Json | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          html_content?: string
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          template_key?: string
          updated_at?: string | null
          updated_by?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      engagement_events: {
        Row: {
          created_at: string | null
          day_of_week: number | null
          event_source: string | null
          event_type: string
          hour_of_day: number | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week?: number | null
          event_source?: string | null
          event_type: string
          hour_of_day?: number | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number | null
          event_source?: string | null
          event_type?: string
          hour_of_day?: number | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "engagement_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      event_checkins: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          event_id: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_checkins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "event_checkins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "event_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invites: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          message: string | null
          recipient_id: string
          responded_at: string | null
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          message?: string | null
          recipient_id: string
          responded_at?: string | null
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          message?: string | null
          recipient_id?: string
          responded_at?: string | null
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "event_invites_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "event_invites_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      event_messages: {
        Row: {
          content: string
          created_at: string | null
          event_id: string
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          event_id: string
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          event_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "event_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      event_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          event_id: string
          id: string
          photo_url: string
          storage_path: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          photo_url: string
          storage_path: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          photo_url?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "event_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ratings: {
        Row: {
          aspects: Json | null
          created_at: string | null
          event_id: string
          feedback: string | null
          id: string
          rating: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aspects?: Json | null
          created_at?: string | null
          event_id: string
          feedback?: string | null
          id?: string
          rating: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aspects?: Json | null
          created_at?: string | null
          event_id?: string
          feedback?: string | null
          id?: string
          rating?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ratings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "event_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          mute_notifications: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          mute_notifications?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          mute_notifications?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          creator_id: string
          description: string | null
          event_date: string
          event_time: string
          id: string
          image_url: string | null
          is_active: boolean | null
          location: string
          max_attendees: number | null
          price: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          description?: string | null
          event_date: string
          event_time: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location: string
          max_attendees?: number | null
          price?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          description?: string | null
          event_date?: string
          event_time?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location?: string
          max_attendees?: number | null
          price?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_request_votes: {
        Row: {
          created_at: string
          id: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_request_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          admin_response: string | null
          category: string | null
          created_at: string
          description: string
          estimated_release: string | null
          id: string
          is_public: boolean
          priority: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
          votes_count: number
        }
        Insert: {
          admin_response?: string | null
          category?: string | null
          created_at?: string
          description: string
          estimated_release?: string | null
          id?: string
          is_public?: boolean
          priority?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
          votes_count?: number
        }
        Update: {
          admin_response?: string | null
          category?: string | null
          created_at?: string
          description?: string
          estimated_release?: string | null
          id?: string
          is_public?: boolean
          priority?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          votes_count?: number
        }
        Relationships: []
      }
      feedback_forms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          form_type: string
          id: string
          is_active: boolean
          name: string
          responses_count: number
          thank_you_message: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          form_type?: string
          id?: string
          is_active?: boolean
          name: string
          responses_count?: number
          thank_you_message?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          form_type?: string
          id?: string
          is_active?: boolean
          name?: string
          responses_count?: number
          thank_you_message?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feedback_responses: {
        Row: {
          admin_notes: string | null
          created_at: string
          form_id: string
          id: string
          metadata: Json | null
          rating: number | null
          responses: Json
          reviewed_at: string | null
          reviewed_by: string | null
          sentiment: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          form_id: string
          id?: string
          metadata?: Json | null
          rating?: number | null
          responses?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          sentiment?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          form_id?: string
          id?: string
          metadata?: Json | null
          rating?: number | null
          responses?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          sentiment?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "feedback_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_invoices: {
        Row: {
          created_at: string | null
          download_count: number | null
          generated_by: string | null
          html_content: string | null
          id: string
          invoice_number: string
          last_downloaded_at: string | null
          metadata: Json | null
          pdf_url: string | null
          sent_at: string | null
          sent_to_email: string | null
          status: string | null
          transaction_id: string | null
        }
        Insert: {
          created_at?: string | null
          download_count?: number | null
          generated_by?: string | null
          html_content?: string | null
          id?: string
          invoice_number: string
          last_downloaded_at?: string | null
          metadata?: Json | null
          pdf_url?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string | null
          transaction_id?: string | null
        }
        Update: {
          created_at?: string | null
          download_count?: number | null
          generated_by?: string | null
          html_content?: string | null
          id?: string
          invoice_number?: string
          last_downloaded_at?: string | null
          metadata?: Json | null
          pdf_url?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_history: {
        Row: {
          amount: number
          conversation_id: string | null
          created_at: string | null
          credits_used: number
          id: string
          is_visible: boolean | null
          message_id: string | null
          receiver_id: string
          sender_id: string
          thank_you_sent_at: string | null
          thank_you_type: string | null
        }
        Insert: {
          amount: number
          conversation_id?: string | null
          created_at?: string | null
          credits_used: number
          id?: string
          is_visible?: boolean | null
          message_id?: string | null
          receiver_id: string
          sender_id: string
          thank_you_sent_at?: string | null
          thank_you_type?: string | null
        }
        Update: {
          amount?: number
          conversation_id?: string | null
          created_at?: string | null
          credits_used?: number
          id?: string
          is_visible?: boolean | null
          message_id?: string | null
          receiver_id?: string
          sender_id?: string
          thank_you_sent_at?: string | null
          thank_you_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_history_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_history_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gift_history_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_history_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_history_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_history_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gift_history_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_history_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_history_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_thank_you: {
        Row: {
          content: string | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string | null
          gift_transaction_id: string
          id: string
          is_claimed: boolean | null
          media_url: string | null
          receiver_id: string
          sender_id: string
          thank_you_type: string
        }
        Insert: {
          content?: string | null
          coupon_code?: string | null
          coupon_discount?: number | null
          created_at?: string | null
          gift_transaction_id: string
          id?: string
          is_claimed?: boolean | null
          media_url?: string | null
          receiver_id: string
          sender_id: string
          thank_you_type: string
        }
        Update: {
          content?: string | null
          coupon_code?: string | null
          coupon_discount?: number | null
          created_at?: string | null
          gift_transaction_id?: string
          id?: string
          is_claimed?: boolean | null
          media_url?: string | null
          receiver_id?: string
          sender_id?: string
          thank_you_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_thank_you_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gift_thank_you_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_thank_you_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_thank_you_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_thank_you_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gift_thank_you_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_thank_you_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_thank_you_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_contributions: {
        Row: {
          amount: number
          contributor_id: string
          created_at: string
          goal_id: string
          id: string
          is_anonymous: boolean | null
          message: string | null
        }
        Insert: {
          amount: number
          contributor_id: string
          created_at?: string
          goal_id: string
          id?: string
          is_anonymous?: boolean | null
          message?: string | null
        }
        Update: {
          amount?: number
          contributor_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          is_anonymous?: boolean | null
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "goal_contributions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "creator_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_predictions: {
        Row: {
          actual_value: number | null
          confidence_level: number | null
          created_at: string | null
          id: string
          model_version: string | null
          predicted_value: number
          prediction_date: string
          prediction_type: string
        }
        Insert: {
          actual_value?: number | null
          confidence_level?: number | null
          created_at?: string | null
          id?: string
          model_version?: string | null
          predicted_value: number
          prediction_date: string
          prediction_type: string
        }
        Update: {
          actual_value?: number | null
          confidence_level?: number | null
          created_at?: string | null
          id?: string
          model_version?: string | null
          predicted_value?: number
          prediction_date?: string
          prediction_type?: string
        }
        Relationships: []
      }
      hero_advanced_settings: {
        Row: {
          ab_test_enabled: boolean | null
          ab_test_variant_b: Json | null
          audio_default_volume: number | null
          audio_enabled: boolean | null
          audio_track_day: string | null
          audio_track_night: string | null
          audio_visualizer_enabled: boolean | null
          background_image_url: string | null
          background_type: string | null
          background_video_url: string | null
          created_at: string | null
          day_start_hour: number | null
          enable_floating_particles: boolean | null
          enable_geo_replacement: boolean | null
          geo_fallback_city: string | null
          id: string
          is_active: boolean | null
          moon_glow_intensity: number | null
          moon_position_x: number | null
          moon_position_y: number | null
          moon_size: number | null
          night_start_hour: number | null
          parallax_city_speed: number | null
          parallax_moon_speed: number | null
          parallax_stars_speed: number | null
          rotating_words: Json | null
          scroll_indicator_delay_ms: number | null
          show_scroll_indicator: boolean | null
          show_signups_today: boolean | null
          stars_count: number | null
          texts_day: Json | null
          texts_night: Json | null
          trust_indicators: Json | null
          typewriter_pause_ms: number | null
          typewriter_speed_ms: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          ab_test_enabled?: boolean | null
          ab_test_variant_b?: Json | null
          audio_default_volume?: number | null
          audio_enabled?: boolean | null
          audio_track_day?: string | null
          audio_track_night?: string | null
          audio_visualizer_enabled?: boolean | null
          background_image_url?: string | null
          background_type?: string | null
          background_video_url?: string | null
          created_at?: string | null
          day_start_hour?: number | null
          enable_floating_particles?: boolean | null
          enable_geo_replacement?: boolean | null
          geo_fallback_city?: string | null
          id?: string
          is_active?: boolean | null
          moon_glow_intensity?: number | null
          moon_position_x?: number | null
          moon_position_y?: number | null
          moon_size?: number | null
          night_start_hour?: number | null
          parallax_city_speed?: number | null
          parallax_moon_speed?: number | null
          parallax_stars_speed?: number | null
          rotating_words?: Json | null
          scroll_indicator_delay_ms?: number | null
          show_scroll_indicator?: boolean | null
          show_signups_today?: boolean | null
          stars_count?: number | null
          texts_day?: Json | null
          texts_night?: Json | null
          trust_indicators?: Json | null
          typewriter_pause_ms?: number | null
          typewriter_speed_ms?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          ab_test_enabled?: boolean | null
          ab_test_variant_b?: Json | null
          audio_default_volume?: number | null
          audio_enabled?: boolean | null
          audio_track_day?: string | null
          audio_track_night?: string | null
          audio_visualizer_enabled?: boolean | null
          background_image_url?: string | null
          background_type?: string | null
          background_video_url?: string | null
          created_at?: string | null
          day_start_hour?: number | null
          enable_floating_particles?: boolean | null
          enable_geo_replacement?: boolean | null
          geo_fallback_city?: string | null
          id?: string
          is_active?: boolean | null
          moon_glow_intensity?: number | null
          moon_position_x?: number | null
          moon_position_y?: number | null
          moon_size?: number | null
          night_start_hour?: number | null
          parallax_city_speed?: number | null
          parallax_moon_speed?: number | null
          parallax_stars_speed?: number | null
          rotating_words?: Json | null
          scroll_indicator_delay_ms?: number | null
          show_scroll_indicator?: boolean | null
          show_signups_today?: boolean | null
          stars_count?: number | null
          texts_day?: Json | null
          texts_night?: Json | null
          trust_indicators?: Json | null
          typewriter_pause_ms?: number | null
          typewriter_speed_ms?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      ice_breaker_suggestions: {
        Row: {
          based_on: string | null
          created_at: string | null
          id: string
          suggestion_text: string
          target_user_id: string
          user_id: string
          was_used: boolean | null
        }
        Insert: {
          based_on?: string | null
          created_at?: string | null
          id?: string
          suggestion_text: string
          target_user_id: string
          user_id: string
          was_used?: boolean | null
        }
        Update: {
          based_on?: string | null
          created_at?: string | null
          id?: string
          suggestion_text?: string
          target_user_id?: string
          user_id?: string
          was_used?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ice_breaker_suggestions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "ice_breaker_suggestions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_breaker_suggestions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_breaker_suggestions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_breaker_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "ice_breaker_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_breaker_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_breaker_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_access_logs: {
        Row: {
          admin_id: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          route_accessed: string
          route_category: string
          sensitivity_level: string | null
          session_id: string | null
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          route_accessed: string
          route_category: string
          sensitivity_level?: string | null
          session_id?: string | null
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          route_accessed?: string
          route_category?: string
          sensitivity_level?: string | null
          session_id?: string | null
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_access_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "admin_impersonation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_send_logs: {
        Row: {
          error_message: string | null
          id: string
          invoice_id: string | null
          send_method: string | null
          sent_at: string | null
          sent_to: string
          status: string | null
        }
        Insert: {
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          send_method?: string | null
          sent_at?: string | null
          sent_to: string
          status?: string | null
        }
        Update: {
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          send_method?: string | null
          sent_at?: string | null
          sent_to?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_send_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "generated_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          auto_send_email: boolean | null
          company_address: string | null
          company_document: string | null
          company_name: string | null
          created_at: string | null
          creator_id: string | null
          custom_css: string | null
          footer_text: string | null
          id: string
          include_logo: boolean | null
          include_qr_code: boolean | null
          logo_url: string | null
          updated_at: string | null
        }
        Insert: {
          auto_send_email?: boolean | null
          company_address?: string | null
          company_document?: string | null
          company_name?: string | null
          created_at?: string | null
          creator_id?: string | null
          custom_css?: string | null
          footer_text?: string | null
          id?: string
          include_logo?: boolean | null
          include_qr_code?: boolean | null
          logo_url?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_send_email?: boolean | null
          company_address?: string | null
          company_document?: string | null
          company_name?: string | null
          created_at?: string | null
          creator_id?: string | null
          custom_css?: string | null
          footer_text?: string | null
          id?: string
          include_logo?: boolean | null
          include_qr_code?: boolean | null
          logo_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_settings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "invoice_settings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_settings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_settings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          html_template: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          html_template: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          html_template?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      landing_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "landing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_snapshots: {
        Row: {
          achievements_count: number | null
          created_at: string
          id: string
          period_end: string
          period_start: string
          period_type: string
          rank: number | null
          total_xp: number | null
          user_id: string
        }
        Insert: {
          achievements_count?: number | null
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          period_type: string
          rank?: number | null
          total_xp?: number | null
          user_id: string
        }
        Update: {
          achievements_count?: number | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          rank?: number | null
          total_xp?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      level_definitions: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          level_number: number
          name: string
          perks: Json | null
          xp_required: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          level_number: number
          name: string
          perks?: Json | null
          xp_required: number
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          level_number?: number
          name?: string
          perks?: Json | null
          xp_required?: number
        }
        Relationships: []
      }
      looking_now_matches: {
        Row: {
          created_at: string | null
          distance_km: number
          id: string
          is_expired: boolean | null
          is_super_match: boolean | null
          matched_at: string | null
          updated_at: string | null
          user1_chat_started: boolean | null
          user1_id: string
          user2_chat_started: boolean | null
          user2_id: string
        }
        Insert: {
          created_at?: string | null
          distance_km: number
          id?: string
          is_expired?: boolean | null
          is_super_match?: boolean | null
          matched_at?: string | null
          updated_at?: string | null
          user1_chat_started?: boolean | null
          user1_id: string
          user2_chat_started?: boolean | null
          user2_id: string
        }
        Update: {
          created_at?: string | null
          distance_km?: number
          id?: string
          is_expired?: boolean | null
          is_super_match?: boolean | null
          matched_at?: string | null
          updated_at?: string | null
          user1_chat_started?: boolean | null
          user1_id?: string
          user2_chat_started?: boolean | null
          user2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "looking_now_matches_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "looking_now_matches_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "looking_now_matches_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "looking_now_matches_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "looking_now_matches_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "looking_now_matches_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "looking_now_matches_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "looking_now_matches_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      lucky_matches: {
        Row: {
          compatibility_score: number | null
          created_at: string | null
          id: string
          matched_user_id: string
          user_id: string
          was_contacted: boolean | null
        }
        Insert: {
          compatibility_score?: number | null
          created_at?: string | null
          id?: string
          matched_user_id: string
          user_id: string
          was_contacted?: boolean | null
        }
        Update: {
          compatibility_score?: number | null
          created_at?: string | null
          id?: string
          matched_user_id?: string
          user_id?: string
          was_contacted?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "lucky_matches_matched_user_id_fkey"
            columns: ["matched_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "lucky_matches_matched_user_id_fkey"
            columns: ["matched_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lucky_matches_matched_user_id_fkey"
            columns: ["matched_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lucky_matches_matched_user_id_fkey"
            columns: ["matched_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lucky_matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "lucky_matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lucky_matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lucky_matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          email_template_id: string | null
          id: string
          name: string
          push_body: string | null
          push_title: string | null
          push_url: string | null
          scheduled_at: string | null
          started_at: string | null
          stats: Json | null
          status: string
          target_audience: string
          target_filter: Json | null
          trigger_config: Json | null
          trigger_event: string | null
          trigger_type: string
          type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email_template_id?: string | null
          id?: string
          name: string
          push_body?: string | null
          push_title?: string | null
          push_url?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          stats?: Json | null
          status?: string
          target_audience: string
          target_filter?: Json | null
          trigger_config?: Json | null
          trigger_event?: string | null
          trigger_type: string
          type: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email_template_id?: string | null
          id?: string
          name?: string
          push_body?: string | null
          push_title?: string | null
          push_url?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          stats?: Json | null
          status?: string
          target_audience?: string
          target_filter?: Json | null
          trigger_config?: Json | null
          trigger_event?: string | null
          trigger_type?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      marketplace_featured: {
        Row: {
          created_at: string | null
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          item_id: string
          position: number | null
          starts_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          item_id: string
          position?: number | null
          starts_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          item_id?: string
          position?: number | null
          starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_featured_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_items: {
        Row: {
          content_type: string
          created_at: string | null
          creator_id: string
          description: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          item_type: string
          media_urls: string[] | null
          original_price: number | null
          preview_url: string | null
          price: number
          release_date: string | null
          sold_count: number | null
          stock_limit: number | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content_type?: string
          created_at?: string | null
          creator_id: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          item_type?: string
          media_urls?: string[] | null
          original_price?: number | null
          preview_url?: string | null
          price: number
          release_date?: string | null
          sold_count?: number | null
          stock_limit?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string | null
          creator_id?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          item_type?: string
          media_urls?: string[] | null
          original_price?: number | null
          preview_url?: string | null
          price?: number
          release_date?: string | null
          sold_count?: number | null
          stock_limit?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "marketplace_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_purchases: {
        Row: {
          buyer_id: string
          created_at: string | null
          download_count: number | null
          downloaded: boolean | null
          id: string
          item_id: string
          payment_method: string
          price_paid: number
          status: string
          transaction_id: string | null
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          download_count?: number | null
          downloaded?: boolean | null
          id?: string
          item_id: string
          payment_method?: string
          price_paid: number
          status?: string
          transaction_id?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          download_count?: number | null
          downloaded?: boolean | null
          id?: string
          item_id?: string
          payment_method?: string
          price_paid?: number
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "marketplace_purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_purchases_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      media_access: {
        Row: {
          amount_paid: number
          id: string
          post_id: string
          purchased_at: string
          seller_id: string
          user_id: string
        }
        Insert: {
          amount_paid?: number
          id?: string
          post_id: string
          purchased_at?: string
          seller_id: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          id?: string
          post_id?: string
          purchased_at?: string
          seller_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_access_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_access_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_access_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_access_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "media_access_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_access_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_access_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "media_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      media_share_links: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          post_id: string | null
          share_code: string
          views_count: number | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          post_id?: string | null
          share_code: string
          views_count?: number | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          post_id?: string | null
          share_code?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_share_links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_share_links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_share_links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      media_unlocks: {
        Row: {
          amount: number
          created_at: string
          creator_id: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          creator_id: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          creator_id?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_unlocks_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      media_vault: {
        Row: {
          access_count: number | null
          access_pin_hash: string | null
          created_at: string
          encryption_key_hash: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          id: string
          is_encrypted: boolean | null
          is_locked: boolean | null
          last_accessed_at: string | null
          notes: string | null
          storage_path: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_count?: number | null
          access_pin_hash?: string | null
          created_at?: string
          encryption_key_hash?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          id?: string
          is_encrypted?: boolean | null
          is_locked?: boolean | null
          last_accessed_at?: string | null
          notes?: string | null
          storage_path: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_count?: number | null
          access_pin_hash?: string | null
          created_at?: string
          encryption_key_hash?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          id?: string
          is_encrypted?: boolean | null
          is_locked?: boolean | null
          last_accessed_at?: string | null
          notes?: string | null
          storage_path?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_vault_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "media_vault_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_vault_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_vault_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      message_translations: {
        Row: {
          created_at: string | null
          id: string
          message_id: string
          original_lang: string | null
          target_lang: string
          translated_text: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id: string
          original_lang?: string | null
          target_lang: string
          translated_text: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string
          original_lang?: string | null
          target_lang?: string
          translated_text?: string
        }
        Relationships: []
      }
      message_unsend_logs: {
        Row: {
          id: string
          message_id: string
          original_content: string | null
          unsent_at: string | null
          unsent_by: string
        }
        Insert: {
          id?: string
          message_id: string
          original_content?: string | null
          unsent_at?: string | null
          unsent_by: string
        }
        Update: {
          id?: string
          message_id?: string
          original_content?: string | null
          unsent_at?: string | null
          unsent_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_unsend_logs_unsent_by_fkey"
            columns: ["unsent_by"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "message_unsend_logs_unsent_by_fkey"
            columns: ["unsent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_unsend_logs_unsent_by_fkey"
            columns: ["unsent_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_unsend_logs_unsent_by_fkey"
            columns: ["unsent_by"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          broadcast_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_by: string[]
          deleted_for_everyone: boolean
          encrypted_content: string | null
          encryption_iv: string | null
          id: string
          is_auto_reply: boolean | null
          is_encrypted: boolean
          is_locked: boolean | null
          is_priority: boolean | null
          is_read: boolean | null
          media_type: string | null
          media_url: string | null
          priority_amount: number | null
          priority_paid_at: string | null
          sender_id: string
          story_reply_id: string | null
          unlock_price: number | null
          unlocked_by: string[] | null
        }
        Insert: {
          broadcast_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          deleted_by?: string[]
          deleted_for_everyone?: boolean
          encrypted_content?: string | null
          encryption_iv?: string | null
          id?: string
          is_auto_reply?: boolean | null
          is_encrypted?: boolean
          is_locked?: boolean | null
          is_priority?: boolean | null
          is_read?: boolean | null
          media_type?: string | null
          media_url?: string | null
          priority_amount?: number | null
          priority_paid_at?: string | null
          sender_id: string
          story_reply_id?: string | null
          unlock_price?: number | null
          unlocked_by?: string[] | null
        }
        Update: {
          broadcast_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_by?: string[]
          deleted_for_everyone?: boolean
          encrypted_content?: string | null
          encryption_iv?: string | null
          id?: string
          is_auto_reply?: boolean | null
          is_encrypted?: boolean
          is_locked?: boolean | null
          is_priority?: boolean | null
          is_read?: boolean | null
          media_type?: string | null
          media_url?: string | null
          priority_amount?: number | null
          priority_paid_at?: string | null
          sender_id?: string
          story_reply_id?: string | null
          unlock_price?: number | null
          unlocked_by?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_story_reply_id_fkey"
            columns: ["story_reply_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_story_reply_id_fkey"
            columns: ["story_reply_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_story_reply_id_fkey"
            columns: ["story_reply_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dispatch_logs: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          message_preview: string | null
          metadata: Json
          recipient: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_preview?: string | null
          metadata?: Json
          recipient?: string | null
          status: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_preview?: string | null
          metadata?: Json
          recipient?: string | null
          status?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          inapp_broadcasts: boolean
          inapp_comments: boolean
          inapp_likes: boolean
          inapp_new_match: boolean
          inapp_new_message: boolean
          inapp_profile_visits: boolean
          push_gifts: boolean
          push_kyc_status: boolean
          push_new_match: boolean
          push_new_message: boolean
          push_stories: boolean
          push_validation_warning: boolean
          show_message_preview: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inapp_broadcasts?: boolean
          inapp_comments?: boolean
          inapp_likes?: boolean
          inapp_new_match?: boolean
          inapp_new_message?: boolean
          inapp_profile_visits?: boolean
          push_gifts?: boolean
          push_kyc_status?: boolean
          push_new_match?: boolean
          push_new_message?: boolean
          push_stories?: boolean
          push_validation_warning?: boolean
          show_message_preview?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inapp_broadcasts?: boolean
          inapp_comments?: boolean
          inapp_likes?: boolean
          inapp_new_match?: boolean
          inapp_new_message?: boolean
          inapp_profile_visits?: boolean
          push_gifts?: boolean
          push_kyc_status?: boolean
          push_new_match?: boolean
          push_new_message?: boolean
          push_stories?: boolean
          push_validation_warning?: boolean
          show_message_preview?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nps_responses: {
        Row: {
          category: string | null
          comment: string | null
          created_at: string
          id: string
          metadata: Json | null
          page_url: string | null
          score: number
          survey_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          page_url?: string | null
          score: number
          survey_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          page_url?: string | null
          score?: number
          survey_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "nps_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_surveys: {
        Row: {
          avg_score: number | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          followup_question: string | null
          id: string
          is_active: boolean
          name: string
          nps_score: number | null
          question: string
          responses_count: number
          show_frequency_days: number | null
          start_date: string | null
          target_audience: string | null
          trigger_days_after_signup: number | null
          trigger_event: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          avg_score?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          followup_question?: string | null
          id?: string
          is_active?: boolean
          name: string
          nps_score?: number | null
          question?: string
          responses_count?: number
          show_frequency_days?: number | null
          start_date?: string | null
          target_audience?: string | null
          trigger_days_after_signup?: number | null
          trigger_event?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          avg_score?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          followup_question?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nps_score?: number | null
          question?: string
          responses_count?: number
          show_frequency_days?: number | null
          start_date?: string | null
          target_audience?: string | null
          trigger_days_after_signup?: number | null
          trigger_event?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      oculto_blocked_commissions: {
        Row: {
          created_at: string
          evidence: Json | null
          gross_amount: number | null
          id: string
          reason: string
          referred_id: string | null
          referrer_id: string | null
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          subscription_id: string | null
        }
        Insert: {
          created_at?: string
          evidence?: Json | null
          gross_amount?: number | null
          id?: string
          reason: string
          referred_id?: string | null
          referrer_id?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          subscription_id?: string | null
        }
        Update: {
          created_at?: string
          evidence?: Json | null
          gross_amount?: number | null
          id?: string
          reason?: string
          referred_id?: string | null
          referrer_id?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      oculto_marketplace_ads: {
        Row: {
          advertiser_profile_id: string | null
          clicks_count: number
          created_at: string
          created_by: string | null
          display_order: number
          external_url: string | null
          full_description: string | null
          gallery_images: string[]
          id: string
          is_active: boolean
          main_image_url: string
          price: number
          short_description: string
          title: string
          updated_at: string
          video_url: string | null
          views_count: number
        }
        Insert: {
          advertiser_profile_id?: string | null
          clicks_count?: number
          created_at?: string
          created_by?: string | null
          display_order?: number
          external_url?: string | null
          full_description?: string | null
          gallery_images?: string[]
          id?: string
          is_active?: boolean
          main_image_url: string
          price?: number
          short_description: string
          title: string
          updated_at?: string
          video_url?: string | null
          views_count?: number
        }
        Update: {
          advertiser_profile_id?: string | null
          clicks_count?: number
          created_at?: string
          created_by?: string | null
          display_order?: number
          external_url?: string | null
          full_description?: string | null
          gallery_images?: string[]
          id?: string
          is_active?: boolean
          main_image_url?: string
          price?: number
          short_description?: string
          title?: string
          updated_at?: string
          video_url?: string | null
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "oculto_marketplace_ads_advertiser_profile_id_fkey"
            columns: ["advertiser_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "oculto_marketplace_ads_advertiser_profile_id_fkey"
            columns: ["advertiser_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oculto_marketplace_ads_advertiser_profile_id_fkey"
            columns: ["advertiser_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oculto_marketplace_ads_advertiser_profile_id_fkey"
            columns: ["advertiser_profile_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      oculto_master_alert_settings: {
        Row: {
          auto_open_modal: boolean
          enabled: boolean
          id: string
          last_triggered_at: string | null
          recurrence_seconds: number
          sound_preset: string
          sound_url: string | null
          updated_at: string
          volume: number
        }
        Insert: {
          auto_open_modal?: boolean
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          recurrence_seconds?: number
          sound_preset?: string
          sound_url?: string | null
          updated_at?: string
          volume?: number
        }
        Update: {
          auto_open_modal?: boolean
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          recurrence_seconds?: number
          sound_preset?: string
          sound_url?: string | null
          updated_at?: string
          volume?: number
        }
        Relationships: []
      }
      oculto_platform_plans: {
        Row: {
          created_at: string
          cta_text: string | null
          description: string | null
          display_order: number
          features: Json
          id: string
          is_active: boolean
          is_default: boolean
          is_popular: boolean
          name: string
          plan_type: string
          price_annual_per_month: number
          price_annual_total: number
          price_monthly: number
          restrictions: Json
          slug: string
          stripe_price_id_annual: string | null
          stripe_price_id_monthly: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_text?: string | null
          description?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_popular?: boolean
          name: string
          plan_type: string
          price_annual_per_month?: number
          price_annual_total?: number
          price_monthly?: number
          restrictions?: Json
          slug: string
          stripe_price_id_annual?: string | null
          stripe_price_id_monthly?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_text?: string | null
          description?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_popular?: boolean
          name?: string
          plan_type?: string
          price_annual_per_month?: number
          price_annual_total?: number
          price_monthly?: number
          restrictions?: Json
          slug?: string
          stripe_price_id_annual?: string | null
          stripe_price_id_monthly?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      oculto_profile_highlights: {
        Row: {
          active: boolean
          amount_paid: number
          created_at: string
          expires_at: string
          id: string
          payment_id: string | null
          profile_id: string
          starts_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount_paid?: number
          created_at?: string
          expires_at?: string
          id?: string
          payment_id?: string | null
          profile_id: string
          starts_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount_paid?: number
          created_at?: string
          expires_at?: string
          id?: string
          payment_id?: string | null
          profile_id?: string
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oculto_profile_highlights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "oculto_profile_highlights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oculto_profile_highlights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oculto_profile_highlights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      oculto_user_activity_logs: {
        Row: {
          action_type: string
          created_at: string
          device_id: string | null
          id: string
          ip_address: string | null
          is_alerted: boolean
          metadata: Json | null
          risk_score: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: string | null
          is_alerted?: boolean
          metadata?: Json | null
          risk_score?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: string | null
          is_alerted?: boolean
          metadata?: Json | null
          risk_score?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      oculto_user_reputation: {
        Row: {
          created_at: string
          notes: string | null
          profile_id: string
          rating: number
          total_reviews: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          notes?: string | null
          profile_id: string
          rating?: number
          total_reviews?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          notes?: string | null
          profile_id?: string
          rating?: number
          total_reviews?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oculto_user_reputation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "oculto_user_reputation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oculto_user_reputation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oculto_user_reputation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      pair_settings: {
        Row: {
          gender_interest: string[] | null
          id: string
          max_age: number | null
          max_distance_km: number | null
          min_age: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          gender_interest?: string[] | null
          id?: string
          max_age?: number | null
          max_distance_km?: number | null
          min_age?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          gender_interest?: string[] | null
          id?: string
          max_age?: number | null
          max_distance_km?: number | null
          min_age?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pair_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "pair_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_logs: {
        Row: {
          created_at: string | null
          error_msg: string | null
          event_type: string | null
          id: string
          metadata: Json | null
          provider: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_msg?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_msg?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          status?: string | null
        }
        Relationships: []
      }
      payment_reminders: {
        Row: {
          created_at: string | null
          id: string
          reminder_day: number
          sent_at: string | null
          sent_via: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reminder_day: number
          sent_at?: string | null
          sent_via: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reminder_day?: number
          sent_at?: string | null
          sent_via?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "payment_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_splits: {
        Row: {
          created_at: string | null
          creator_amount: number
          creator_id: string | null
          id: string
          platform_fee: number
          platform_fee_percent: number
          processed_at: string | null
          total_amount: number
          transaction_external_id: string
        }
        Insert: {
          created_at?: string | null
          creator_amount: number
          creator_id?: string | null
          id?: string
          platform_fee: number
          platform_fee_percent: number
          processed_at?: string | null
          total_amount: number
          transaction_external_id: string
        }
        Update: {
          created_at?: string | null
          creator_amount?: number
          creator_id?: string | null
          id?: string
          platform_fee?: number
          platform_fee_percent?: number
          processed_at?: string | null
          total_amount?: number
          transaction_external_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_splits_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "payment_splits_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_splits_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_splits_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_log: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          creator_id: string | null
          external_id: string | null
          id: string
          metadata: Json | null
          post_id: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          creator_id?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          post_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          creator_id?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          post_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_balance_releases: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          profile_id: string
          release_at: string
          source_transaction_id: string | null
          source_type: string
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          profile_id: string
          release_at: string
          source_transaction_id?: string | null
          source_type: string
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          profile_id?: string
          release_at?: string
          source_transaction_id?: string | null
          source_type?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_balance_releases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "pending_balance_releases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_balance_releases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_balance_releases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_balance_releases_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      perfect_pair_actions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          target_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          target_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          target_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfect_pair_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "perfect_pair_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pair_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pair_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pair_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "perfect_pair_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pair_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pair_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      perfect_pairs: {
        Row: {
          action: string
          created_at: string
          id: string
          rejected_at: string | null
          target_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          rejected_at?: string | null
          target_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          rejected_at?: string | null
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfect_pairs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "perfect_pairs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pairs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pairs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pairs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "perfect_pairs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pairs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfect_pairs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      pings: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          seen_at: string | null
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          seen_at?: string | null
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          seen_at?: string | null
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pings_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "pings_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pings_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pings_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pings_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "pings_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pings_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pings_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_gateway_config: {
        Row: {
          api_key_encrypted: string | null
          created_at: string | null
          discord_webhook_url: string | null
          gateway_provider: string
          id: string
          is_active: boolean | null
          max_deposit: number | null
          min_deposit: number | null
          pix_key: string | null
          pix_key_type: string | null
          sandbox_mode: boolean | null
          updated_at: string | null
          updated_by: string | null
          webhook_secret_encrypted: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string | null
          discord_webhook_url?: string | null
          gateway_provider?: string
          id?: string
          is_active?: boolean | null
          max_deposit?: number | null
          min_deposit?: number | null
          pix_key?: string | null
          pix_key_type?: string | null
          sandbox_mode?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          webhook_secret_encrypted?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string | null
          discord_webhook_url?: string | null
          gateway_provider?: string
          id?: string
          is_active?: boolean | null
          max_deposit?: number | null
          min_deposit?: number | null
          pix_key?: string | null
          pix_key_type?: string | null
          sandbox_mode?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          webhook_secret_encrypted?: string | null
        }
        Relationships: []
      }
      pix_payments: {
        Row: {
          amount: number
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json | null
          paid_at: string | null
          pix_copy_paste: string | null
          pix_key: string | null
          pix_qr_code: string | null
          processing_time_ms: number | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          pix_copy_paste?: string | null
          pix_key?: string | null
          pix_qr_code?: string | null
          processing_time_ms?: number | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          pix_copy_paste?: string | null
          pix_key?: string | null
          pix_qr_code?: string | null
          processing_time_ms?: number | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_change_logs: {
        Row: {
          change_type: string
          created_at: string
          id: string
          metadata: Json | null
          new_plan: string
          old_plan: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          change_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_plan: string
          old_plan?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_plan?: string
          old_plan?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plan_content_items: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_content_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_content_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_content_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_content_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_addons: {
        Row: {
          compatible_plans: string[] | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          price_monthly: number
          slug: string
          updated_at: string | null
        }
        Insert: {
          compatible_plans?: string[] | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price_monthly?: number
          slug: string
          updated_at?: string | null
        }
        Update: {
          compatible_plans?: string[] | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_monthly?: number
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          created_at: string | null
          id: string
          option_order: number | null
          option_text: string
          poll_id: string
          votes_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          option_order?: number | null
          option_text: string
          poll_id: string
          votes_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          option_order?: number | null
          option_text?: string
          poll_id?: string
          votes_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          amount_paid: number | null
          created_at: string | null
          id: string
          option_id: string
          poll_id: string
          voter_id: string
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string | null
          id?: string
          option_id: string
          poll_id: string
          voter_id: string
        }
        Update: {
          amount_paid?: number | null
          created_at?: string | null
          id?: string
          option_id?: string
          poll_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "poll_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          allow_multiple_votes: boolean | null
          closes_at: string | null
          created_at: string | null
          creator_id: string
          entry_cost: number | null
          id: string
          is_active: boolean | null
          post_id: string | null
          question: string
          show_results_before_vote: boolean | null
          total_revenue: number | null
          total_votes: number | null
          updated_at: string | null
        }
        Insert: {
          allow_multiple_votes?: boolean | null
          closes_at?: string | null
          created_at?: string | null
          creator_id: string
          entry_cost?: number | null
          id?: string
          is_active?: boolean | null
          post_id?: string | null
          question: string
          show_results_before_vote?: boolean | null
          total_revenue?: number | null
          total_votes?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_multiple_votes?: boolean | null
          closes_at?: string | null
          created_at?: string | null
          creator_id?: string
          entry_cost?: number | null
          id?: string
          is_active?: boolean | null
          post_id?: string | null
          question?: string
          show_results_before_vote?: boolean | null
          total_revenue?: number | null
          total_votes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "polls_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "polls_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          depth: number | null
          id: string
          is_hidden: boolean
          is_seed: boolean | null
          likes_count: number | null
          mentioned_users: string[] | null
          parent_id: string | null
          post_id: string
          spam_reason: string | null
          spam_score: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          depth?: number | null
          id?: string
          is_hidden?: boolean
          is_seed?: boolean | null
          likes_count?: number | null
          mentioned_users?: string[] | null
          parent_id?: string | null
          post_id: string
          spam_reason?: string | null
          spam_score?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          depth?: number | null
          id?: string
          is_hidden?: boolean
          is_seed?: boolean | null
          likes_count?: number | null
          mentioned_users?: string[] | null
          parent_id?: string | null
          post_id?: string
          spam_reason?: string | null
          spam_score?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      post_dislikes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_dislikes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_dislikes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_dislikes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "post_dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          id: string
          is_seed: boolean | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_seed?: boolean | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_seed?: boolean | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      post_shares: {
        Row: {
          channel: string | null
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "post_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          allow_sharing: boolean | null
          comments_count: number | null
          content_text: string | null
          created_at: string | null
          dislikes_count: number | null
          file_size_bytes: number | null
          file_type: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          is_flash: boolean | null
          is_hidden: boolean | null
          is_locked: boolean | null
          is_paid: boolean | null
          is_seed: boolean | null
          likes_count: number | null
          media_type: string | null
          media_url: string | null
          media_urls: string[] | null
          original_filename: string | null
          paid_price: number | null
          post_type: string | null
          privacy_level: string | null
          saves_count: number
          share_link: string | null
          shares_count: number
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          video_duration_seconds: number | null
          video_hls_url: string | null
          video_master_url: string | null
          video_preview_url: string | null
          video_processing_status: string | null
        }
        Insert: {
          allow_sharing?: boolean | null
          comments_count?: number | null
          content_text?: string | null
          created_at?: string | null
          dislikes_count?: number | null
          file_size_bytes?: number | null
          file_type?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_flash?: boolean | null
          is_hidden?: boolean | null
          is_locked?: boolean | null
          is_paid?: boolean | null
          is_seed?: boolean | null
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          media_urls?: string[] | null
          original_filename?: string | null
          paid_price?: number | null
          post_type?: string | null
          privacy_level?: string | null
          saves_count?: number
          share_link?: string | null
          shares_count?: number
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
          video_duration_seconds?: number | null
          video_hls_url?: string | null
          video_master_url?: string | null
          video_preview_url?: string | null
          video_processing_status?: string | null
        }
        Update: {
          allow_sharing?: boolean | null
          comments_count?: number | null
          content_text?: string | null
          created_at?: string | null
          dislikes_count?: number | null
          file_size_bytes?: number | null
          file_type?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_flash?: boolean | null
          is_hidden?: boolean | null
          is_locked?: boolean | null
          is_paid?: boolean | null
          is_seed?: boolean | null
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          media_urls?: string[] | null
          original_filename?: string | null
          paid_price?: number | null
          post_type?: string | null
          privacy_level?: string | null
          saves_count?: number
          share_link?: string | null
          shares_count?: number
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
          video_duration_seconds?: number | null
          video_hls_url?: string | null
          video_master_url?: string | null
          video_preview_url?: string | null
          video_processing_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      presale_orders: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          notified_at: string | null
          payment_method: string
          price_paid: number
          status: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          notified_at?: string | null
          payment_method: string
          price_paid: number
          status?: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          notified_at?: string | null
          payment_method?: string
          price_paid?: number
          status?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presale_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presale_orders_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presale_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "presale_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presale_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presale_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      priority_message_transactions: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          message_id: string
          net_amount: number
          platform_fee: number | null
          receiver_profile_id: string
          sender_profile_id: string
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          message_id: string
          net_amount: number
          platform_fee?: number | null
          receiver_profile_id: string
          sender_profile_id: string
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          message_id?: string
          net_amount?: number
          platform_fee?: number | null
          receiver_profile_id?: string
          sender_profile_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "priority_message_transactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_message_transactions_receiver_profile_id_fkey"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "priority_message_transactions_receiver_profile_id_fkey"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_message_transactions_receiver_profile_id_fkey"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_message_transactions_receiver_profile_id_fkey"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_message_transactions_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "priority_message_transactions_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_message_transactions_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_message_transactions_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_likes: {
        Row: {
          created_at: string
          id: string
          is_ghost: boolean | null
          liked_id: string
          liker_id: string
          seen_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_ghost?: boolean | null
          liked_id: string
          liker_id: string
          seen_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_ghost?: boolean | null
          liked_id?: string
          liker_id?: string
          seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "profile_likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "profile_likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_visits: {
        Row: {
          id: string
          visited_at: string
          visited_id: string
          visitor_id: string
        }
        Insert: {
          id?: string
          visited_at?: string
          visited_id: string
          visitor_id: string
        }
        Update: {
          id?: string
          visited_at?: string
          visited_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_visits_visited_id_fkey"
            columns: ["visited_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "profile_visits_visited_id_fkey"
            columns: ["visited_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_visited_id_fkey"
            columns: ["visited_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_visited_id_fkey"
            columns: ["visited_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "profile_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accept_super_dm: boolean | null
          account_status: string | null
          address_cep: string | null
          address_city: string | null
          address_complement: string | null
          address_lat: number | null
          address_lng: number | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_verified: boolean | null
          asaas_wallet_id: string | null
          aura_xp: number
          avatar_url: string | null
          balance: number | null
          balance_frozen: boolean | null
          balance_frozen_at: string | null
          balance_frozen_by: string | null
          balance_frozen_reason: string | null
          ban_reason: string | null
          banned_at: string | null
          banned_by: string | null
          bio: string | null
          birth_date: string | null
          connection_mode: boolean | null
          cover_image_url: string | null
          cpf_cnpj: string | null
          created_at: string
          creator_referral_code: string | null
          creator_referral_expires_at: string | null
          device_settings: Json | null
          dm_setting: string | null
          dm_unlock_price: number
          external_clicks_count: number | null
          founder_terms_accepted_at: string | null
          frozen_until: string | null
          gender: string | null
          gender_other: string | null
          has_ghost_mode: boolean | null
          hide_age: boolean | null
          hide_location: boolean | null
          id: string
          is_anonymized: boolean | null
          is_creator: boolean | null
          is_ghost_active: boolean | null
          is_invisible: boolean | null
          is_lifetime: boolean
          is_looking_now: boolean | null
          is_oculto_verified: boolean
          is_online: boolean | null
          is_pioneiro: boolean | null
          is_private: boolean | null
          is_seed: boolean | null
          is_shadowbanned: boolean | null
          is_suspicious_flagged: boolean | null
          is_test_account: boolean | null
          is_verified: boolean | null
          is_verified_couple: boolean | null
          is_vip: boolean | null
          kyc_document_url: string | null
          kyc_selfie_url: string | null
          kyc_submitted_at: string | null
          kyc_type: string | null
          last_activity_at: string | null
          last_payment_reminder_at: string | null
          last_seen: string | null
          location_lat: number | null
          location_lng: number | null
          looking_now_since: string | null
          min_super_dm_price: number | null
          name: string
          notification_preferences: Json | null
          onboarding_completed: boolean
          onboarding_current_step: number
          onboarding_dismissed_forever: boolean
          onboarding_hide_until: string | null
          onboarding_intent: string | null
          onboarding_last_seen_at: string | null
          pair_bio: string | null
          pair_photos: string[] | null
          partner1_birth_date: string | null
          partner1_doc_verified: boolean | null
          partner1_name: string | null
          partner1_selfie_verified: boolean | null
          partner2_birth_date: string | null
          partner2_doc_verified: boolean | null
          partner2_name: string | null
          partner2_selfie_verified: boolean | null
          payment_due_date: string | null
          payment_reminder_count: number | null
          payment_status: string | null
          pending_balance: number
          phone_number: string | null
          pix_key: string | null
          pix_key_type: string | null
          plan_type: string | null
          profile_type: string | null
          ranking_anonymity: boolean | null
          referred_by_creator_id: string | null
          referred_by_share_code: string | null
          risk_flags: Json | null
          risk_level: string | null
          shadowban_reason: string | null
          shadowbanned_at: string | null
          shadowbanned_by: string | null
          show_fan_ranking: boolean | null
          show_on_radar: boolean | null
          show_online_status: boolean | null
          stripe_customer_id: string | null
          subscription_amount: number | null
          super_dm_auto_reply_enabled: boolean | null
          super_dm_auto_reply_message: string | null
          super_dm_earnings: number | null
          super_dm_estimated_response_hours: number | null
          suspicious_flag_reason: string | null
          suspicious_flagged_at: string | null
          tags_adult: string[] | null
          tags_social: string[] | null
          two_factor_enabled: boolean | null
          updated_at: string
          user_id: string
          username: string | null
          verification_deadline: string | null
          verification_reminder_sent: boolean | null
          vip_tier: string | null
          voice_bio_duration: number | null
          voice_bio_url: string | null
          warning_count: number | null
          whatsapp_promotions_opt_in: boolean | null
        }
        Insert: {
          accept_super_dm?: boolean | null
          account_status?: string | null
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_lat?: number | null
          address_lng?: number | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_verified?: boolean | null
          asaas_wallet_id?: string | null
          aura_xp?: number
          avatar_url?: string | null
          balance?: number | null
          balance_frozen?: boolean | null
          balance_frozen_at?: string | null
          balance_frozen_by?: string | null
          balance_frozen_reason?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          bio?: string | null
          birth_date?: string | null
          connection_mode?: boolean | null
          cover_image_url?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          creator_referral_code?: string | null
          creator_referral_expires_at?: string | null
          device_settings?: Json | null
          dm_setting?: string | null
          dm_unlock_price?: number
          external_clicks_count?: number | null
          founder_terms_accepted_at?: string | null
          frozen_until?: string | null
          gender?: string | null
          gender_other?: string | null
          has_ghost_mode?: boolean | null
          hide_age?: boolean | null
          hide_location?: boolean | null
          id?: string
          is_anonymized?: boolean | null
          is_creator?: boolean | null
          is_ghost_active?: boolean | null
          is_invisible?: boolean | null
          is_lifetime?: boolean
          is_looking_now?: boolean | null
          is_oculto_verified?: boolean
          is_online?: boolean | null
          is_pioneiro?: boolean | null
          is_private?: boolean | null
          is_seed?: boolean | null
          is_shadowbanned?: boolean | null
          is_suspicious_flagged?: boolean | null
          is_test_account?: boolean | null
          is_verified?: boolean | null
          is_verified_couple?: boolean | null
          is_vip?: boolean | null
          kyc_document_url?: string | null
          kyc_selfie_url?: string | null
          kyc_submitted_at?: string | null
          kyc_type?: string | null
          last_activity_at?: string | null
          last_payment_reminder_at?: string | null
          last_seen?: string | null
          location_lat?: number | null
          location_lng?: number | null
          looking_now_since?: string | null
          min_super_dm_price?: number | null
          name: string
          notification_preferences?: Json | null
          onboarding_completed?: boolean
          onboarding_current_step?: number
          onboarding_dismissed_forever?: boolean
          onboarding_hide_until?: string | null
          onboarding_intent?: string | null
          onboarding_last_seen_at?: string | null
          pair_bio?: string | null
          pair_photos?: string[] | null
          partner1_birth_date?: string | null
          partner1_doc_verified?: boolean | null
          partner1_name?: string | null
          partner1_selfie_verified?: boolean | null
          partner2_birth_date?: string | null
          partner2_doc_verified?: boolean | null
          partner2_name?: string | null
          partner2_selfie_verified?: boolean | null
          payment_due_date?: string | null
          payment_reminder_count?: number | null
          payment_status?: string | null
          pending_balance?: number
          phone_number?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          plan_type?: string | null
          profile_type?: string | null
          ranking_anonymity?: boolean | null
          referred_by_creator_id?: string | null
          referred_by_share_code?: string | null
          risk_flags?: Json | null
          risk_level?: string | null
          shadowban_reason?: string | null
          shadowbanned_at?: string | null
          shadowbanned_by?: string | null
          show_fan_ranking?: boolean | null
          show_on_radar?: boolean | null
          show_online_status?: boolean | null
          stripe_customer_id?: string | null
          subscription_amount?: number | null
          super_dm_auto_reply_enabled?: boolean | null
          super_dm_auto_reply_message?: string | null
          super_dm_earnings?: number | null
          super_dm_estimated_response_hours?: number | null
          suspicious_flag_reason?: string | null
          suspicious_flagged_at?: string | null
          tags_adult?: string[] | null
          tags_social?: string[] | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id: string
          username?: string | null
          verification_deadline?: string | null
          verification_reminder_sent?: boolean | null
          vip_tier?: string | null
          voice_bio_duration?: number | null
          voice_bio_url?: string | null
          warning_count?: number | null
          whatsapp_promotions_opt_in?: boolean | null
        }
        Update: {
          accept_super_dm?: boolean | null
          account_status?: string | null
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_lat?: number | null
          address_lng?: number | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_verified?: boolean | null
          asaas_wallet_id?: string | null
          aura_xp?: number
          avatar_url?: string | null
          balance?: number | null
          balance_frozen?: boolean | null
          balance_frozen_at?: string | null
          balance_frozen_by?: string | null
          balance_frozen_reason?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          bio?: string | null
          birth_date?: string | null
          connection_mode?: boolean | null
          cover_image_url?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          creator_referral_code?: string | null
          creator_referral_expires_at?: string | null
          device_settings?: Json | null
          dm_setting?: string | null
          dm_unlock_price?: number
          external_clicks_count?: number | null
          founder_terms_accepted_at?: string | null
          frozen_until?: string | null
          gender?: string | null
          gender_other?: string | null
          has_ghost_mode?: boolean | null
          hide_age?: boolean | null
          hide_location?: boolean | null
          id?: string
          is_anonymized?: boolean | null
          is_creator?: boolean | null
          is_ghost_active?: boolean | null
          is_invisible?: boolean | null
          is_lifetime?: boolean
          is_looking_now?: boolean | null
          is_oculto_verified?: boolean
          is_online?: boolean | null
          is_pioneiro?: boolean | null
          is_private?: boolean | null
          is_seed?: boolean | null
          is_shadowbanned?: boolean | null
          is_suspicious_flagged?: boolean | null
          is_test_account?: boolean | null
          is_verified?: boolean | null
          is_verified_couple?: boolean | null
          is_vip?: boolean | null
          kyc_document_url?: string | null
          kyc_selfie_url?: string | null
          kyc_submitted_at?: string | null
          kyc_type?: string | null
          last_activity_at?: string | null
          last_payment_reminder_at?: string | null
          last_seen?: string | null
          location_lat?: number | null
          location_lng?: number | null
          looking_now_since?: string | null
          min_super_dm_price?: number | null
          name?: string
          notification_preferences?: Json | null
          onboarding_completed?: boolean
          onboarding_current_step?: number
          onboarding_dismissed_forever?: boolean
          onboarding_hide_until?: string | null
          onboarding_intent?: string | null
          onboarding_last_seen_at?: string | null
          pair_bio?: string | null
          pair_photos?: string[] | null
          partner1_birth_date?: string | null
          partner1_doc_verified?: boolean | null
          partner1_name?: string | null
          partner1_selfie_verified?: boolean | null
          partner2_birth_date?: string | null
          partner2_doc_verified?: boolean | null
          partner2_name?: string | null
          partner2_selfie_verified?: boolean | null
          payment_due_date?: string | null
          payment_reminder_count?: number | null
          payment_status?: string | null
          pending_balance?: number
          phone_number?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          plan_type?: string | null
          profile_type?: string | null
          ranking_anonymity?: boolean | null
          referred_by_creator_id?: string | null
          referred_by_share_code?: string | null
          risk_flags?: Json | null
          risk_level?: string | null
          shadowban_reason?: string | null
          shadowbanned_at?: string | null
          shadowbanned_by?: string | null
          show_fan_ranking?: boolean | null
          show_on_radar?: boolean | null
          show_online_status?: boolean | null
          stripe_customer_id?: string | null
          subscription_amount?: number | null
          super_dm_auto_reply_enabled?: boolean | null
          super_dm_auto_reply_message?: string | null
          super_dm_earnings?: number | null
          super_dm_estimated_response_hours?: number | null
          suspicious_flag_reason?: string | null
          suspicious_flagged_at?: string | null
          tags_adult?: string[] | null
          tags_social?: string[] | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          username?: string | null
          verification_deadline?: string | null
          verification_reminder_sent?: boolean | null
          vip_tier?: string | null
          voice_bio_duration?: number | null
          voice_bio_url?: string | null
          warning_count?: number | null
          whatsapp_promotions_opt_in?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_creator_id_fkey"
            columns: ["referred_by_creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "profiles_referred_by_creator_id_fkey"
            columns: ["referred_by_creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_creator_id_fkey"
            columns: ["referred_by_creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_creator_id_fkey"
            columns: ["referred_by_creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_shadowbanned_by_fkey"
            columns: ["shadowbanned_by"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "profiles_shadowbanned_by_fkey"
            columns: ["shadowbanned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_shadowbanned_by_fkey"
            columns: ["shadowbanned_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_shadowbanned_by_fkey"
            columns: ["shadowbanned_by"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          promotion_id: string
          session_hash: string | null
          time_period: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          promotion_id: string
          session_hash?: string | null
          time_period?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          promotion_id?: string
          session_hash?: string | null
          time_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_events_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_whatsapp_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          phone: string
          promotion_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone: string
          promotion_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone?: string
          promotion_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_whatsapp_logs_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_whatsapp_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "promotion_whatsapp_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_whatsapp_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_whatsapp_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          banner_text: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean
          notify_whatsapp: boolean | null
          reward_value: number | null
          rules: string | null
          start_date: string | null
          title: string
          type: Database["public"]["Enums"]["promotion_type"]
          updated_at: string
          whatsapp_audience: string | null
          whatsapp_error_count: number | null
          whatsapp_sent_at: string | null
          whatsapp_sent_count: number | null
          whatsapp_status: string | null
        }
        Insert: {
          banner_text?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          notify_whatsapp?: boolean | null
          reward_value?: number | null
          rules?: string | null
          start_date?: string | null
          title: string
          type?: Database["public"]["Enums"]["promotion_type"]
          updated_at?: string
          whatsapp_audience?: string | null
          whatsapp_error_count?: number | null
          whatsapp_sent_at?: string | null
          whatsapp_sent_count?: number | null
          whatsapp_status?: string | null
        }
        Update: {
          banner_text?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          notify_whatsapp?: boolean | null
          reward_value?: number | null
          rules?: string | null
          start_date?: string | null
          title?: string
          type?: Database["public"]["Enums"]["promotion_type"]
          updated_at?: string
          whatsapp_audience?: string | null
          whatsapp_error_count?: number | null
          whatsapp_sent_at?: string | null
          whatsapp_sent_count?: number | null
          whatsapp_status?: string | null
        }
        Relationships: []
      }
      public_activities: {
        Row: {
          activity_type: string
          actor_avatar_url: string | null
          actor_id: string | null
          actor_name: string
          amount: number | null
          created_at: string
          id: string
          is_anonymous: boolean
          is_seed: boolean
          metadata: Json | null
          target_creator_id: string | null
          target_creator_name: string
        }
        Insert: {
          activity_type: string
          actor_avatar_url?: string | null
          actor_id?: string | null
          actor_name: string
          amount?: number | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          is_seed?: boolean
          metadata?: Json | null
          target_creator_id?: string | null
          target_creator_name: string
        }
        Update: {
          activity_type?: string
          actor_avatar_url?: string | null
          actor_id?: string | null
          actor_name?: string
          amount?: number | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          is_seed?: boolean
          metadata?: Json | null
          target_creator_id?: string | null
          target_creator_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "public_activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_activities_target_creator_id_fkey"
            columns: ["target_creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "public_activities_target_creator_id_fkey"
            columns: ["target_creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_activities_target_creator_id_fkey"
            columns: ["target_creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_activities_target_creator_id_fkey"
            columns: ["target_creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      push_automations: {
        Row: {
          created_at: string | null
          created_by: string | null
          custom_body: string | null
          custom_title: string | null
          delay_minutes: number | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sent_count: number | null
          template_id: string | null
          trigger_conditions: Json | null
          trigger_event: string
          triggered_count: number | null
          updated_at: string | null
          url_pattern: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          custom_body?: string | null
          custom_title?: string | null
          delay_minutes?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sent_count?: number | null
          template_id?: string | null
          trigger_conditions?: Json | null
          trigger_event: string
          triggered_count?: number | null
          updated_at?: string | null
          url_pattern?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          custom_body?: string | null
          custom_title?: string | null
          delay_minutes?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sent_count?: number | null
          template_id?: string | null
          trigger_conditions?: Json | null
          trigger_event?: string
          triggered_count?: number | null
          updated_at?: string | null
          url_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_automations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "push_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      push_campaign_deliveries: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          sent_at: string | null
          status: string | null
          token_id: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          token_id?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          token_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_campaign_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "push_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      push_campaigns: {
        Row: {
          body: string
          clicked_count: number | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          delivered_count: number | null
          failed_count: number | null
          icon: string | null
          id: string
          image_url: string | null
          is_scheduled: boolean | null
          scheduled_for: string | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          target_segment: string | null
          target_type: string
          target_user_ids: string[] | null
          title: string
          total_recipients: number | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          body: string
          clicked_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          failed_count?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_scheduled?: boolean | null
          scheduled_for?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_segment?: string | null
          target_type?: string
          target_user_ids?: string[] | null
          title: string
          total_recipients?: number | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          body?: string
          clicked_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          failed_count?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_scheduled?: boolean | null
          scheduled_for?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_segment?: string | null
          target_type?: string
          target_user_ids?: string[] | null
          title?: string
          total_recipients?: number | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      push_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string | null
          created_by: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          title: string
          updated_at: string | null
          url: string | null
          usage_count: number | null
          variables: Json | null
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          title: string
          updated_at?: string | null
          url?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          title?: string
          updated_at?: string | null
          url?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          last_used_at: string | null
          platform: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          platform?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          platform?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      qa_checklists: {
        Row: {
          admin_id: string
          checklist_data: Json | null
          created_at: string | null
          id: string
          last_updated: string | null
          plan_type: string
        }
        Insert: {
          admin_id: string
          checklist_data?: Json | null
          created_at?: string | null
          id?: string
          last_updated?: string | null
          plan_type: string
        }
        Update: {
          admin_id?: string
          checklist_data?: Json | null
          created_at?: string | null
          id?: string
          last_updated?: string | null
          plan_type?: string
        }
        Relationships: []
      }
      reengagement_rules: {
        Row: {
          action_type: string
          cooldown_days: number | null
          coupon_discount: number | null
          coupon_valid_days: number | null
          created_at: string
          delay_minutes: number | null
          description: string | null
          email_template_id: string | null
          id: string
          is_active: boolean
          max_per_user: number | null
          name: string
          priority: number | null
          push_body: string | null
          push_title: string | null
          stats: Json | null
          trigger_condition: string
          updated_at: string
        }
        Insert: {
          action_type: string
          cooldown_days?: number | null
          coupon_discount?: number | null
          coupon_valid_days?: number | null
          created_at?: string
          delay_minutes?: number | null
          description?: string | null
          email_template_id?: string | null
          id?: string
          is_active?: boolean
          max_per_user?: number | null
          name: string
          priority?: number | null
          push_body?: string | null
          push_title?: string | null
          stats?: Json | null
          trigger_condition: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          cooldown_days?: number | null
          coupon_discount?: number | null
          coupon_valid_days?: number | null
          created_at?: string
          delay_minutes?: number | null
          description?: string | null
          email_template_id?: string | null
          id?: string
          is_active?: boolean
          max_per_user?: number | null
          name?: string
          priority?: number | null
          push_body?: string | null
          push_title?: string | null
          stats?: Json | null
          trigger_condition?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reengagement_rules_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_affiliates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          current_level: number | null
          custom_slug: string | null
          id: string
          parent_affiliate_id: string | null
          payout_details: Json | null
          payout_method: string | null
          pending_commission: number | null
          program_id: string
          referral_code: string
          status: string | null
          total_clicks: number | null
          total_commission_earned: number | null
          total_commission_paid: number | null
          total_conversions: number | null
          total_revenue_generated: number | null
          total_signups: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          current_level?: number | null
          custom_slug?: string | null
          id?: string
          parent_affiliate_id?: string | null
          payout_details?: Json | null
          payout_method?: string | null
          pending_commission?: number | null
          program_id: string
          referral_code: string
          status?: string | null
          total_clicks?: number | null
          total_commission_earned?: number | null
          total_commission_paid?: number | null
          total_conversions?: number | null
          total_revenue_generated?: number | null
          total_signups?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          current_level?: number | null
          custom_slug?: string | null
          id?: string
          parent_affiliate_id?: string | null
          payout_details?: Json | null
          payout_method?: string | null
          pending_commission?: number | null
          program_id?: string
          referral_code?: string
          status?: string | null
          total_clicks?: number | null
          total_commission_earned?: number | null
          total_commission_paid?: number | null
          total_conversions?: number | null
          total_revenue_generated?: number | null
          total_signups?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_affiliates_parent_affiliate_id_fkey"
            columns: ["parent_affiliate_id"]
            isOneToOne: false
            referencedRelation: "referral_affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_affiliates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "referral_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          affiliate_id: string
          browser: string | null
          converted: boolean | null
          converted_at: string | null
          converted_user_id: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          id: string
          ip_hash: string | null
          landing_page: string | null
          referer: string | null
          region: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          affiliate_id: string
          browser?: string | null
          converted?: boolean | null
          converted_at?: string | null
          converted_user_id?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          referer?: string | null
          region?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          affiliate_id?: string
          browser?: string | null
          converted?: boolean | null
          converted_at?: string | null
          converted_user_id?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          referer?: string | null
          region?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "referral_affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_commissions: {
        Row: {
          affiliate_id: string
          commission_amount: number
          commission_rate: number
          created_at: string | null
          id: string
          is_recurring: boolean
          level: number | null
          paid_at: string | null
          payout_id: string | null
          referral_user_id: string | null
          source_amount: number
          source_id: string | null
          source_type: string
          status: string | null
        }
        Insert: {
          affiliate_id: string
          commission_amount: number
          commission_rate: number
          created_at?: string | null
          id?: string
          is_recurring?: boolean
          level?: number | null
          paid_at?: string | null
          payout_id?: string | null
          referral_user_id?: string | null
          source_amount: number
          source_id?: string | null
          source_type: string
          status?: string | null
        }
        Update: {
          affiliate_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string | null
          id?: string
          is_recurring?: boolean
          level?: number | null
          paid_at?: string | null
          payout_id?: string | null
          referral_user_id?: string | null
          source_amount?: number
          source_id?: string | null
          source_type?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "referral_affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_referral_user_id_fkey"
            columns: ["referral_user_id"]
            isOneToOne: false
            referencedRelation: "referral_users"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_milestones: {
        Row: {
          achieved_at: string | null
          affiliate_id: string
          bonus_amount: number | null
          bonus_type: string | null
          claimed_at: string | null
          id: string
          milestone_type: string
          milestone_value: number
        }
        Insert: {
          achieved_at?: string | null
          affiliate_id: string
          bonus_amount?: number | null
          bonus_type?: string | null
          claimed_at?: string | null
          id?: string
          milestone_type: string
          milestone_value: number
        }
        Update: {
          achieved_at?: string | null
          affiliate_id?: string
          bonus_amount?: number | null
          bonus_type?: string | null
          claimed_at?: string | null
          id?: string
          milestone_type?: string
          milestone_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_milestones_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "referral_affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_payouts: {
        Row: {
          affiliate_id: string
          amount: number
          commissions_count: number | null
          created_at: string | null
          error_message: string | null
          fee: number | null
          id: string
          net_amount: number
          payout_details: Json | null
          payout_method: string
          period_end: string | null
          period_start: string | null
          processed_at: string | null
          processed_by: string | null
          status: string | null
          transaction_id: string | null
        }
        Insert: {
          affiliate_id: string
          amount: number
          commissions_count?: number | null
          created_at?: string | null
          error_message?: string | null
          fee?: number | null
          id?: string
          net_amount: number
          payout_details?: Json | null
          payout_method: string
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          transaction_id?: string | null
        }
        Update: {
          affiliate_id?: string
          amount?: number
          commissions_count?: number | null
          created_at?: string | null
          error_message?: string | null
          fee?: number | null
          id?: string
          net_amount?: number
          payout_details?: Json | null
          payout_method?: string
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "referral_affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_programs: {
        Row: {
          commission_rate: number
          commission_type: string
          created_at: string | null
          description: string | null
          first_sale_bonus: number | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          level_rates: Json | null
          max_levels: number | null
          milestone_bonuses: Json | null
          min_referrals_to_activate: number | null
          min_revenue_to_withdraw: number | null
          name: string
          program_type: string
          recurring_commission: boolean | null
          recurring_months: number | null
          signup_bonus: number | null
          updated_at: string | null
        }
        Insert: {
          commission_rate?: number
          commission_type?: string
          created_at?: string | null
          description?: string | null
          first_sale_bonus?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          level_rates?: Json | null
          max_levels?: number | null
          milestone_bonuses?: Json | null
          min_referrals_to_activate?: number | null
          min_revenue_to_withdraw?: number | null
          name: string
          program_type?: string
          recurring_commission?: boolean | null
          recurring_months?: number | null
          signup_bonus?: number | null
          updated_at?: string | null
        }
        Update: {
          commission_rate?: number
          commission_type?: string
          created_at?: string | null
          description?: string | null
          first_sale_bonus?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          level_rates?: Json | null
          max_levels?: number | null
          milestone_bonuses?: Json | null
          min_referrals_to_activate?: number | null
          min_revenue_to_withdraw?: number | null
          name?: string
          program_type?: string
          recurring_commission?: boolean | null
          recurring_months?: number | null
          signup_bonus?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      referral_tree: {
        Row: {
          child_id: string
          created_at: string
          id: string
          level: number | null
          parent_id: string
          referral_source: string | null
          status: string | null
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          level?: number | null
          parent_id: string
          referral_source?: string | null
          status?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          level?: number | null
          parent_id?: string
          referral_source?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_tree_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "referral_tree_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tree_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tree_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tree_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "referral_tree_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tree_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tree_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_users: {
        Row: {
          affiliate_id: string
          churned_at: string | null
          click_id: string | null
          commission_generated: number | null
          first_purchase_at: string | null
          id: string
          last_purchase_at: string | null
          lifetime_value: number | null
          referred_user_id: string
          signed_up_at: string | null
          status: string | null
        }
        Insert: {
          affiliate_id: string
          churned_at?: string | null
          click_id?: string | null
          commission_generated?: number | null
          first_purchase_at?: string | null
          id?: string
          last_purchase_at?: string | null
          lifetime_value?: number | null
          referred_user_id: string
          signed_up_at?: string | null
          status?: string | null
        }
        Update: {
          affiliate_id?: string
          churned_at?: string | null
          click_id?: string | null
          commission_generated?: number | null
          first_purchase_at?: string | null
          id?: string
          last_purchase_at?: string | null
          lifetime_value?: number | null
          referred_user_id?: string
          signed_up_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_users_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "referral_affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_users_click_id_fkey"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "referral_clicks"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          commission_ended_at: string | null
          id: string
          is_active: boolean | null
          referred_user_id: string
          referrer_id: string
          started_at: string | null
          subscription_id: string | null
        }
        Insert: {
          commission_ended_at?: string | null
          id?: string
          is_active?: boolean | null
          referred_user_id: string
          referrer_id: string
          started_at?: string | null
          subscription_id?: string | null
        }
        Update: {
          commission_ended_at?: string | null
          id?: string
          is_active?: boolean | null
          referred_user_id?: string
          referrer_id?: string
          started_at?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      resend_config: {
        Row: {
          api_key_encrypted: string | null
          created_at: string | null
          from_email: string | null
          from_name: string | null
          id: string
          is_active: boolean | null
          sandbox_mode: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean | null
          sandbox_mode?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean | null
          sandbox_mode?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      reward_redemptions: {
        Row: {
          completed_at: string | null
          cost_credits: number | null
          cost_xp: number | null
          created_at: string
          delivery_details: Json | null
          id: string
          reward_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          cost_credits?: number | null
          cost_xp?: number | null
          created_at?: string
          delivery_details?: Json | null
          id?: string
          reward_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          cost_credits?: number | null
          cost_xp?: number | null
          created_at?: string
          delivery_details?: Json | null
          id?: string
          reward_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "reward_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          available_from: string | null
          available_until: string | null
          color: string | null
          cost_credits: number | null
          cost_xp: number
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_limited: boolean | null
          min_level: number | null
          name: string
          redemption_count: number | null
          reward_type: string
          stock: number | null
          value: Json
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          color?: string | null
          cost_credits?: number | null
          cost_xp?: number
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_limited?: boolean | null
          min_level?: number | null
          name: string
          redemption_count?: number | null
          reward_type: string
          stock?: number | null
          value: Json
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          color?: string | null
          cost_credits?: number | null
          cost_xp?: number
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_limited?: boolean | null
          min_level?: number | null
          name?: string
          redemption_count?: number | null
          reward_type?: string
          stock?: number | null
          value?: Json
        }
        Relationships: []
      }
      safety_alerts: {
        Row: {
          alert_type: string
          authorities_notified: boolean | null
          authorities_notified_at: string | null
          checkin_id: string
          contacts_notified: Json | null
          created_at: string
          id: string
          responded_at: string | null
          response_notes: string | null
          response_type: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          authorities_notified?: boolean | null
          authorities_notified_at?: string | null
          checkin_id: string
          contacts_notified?: Json | null
          created_at?: string
          id?: string
          responded_at?: string | null
          response_notes?: string | null
          response_type?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          authorities_notified?: boolean | null
          authorities_notified_at?: string | null
          checkin_id?: string
          contacts_notified?: Json | null
          created_at?: string
          id?: string
          responded_at?: string | null
          response_notes?: string | null
          response_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_alerts_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "safety_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_checkins: {
        Row: {
          alert_sent_at: string | null
          checked_in_at: string | null
          checkin_type: string
          created_at: string
          emergency_contacts: Json | null
          emergency_message: string | null
          grace_period_minutes: number | null
          id: string
          location_description: string | null
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          related_event_id: string | null
          related_user_id: string | null
          scheduled_at: string
          share_location_with_contacts: boolean | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_sent_at?: string | null
          checked_in_at?: string | null
          checkin_type: string
          created_at?: string
          emergency_contacts?: Json | null
          emergency_message?: string | null
          grace_period_minutes?: number | null
          id?: string
          location_description?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          related_event_id?: string | null
          related_user_id?: string | null
          scheduled_at: string
          share_location_with_contacts?: boolean | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_sent_at?: string | null
          checked_in_at?: string | null
          checkin_type?: string
          created_at?: string
          emergency_contacts?: Json | null
          emergency_message?: string | null
          grace_period_minutes?: number | null
          id?: string
          location_description?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          related_event_id?: string | null
          related_user_id?: string | null
          scheduled_at?: string
          share_location_with_contacts?: boolean | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_checkins_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_checkins_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "safety_checkins_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_checkins_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_checkins_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "saved_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshot_alerts: {
        Row: {
          chat_id: string
          created_at: string | null
          detected_by: string
          id: string
          notified_user: string
        }
        Insert: {
          chat_id: string
          created_at?: string | null
          detected_by: string
          id?: string
          notified_user: string
        }
        Update: {
          chat_id?: string
          created_at?: string | null
          detected_by?: string
          id?: string
          notified_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenshot_alerts_detected_by_fkey"
            columns: ["detected_by"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "screenshot_alerts_detected_by_fkey"
            columns: ["detected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_alerts_detected_by_fkey"
            columns: ["detected_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_alerts_detected_by_fkey"
            columns: ["detected_by"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_alerts_notified_user_fkey"
            columns: ["notified_user"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "screenshot_alerts_notified_user_fkey"
            columns: ["notified_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_alerts_notified_user_fkey"
            columns: ["notified_user"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_alerts_notified_user_fkey"
            columns: ["notified_user"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      share_click_tracking: {
        Row: {
          confirmed_age: boolean | null
          converted: boolean | null
          converted_user_id: string | null
          created_at: string | null
          id: string
          ip_hash: string | null
          promotion_id: string | null
          referrer_id: string | null
          session_hash: string | null
          share_code: string
          user_agent: string | null
        }
        Insert: {
          confirmed_age?: boolean | null
          converted?: boolean | null
          converted_user_id?: string | null
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          promotion_id?: string | null
          referrer_id?: string | null
          session_hash?: string | null
          share_code: string
          user_agent?: string | null
        }
        Update: {
          confirmed_age?: boolean | null
          converted?: boolean | null
          converted_user_id?: string | null
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          promotion_id?: string | null
          referrer_id?: string | null
          session_hash?: string | null
          share_code?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_click_tracking_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "share_click_tracking_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_click_tracking_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_click_tracking_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_click_tracking_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "share_click_tracking_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_click_tracking_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_click_tracking_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      site_images: {
        Row: {
          alt_text: string | null
          created_at: string | null
          id: string
          image_key: string
          image_url: string
          section_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          id?: string
          image_key: string
          image_url: string
          section_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          id?: string
          image_key?: string
          image_url?: string
          section_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_images_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "site_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      site_sections: {
        Row: {
          content: Json
          created_at: string | null
          display_order: number | null
          id: string
          is_visible: boolean | null
          section_key: string
          section_name: string
          section_type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          content?: Json
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          section_key: string
          section_name: string
          section_type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content?: Json
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          section_key?: string
          section_name?: string
          section_type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      spin_prizes: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          prize_type: string
          probability: number
          value: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          prize_type: string
          probability: number
          value?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          prize_type?: string
          probability?: number
          value?: number | null
        }
        Relationships: []
      }
      story_dislikes: {
        Row: {
          created_at: string | null
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_dislikes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_dislikes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_dislikes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "story_dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      story_likes: {
        Row: {
          created_at: string | null
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string | null
          viewer_id: string
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string | null
          viewer_id: string
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string | null
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_coupon_uses: {
        Row: {
          coupon_id: string
          discount_applied: number
          final_price: number
          id: string
          original_price: number
          subscription_id: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          discount_applied: number
          final_price: number
          id?: string
          original_price: number
          subscription_id?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          discount_applied?: number
          final_price?: number
          id?: string
          original_price?: number
          subscription_id?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_coupon_uses_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "subscription_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_coupons: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          expires_at_display: string | null
          id: string
          is_active: boolean | null
          is_first_subscription_only: boolean | null
          max_uses: number | null
          name: string
          starts_at: string
          terms_conditions: string | null
          updated_at: string | null
          valid_for_plans: string[] | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          expires_at_display?: string | null
          id?: string
          is_active?: boolean | null
          is_first_subscription_only?: boolean | null
          max_uses?: number | null
          name: string
          starts_at?: string
          terms_conditions?: string | null
          updated_at?: string | null
          valid_for_plans?: string[] | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          expires_at_display?: string | null
          id?: string
          is_active?: boolean | null
          is_first_subscription_only?: boolean | null
          max_uses?: number | null
          name?: string
          starts_at?: string
          terms_conditions?: string | null
          updated_at?: string | null
          valid_for_plans?: string[] | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          annual_price: number | null
          banner_url: string | null
          bio: string | null
          created_at: string
          id: string
          is_enabled: boolean
          lifetime_price: number | null
          monthly_price: number
          profile_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          annual_price?: number | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          lifetime_price?: number | null
          monthly_price?: number
          profile_id: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Update: {
          annual_price?: number | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          lifetime_price?: number | null
          monthly_price?: number
          profile_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string | null
          creator_id: string
          expires_at: string | null
          id: string
          price: number | null
          status: string | null
          subscriber_id: string
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          expires_at?: string | null
          id?: string
          price?: number | null
          status?: string | null
          subscriber_id: string
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          expires_at?: string | null
          id?: string
          price?: number | null
          status?: string | null
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "subscriptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "subscriptions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_response: string | null
          attachment_url: string | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          priority: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          attachment_url?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_response?: string | null
          attachment_url?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      third_party_integrations: {
        Row: {
          config: Json | null
          created_at: string | null
          created_by: string | null
          credentials: Json | null
          error_message: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          name: string
          provider: string
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          credentials?: Json | null
          error_message?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          name: string
          provider: string
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          credentials?: Json | null
          error_message?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          name?: string
          provider?: string
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      time_locked_albums: {
        Row: {
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          title: string
          unlock_at: string | null
          unlock_duration_hours: number | null
          unlock_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          unlock_at?: string | null
          unlock_duration_hours?: number | null
          unlock_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          unlock_at?: string | null
          unlock_duration_hours?: number | null
          unlock_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_locked_albums_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "time_locked_albums_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_locked_albums_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_locked_albums_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_logs: {
        Row: {
          amount_bruto: number
          amount_imposto: number
          amount_liquido_criador: number
          amount_taxa_afiliado: number
          amount_taxa_casa: number
          created_at: string
          id: string
          payment_id: string | null
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          amount_bruto: number
          amount_imposto?: number
          amount_liquido_criador?: number
          amount_taxa_afiliado?: number
          amount_taxa_casa?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          amount_bruto?: number
          amount_imposto?: number
          amount_liquido_criador?: number
          amount_taxa_afiliado?: number
          amount_taxa_casa?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transaction_split_logs: {
        Row: {
          affiliate_amount: number
          affiliate_id: string | null
          affiliate_rate: number
          base_amount: number
          created_at: string
          creator_amount: number
          creator_id: string | null
          flow_type: string
          gross_amount: number
          id: string
          payment_external_id: string
          platform_amount: number
          platform_rate: number
          provider: string | null
          tax_amount: number
          tax_rate: number
          transaction_id: string
        }
        Insert: {
          affiliate_amount?: number
          affiliate_id?: string | null
          affiliate_rate?: number
          base_amount: number
          created_at?: string
          creator_amount?: number
          creator_id?: string | null
          flow_type: string
          gross_amount: number
          id?: string
          payment_external_id: string
          platform_amount?: number
          platform_rate?: number
          provider?: string | null
          tax_amount?: number
          tax_rate?: number
          transaction_id: string
        }
        Update: {
          affiliate_amount?: number
          affiliate_id?: string | null
          affiliate_rate?: number
          base_amount?: number
          created_at?: string
          creator_amount?: number
          creator_id?: string | null
          flow_type?: string
          gross_amount?: number
          id?: string
          payment_external_id?: string
          platform_amount?: number
          platform_rate?: number
          provider?: string | null
          tax_amount?: number
          tax_rate?: number
          transaction_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          affiliate_id: string | null
          amount: number
          category: string
          completed_at: string | null
          created_at: string | null
          description: string | null
          expires_at: string | null
          external_id: string | null
          id: string
          metadata: Json | null
          provider: string | null
          seller_id: string | null
          status: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          affiliate_id?: string | null
          amount: number
          category?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          provider?: string | null
          seller_id?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          affiliate_id?: string | null
          amount?: number
          category?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          provider?: string | null
          seller_id?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "transactions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      typing_indicators: {
        Row: {
          conversation_id: string
          id: string
          is_typing: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_typing?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_typing?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_indicators_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          id: string
          notified: boolean | null
          progress: number | null
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          id?: string
          notified?: boolean | null
          progress?: number | null
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          id?: string
          notified?: boolean | null
          progress?: number | null
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_balances: {
        Row: {
          balance_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string | null
          credits_balance: number | null
          credits_frozen: boolean | null
          frozen_at: string | null
          frozen_by: string | null
          frozen_reason: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_balance?: number | null
          credits_frozen?: boolean | null
          frozen_at?: string | null
          frozen_by?: string | null
          frozen_reason?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_balance?: number | null
          credits_frozen?: boolean | null
          frozen_at?: string | null
          frozen_by?: string | null
          frozen_reason?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "user_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_limits: {
        Row: {
          created_at: string | null
          current_count: number | null
          id: string
          limit_type: string
          reset_date: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_count?: number | null
          id?: string
          limit_type: string
          reset_date?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_count?: number | null
          id?: string
          limit_type?: string
          reset_date?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          admin_response: string | null
          created_at: string
          description: string | null
          id: string
          responded_at: string | null
          responded_by: string | null
          reward_coupon_code: string | null
          reward_discount: number | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          description?: string | null
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          reward_coupon_code?: string | null
          reward_discount?: number | null
          status?: string
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          description?: string | null
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          reward_coupon_code?: string | null
          reward_discount?: number | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_levels: {
        Row: {
          created_at: string
          current_level: number
          current_xp: number
          id: string
          last_activity_date: string | null
          level_up_xp: number
          streak_days: number
          total_xp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_level?: number
          current_xp?: number
          id?: string
          last_activity_date?: string | null
          level_up_xp?: number
          streak_days?: number
          total_xp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_level?: number
          current_xp?: number
          id?: string
          last_activity_date?: string | null
          level_up_xp?: number
          streak_days?: number
          total_xp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_levels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "user_levels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_levels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_levels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          digest_frequency: string | null
          digest_mode: boolean | null
          email_enabled: boolean | null
          id: string
          marketing_enabled: boolean | null
          push_enabled: boolean | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          reminders_enabled: boolean | null
          social_enabled: boolean | null
          transactional_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          digest_frequency?: string | null
          digest_mode?: boolean | null
          email_enabled?: boolean | null
          id?: string
          marketing_enabled?: boolean | null
          push_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reminders_enabled?: boolean | null
          social_enabled?: boolean | null
          transactional_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          digest_frequency?: string | null
          digest_mode?: boolean | null
          email_enabled?: boolean | null
          id?: string
          marketing_enabled?: boolean | null
          push_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reminders_enabled?: boolean | null
          social_enabled?: boolean | null
          transactional_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_payment_cards: {
        Row: {
          card_brand: string | null
          card_expiry_month: number
          card_expiry_year: number
          card_holder_name: string
          card_last_four: string
          created_at: string
          id: string
          is_default: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_expiry_month: number
          card_expiry_year: number
          card_holder_name: string
          card_last_four: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_expiry_month?: number
          card_expiry_year?: number
          card_holder_name?: string
          card_last_four?: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_payment_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "user_payment_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_payment_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_payment_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reengagement_history: {
        Row: {
          channel: string | null
          converted_at: string | null
          coupon_code: string | null
          id: string
          metadata: Json | null
          rule_id: string
          sent_at: string | null
          triggered_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          converted_at?: string | null
          coupon_code?: string | null
          id?: string
          metadata?: Json | null
          rule_id: string
          sent_at?: string | null
          triggered_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          converted_at?: string | null
          coupon_code?: string | null
          id?: string
          metadata?: Json | null
          rule_id?: string
          sent_at?: string | null
          triggered_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reengagement_history_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reengagement_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string | null
          device_type: string | null
          id: string
          interactions: number | null
          page_views: number | null
          referrer: string | null
          session_end: string | null
          session_start: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          device_type?: string | null
          id?: string
          interactions?: number | null
          page_views?: number | null
          referrer?: string | null
          session_end?: string | null
          session_start?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          device_type?: string | null
          id?: string
          interactions?: number | null
          page_views?: number | null
          referrer?: string | null
          session_end?: string | null
          session_start?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_trust_scores: {
        Row: {
          activity_points: number | null
          created_at: string | null
          id: string
          last_calculated_at: string | null
          profile_completion_points: number | null
          report_penalty: number | null
          response_rate_points: number | null
          score: number | null
          updated_at: string | null
          user_id: string
          verification_points: number | null
        }
        Insert: {
          activity_points?: number | null
          created_at?: string | null
          id?: string
          last_calculated_at?: string | null
          profile_completion_points?: number | null
          report_penalty?: number | null
          response_rate_points?: number | null
          score?: number | null
          updated_at?: string | null
          user_id: string
          verification_points?: number | null
        }
        Update: {
          activity_points?: number | null
          created_at?: string | null
          id?: string
          last_calculated_at?: string | null
          profile_completion_points?: number | null
          report_penalty?: number | null
          response_rate_points?: number | null
          score?: number | null
          updated_at?: string | null
          user_id?: string
          verification_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_trust_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "user_trust_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_trust_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_trust_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_access_logs: {
        Row: {
          action: string
          created_at: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean | null
          user_agent: string | null
          user_id: string
          vault_item_id: string
        }
        Insert: {
          action: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id: string
          vault_item_id: string
        }
        Update: {
          action?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string
          vault_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "vault_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_access_logs_vault_item_id_fkey"
            columns: ["vault_item_id"]
            isOneToOne: false
            referencedRelation: "media_vault"
            referencedColumns: ["id"]
          },
        ]
      }
      video_transcoding_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          hls_manifest_url: string | null
          id: string
          master_url: string | null
          metadata: Json | null
          original_url: string
          post_id: string | null
          preview_url: string | null
          progress: number | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          hls_manifest_url?: string | null
          id?: string
          master_url?: string | null
          metadata?: Json | null
          original_url: string
          post_id?: string | null
          preview_url?: string | null
          progress?: number | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          hls_manifest_url?: string | null
          id?: string
          master_url?: string | null
          metadata?: Json | null
          original_url?: string
          post_id?: string | null
          preview_url?: string | null
          progress?: number | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_transcoding_jobs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_transcoding_jobs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_transcoding_jobs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_secure_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          converted_at: string | null
          created_at: string | null
          email: string
          id: string
          invited_at: string | null
          name: string | null
          priority_score: number | null
          referral_code: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          invited_at?: string | null
          name?: string | null
          priority_score?: number | null
          referral_code?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          name?: string | null
          priority_score?: number | null
          referral_code?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      webhook_endpoints: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          events: string[]
          headers: Json | null
          id: string
          is_active: boolean | null
          name: string
          retry_count: number | null
          secret_key: string
          timeout_ms: number | null
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          events?: string[]
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          retry_count?: number | null
          secret_key?: string
          timeout_ms?: number | null
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          events?: string[]
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          retry_count?: number | null
          secret_key?: string
          timeout_ms?: number | null
          updated_at?: string | null
          url?: string
        }
        Relationships: []
      }
      webhook_event_types: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          payload_schema: Json | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          payload_schema?: Json | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          payload_schema?: Json | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          attempt_number: number | null
          created_at: string | null
          endpoint_id: string | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          response_time_ms: number | null
          success: boolean | null
        }
        Insert: {
          attempt_number?: number | null
          created_at?: string | null
          endpoint_id?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean | null
        }
        Update: {
          attempt_number?: number | null
          created_at?: string | null
          endpoint_id?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          account_sid: string | null
          api_key_encrypted: string | null
          cart_recovery_template: string | null
          created_at: string | null
          delay_between_messages_ms: number | null
          from_number: string | null
          id: string
          instance_id: string | null
          is_active: boolean | null
          max_messages_per_hour: number | null
          provider: string
          sandbox_mode: boolean | null
          server_url: string | null
          updated_at: string | null
          updated_by: string | null
          webhook_secret: string | null
        }
        Insert: {
          account_sid?: string | null
          api_key_encrypted?: string | null
          cart_recovery_template?: string | null
          created_at?: string | null
          delay_between_messages_ms?: number | null
          from_number?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          max_messages_per_hour?: number | null
          provider?: string
          sandbox_mode?: boolean | null
          server_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
          webhook_secret?: string | null
        }
        Update: {
          account_sid?: string | null
          api_key_encrypted?: string | null
          cart_recovery_template?: string | null
          created_at?: string | null
          delay_between_messages_ms?: number | null
          from_number?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          max_messages_per_hour?: number | null
          provider?: string
          sandbox_mode?: boolean | null
          server_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          notify_on_sale: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          notify_on_sale?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          notify_on_sale?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "wishlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_exceptions: {
        Row: {
          created_at: string | null
          id: string
          is_used: boolean | null
          justification: string | null
          requested_amount: number
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string | null
          status: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_used?: boolean | null
          justification?: string | null
          requested_amount: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          status?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_used?: boolean | null
          justification?: string | null
          requested_amount?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          status?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          asaas_transfer_id: string | null
          asaas_transfer_status: string | null
          created_at: string
          id: string
          net_amount: number
          paid_at: string | null
          pix_key: string
          pix_key_type: string
          platform_fee: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          asaas_transfer_id?: string | null
          asaas_transfer_status?: string | null
          created_at?: string
          id?: string
          net_amount: number
          paid_at?: string | null
          pix_key: string
          pix_key_type: string
          platform_fee: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          asaas_transfer_id?: string | null
          asaas_transfer_status?: string | null
          created_at?: string
          id?: string
          net_amount?: number
          paid_at?: string | null
          pix_key?: string
          pix_key_type?: string
          platform_fee?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_transactions: {
        Row: {
          action_type: string
          amount: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "xp_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ab_experiment_results: {
        Row: {
          conversion_rate: number | null
          conversions: number | null
          experiment_id: string | null
          experiment_name: string | null
          impressions: number | null
          is_control: boolean | null
          lift: number | null
          metric_key: string | null
          revenue: number | null
          status: string | null
          variant_id: string | null
          variant_name: string | null
        }
        Relationships: []
      }
      admin_financial_master_view: {
        Row: {
          content_revenue: number | null
          message_revenue: number | null
          monthly_revenue: number | null
          monthly_transactions: number | null
          platform_profit: number | null
          subscription_revenue: number | null
          tax_reserve: number | null
          tip_revenue: number | null
          total_revenue: number | null
          total_transactions: number | null
          weekly_revenue: number | null
        }
        Relationships: []
      }
      cart_recovery_metrics: {
        Row: {
          clicked_count: number | null
          date: string | null
          expired_count: number | null
          recovered_count: number | null
          recovered_revenue: number | null
          recovery_rate: number | null
          sent_count: number | null
          total_carts: number | null
        }
        Relationships: []
      }
      creator_earnings_summary: {
        Row: {
          balance: number | null
          creator_id: string | null
          creator_name: string | null
          ganhos_mes_atual: number | null
          total_bruto: number | null
          total_imposto: number | null
          total_liquido: number | null
          total_pendente: number | null
          total_sacado: number | null
          total_taxa_afiliado: number | null
          total_taxa_plataforma: number | null
          total_vendas: number | null
          username: string | null
        }
        Relationships: []
      }
      engagement_heatmap: {
        Row: {
          day_of_week: number | null
          event_count: number | null
          event_type: string | null
          hour_of_day: number | null
        }
        Relationships: []
      }
      founder_vagas_status: {
        Row: {
          filled: number | null
          is_full: boolean | null
          remaining: number | null
          total: number | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          connection_mode: boolean | null
          cover_image_url: string | null
          gender: string | null
          gender_other: string | null
          hide_age: boolean | null
          hide_location: boolean | null
          id: string | null
          is_creator: boolean | null
          is_online: boolean | null
          is_pioneiro: boolean | null
          is_verified: boolean | null
          is_verified_couple: boolean | null
          is_vip: boolean | null
          name: string | null
          pair_bio: string | null
          pair_photos: string[] | null
          partner1_name: string | null
          partner2_name: string | null
          plan_type: string | null
          show_on_radar: boolean | null
          show_online_status: boolean | null
          tags_adult: string[] | null
          tags_social: string[] | null
          updated_at: string | null
          user_id: string | null
          username: string | null
          vip_tier: string | null
          voice_bio_duration: number | null
          voice_bio_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          connection_mode?: boolean | null
          cover_image_url?: string | null
          gender?: string | null
          gender_other?: string | null
          hide_age?: boolean | null
          hide_location?: boolean | null
          id?: string | null
          is_creator?: boolean | null
          is_online?: boolean | null
          is_pioneiro?: boolean | null
          is_verified?: boolean | null
          is_verified_couple?: boolean | null
          is_vip?: boolean | null
          name?: string | null
          pair_bio?: string | null
          pair_photos?: string[] | null
          partner1_name?: string | null
          partner2_name?: string | null
          plan_type?: string | null
          show_on_radar?: boolean | null
          show_online_status?: boolean | null
          tags_adult?: string[] | null
          tags_social?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
          vip_tier?: string | null
          voice_bio_duration?: number | null
          voice_bio_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          connection_mode?: boolean | null
          cover_image_url?: string | null
          gender?: string | null
          gender_other?: string | null
          hide_age?: boolean | null
          hide_location?: boolean | null
          id?: string | null
          is_creator?: boolean | null
          is_online?: boolean | null
          is_pioneiro?: boolean | null
          is_verified?: boolean | null
          is_verified_couple?: boolean | null
          is_vip?: boolean | null
          name?: string | null
          pair_bio?: string | null
          pair_photos?: string[] | null
          partner1_name?: string | null
          partner2_name?: string | null
          plan_type?: string | null
          show_on_radar?: boolean | null
          show_online_status?: boolean | null
          tags_adult?: string[] | null
          tags_social?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
          vip_tier?: string | null
          voice_bio_duration?: number | null
          voice_bio_url?: string | null
        }
        Relationships: []
      }
      promotion_analytics: {
        Row: {
          clicks: number | null
          closes: number | null
          conversions: number | null
          ctr: number | null
          impressions: number | null
          is_active: boolean | null
          promotion_id: string | null
          promotion_title: string | null
          promotion_type: Database["public"]["Enums"]["promotion_type"] | null
          rejection_rate: number | null
          reward_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_events_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_period_stats: {
        Row: {
          event_count: number | null
          event_date: string | null
          event_type: string | null
          promotion_id: string | null
          time_period: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_events_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_network_stats: {
        Row: {
          active_children: number | null
          first_referral_at: string | null
          parent_avatar: string | null
          parent_id: string | null
          parent_name: string | null
          parent_username: string | null
          total_children: number | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_tree_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "referral_tree_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tree_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tree_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      share_click_stats: {
        Row: {
          clicks_today: number | null
          clicks_week: number | null
          conversions_today: number | null
          conversions_week: number | null
          referrer_id: string | null
          total_clicks: number | null
          total_conversions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "share_click_tracking_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "share_click_tracking_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_click_tracking_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_click_tracking_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_referral_children: {
        Row: {
          children_count: number | null
          children_ids: string[] | null
          parent_id: string | null
          total_earned: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_referrals_madrinha_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "creator_referrals_madrinha_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_referrals_madrinha_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_referrals_madrinha_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      v_feed_posts: {
        Row: {
          author_id: string | null
          comments_count: number | null
          content_text: string | null
          created_at: string | null
          creator_id: string | null
          dislikes_count: number | null
          id: string | null
          is_flash: boolean | null
          is_hidden: boolean | null
          is_locked: boolean | null
          is_paid: boolean | null
          likes_count: number | null
          media_type: string | null
          media_url: string | null
          media_urls: string[] | null
          paid_price: number | null
          post_type: string | null
          preview_url: string | null
          privacy_level: string | null
          saves_count: number | null
          shares_count: number | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string | null
          video_duration_seconds: number | null
        }
        Insert: {
          author_id?: string | null
          comments_count?: never
          content_text?: string | null
          created_at?: string | null
          creator_id?: string | null
          dislikes_count?: never
          id?: string | null
          is_flash?: never
          is_hidden?: never
          is_locked?: boolean | null
          is_paid?: boolean | null
          likes_count?: never
          media_type?: string | null
          media_url?: string | null
          media_urls?: string[] | null
          paid_price?: number | null
          post_type?: string | null
          preview_url?: never
          privacy_level?: string | null
          saves_count?: never
          shares_count?: never
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          video_duration_seconds?: number | null
        }
        Update: {
          author_id?: string | null
          comments_count?: never
          content_text?: string | null
          created_at?: string | null
          creator_id?: string | null
          dislikes_count?: never
          id?: string | null
          is_flash?: never
          is_hidden?: never
          is_locked?: boolean | null
          is_paid?: boolean | null
          likes_count?: never
          media_type?: string | null
          media_url?: string | null
          media_urls?: string[] | null
          paid_price?: number | null
          post_type?: string | null
          preview_url?: never
          privacy_level?: string | null
          saves_count?: never
          shares_count?: never
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          video_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      v_secure_posts: {
        Row: {
          allow_sharing: boolean | null
          comments_count: number | null
          content_text: string | null
          created_at: string | null
          dislikes_count: number | null
          file_size_bytes: number | null
          file_type: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string | null
          is_flash: boolean | null
          is_hidden: boolean | null
          is_locked: boolean | null
          is_paid: boolean | null
          is_seed: boolean | null
          likes_count: number | null
          media_type: string | null
          media_url: string | null
          original_filename: string | null
          paid_price: number | null
          post_type: string | null
          privacy_level: string | null
          share_link: string | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string | null
          video_duration_seconds: number | null
          video_hls_url: string | null
          video_master_url: string | null
          video_preview_url: string | null
          video_processing_status: string | null
        }
        Insert: {
          allow_sharing?: boolean | null
          comments_count?: number | null
          content_text?: string | null
          created_at?: string | null
          dislikes_count?: number | null
          file_size_bytes?: number | null
          file_type?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string | null
          is_flash?: boolean | null
          is_hidden?: boolean | null
          is_locked?: boolean | null
          is_paid?: boolean | null
          is_seed?: boolean | null
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          original_filename?: string | null
          paid_price?: number | null
          post_type?: string | null
          privacy_level?: string | null
          share_link?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          video_duration_seconds?: number | null
          video_hls_url?: string | null
          video_master_url?: string | null
          video_preview_url?: string | null
          video_processing_status?: string | null
        }
        Update: {
          allow_sharing?: boolean | null
          comments_count?: number | null
          content_text?: string | null
          created_at?: string | null
          dislikes_count?: number | null
          file_size_bytes?: number | null
          file_type?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string | null
          is_flash?: boolean | null
          is_hidden?: boolean | null
          is_locked?: boolean | null
          is_paid?: boolean | null
          is_seed?: boolean | null
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          original_filename?: string | null
          paid_price?: number | null
          post_type?: string | null
          privacy_level?: string | null
          share_link?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          video_duration_seconds?: number | null
          video_hls_url?: string | null
          video_master_url?: string | null
          video_preview_url?: string | null
          video_processing_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      v_vip_stats: {
        Row: {
          active_subscribers: number | null
          avatar_url: string | null
          balance: number | null
          id: string | null
          is_creator: boolean | null
          is_invisible: boolean | null
          is_verified: boolean | null
          is_vip: boolean | null
          name: string | null
          plan_type: string | null
          total_likes_received: number | null
          total_visits: number | null
          user_id: string | null
          username: string | null
          vip_tier: string | null
          weekly_visits: number | null
        }
        Insert: {
          active_subscribers?: never
          avatar_url?: string | null
          balance?: number | null
          id?: string | null
          is_creator?: boolean | null
          is_invisible?: boolean | null
          is_verified?: boolean | null
          is_vip?: boolean | null
          name?: string | null
          plan_type?: string | null
          total_likes_received?: never
          total_visits?: never
          user_id?: string | null
          username?: string | null
          vip_tier?: string | null
          weekly_visits?: never
        }
        Update: {
          active_subscribers?: never
          avatar_url?: string | null
          balance?: number | null
          id?: string | null
          is_creator?: boolean | null
          is_invisible?: boolean | null
          is_verified?: boolean | null
          is_vip?: boolean | null
          name?: string | null
          plan_type?: string | null
          total_likes_received?: never
          total_visits?: never
          user_id?: string | null
          username?: string | null
          vip_tier?: string | null
          weekly_visits?: never
        }
        Relationships: []
      }
      vw_extrato_criador: {
        Row: {
          affiliate_amount: number | null
          affiliate_id: string | null
          affiliate_rate: number | null
          base_amount: number | null
          buyer_id: string | null
          category: string | null
          completed_at: string | null
          created_at: string | null
          creator_amount: number | null
          criador_id: string | null
          description: string | null
          flow_type: string | null
          gross_amount: number | null
          id: string | null
          platform_amount: number | null
          platform_rate: number | null
          provider: string | null
          tax_amount: number | null
          tax_rate: number | null
          transaction_id: string | null
          transaction_status: string | null
          transaction_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings_summary"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "v_vip_stats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_profile_highlight: {
        Args: { p_amount: number; p_payment_id?: string }
        Returns: string
      }
      add_to_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      add_to_pending_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      add_to_waitlist: {
        Args: { p_email: string; p_name?: string; p_source?: string }
        Returns: Json
      }
      add_user_xp:
        | {
            Args: {
              p_action_type: string
              p_amount: number
              p_description?: string
              p_reference_id?: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: { p_source?: string; p_user_id: string; p_xp: number }
            Returns: undefined
          }
      admin_bulk_delete_seed_posts: {
        Args: { days_back?: number }
        Returns: number
      }
      admin_freeze_user_balance: {
        Args: {
          p_freeze_balance?: boolean
          p_freeze_credits?: boolean
          p_profile_id: string
          p_reason?: string
        }
        Returns: Json
      }
      admin_update_user_plan: {
        Args: {
          p_payment_status: string
          p_plan_type: string
          p_profile_id: string
        }
        Returns: boolean
      }
      aggregate_daily_metrics: { Args: never; Returns: undefined }
      apply_subscription_coupon: {
        Args: {
          p_coupon_id: string
          p_discount_applied: number
          p_final_price: number
          p_original_price: number
          p_subscription_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      approve_creator_founder: {
        Args: { p_admin_id: string; p_application_id: string }
        Returns: undefined
      }
      assign_ab_variant: {
        Args: {
          p_experiment_id: string
          p_session_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      assign_admin_master_to_ocultomaster: { Args: never; Returns: undefined }
      aura_xp_admin_features_list: {
        Args: never
        Returns: {
          action_key: string
          actor_cost: number
          category: string
          description: string
          enabled: boolean
          receiver_reward: number
        }[]
      }
      aura_xp_interaction_charge: {
        Args: {
          p_action_key: string
          p_post_id?: string
          p_receiver_id?: string
          p_ref_key?: string
        }
        Returns: Json
      }
      aura_xp_interaction_config_list: {
        Args: never
        Returns: {
          action_key: string
          actor_cost: number
          category: string
          description: string | null
          enabled: boolean
          id: string
          receiver_reward: number
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "aura_xp_interaction_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      aura_xp_interaction_config_upsert:
        | {
            Args: {
              p_action_key: string
              p_actor_cost: number
              p_category: string
              p_description: string
              p_enabled: boolean
            }
            Returns: undefined
          }
        | {
            Args: {
              p_action_key: string
              p_actor_cost: number
              p_category?: string
              p_description?: string
              p_enabled?: boolean
              p_receiver_reward?: number
            }
            Returns: undefined
          }
      award_achievement: {
        Args: { p_achievement_code: string; p_user_id: string }
        Returns: boolean
      }
      award_badge: {
        Args: { p_badge_code: string; p_user_id: string }
        Returns: boolean
      }
      calculate_creator_metrics: {
        Args: { p_creator_id: string }
        Returns: {
          avg_engagement: number
          total_followers: number
          total_likes: number
          total_posts: number
        }[]
      }
      calculate_next_backup_run:
        | {
            Args: {
              p_day_of_month: number
              p_day_of_week: number
              p_frequency: string
              p_time_of_day: string
            }
            Returns: string
          }
        | {
            Args: {
              p_day_of_month?: number
              p_day_of_week?: number
              p_frequency: string
              p_time_of_day: string
            }
            Returns: string
          }
      calculate_nps: { Args: { p_survey_id: string }; Returns: number }
      calculate_priority_score: {
        Args: {
          p_is_creator: boolean
          p_is_verified: boolean
          p_is_verified_couple: boolean
          p_plan_type: string
        }
        Returns: number
      }
      can_spin_today: { Args: { p_user_id: string }; Returns: Json }
      check_media_access: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: boolean
      }
      check_reengagement_triggers: {
        Args: never
        Returns: {
          action_type: string
          rule_id: string
          rule_name: string
          user_id: string
        }[]
      }
      check_referral_fraud: {
        Args: { p_referred_id: string; p_referrer_id: string }
        Returns: Json
      }
      check_user_capacity: {
        Args: { p_capacity_type: string; p_user_id: string }
        Returns: boolean
      }
      check_verification_deadline: { Args: never; Returns: undefined }
      claim_early_bird_slot: {
        Args: { p_counter_type: string; p_user_id: string }
        Returns: Json
      }
      cleanup_expired_data: { Args: never; Returns: undefined }
      contribute_to_goal_with_credits: {
        Args: {
          p_amount: number
          p_goal_id: string
          p_is_anonymous?: boolean
          p_message?: string
        }
        Returns: Json
      }
      convert_balance_to_credits: { Args: { p_amount: number }; Returns: Json }
      count_broadcast_recipients: {
        Args: { p_audience_type: string; p_creator_id: string }
        Returns: number
      }
      create_early_bird_counter: {
        Args: {
          p_bonus_months?: number
          p_counter_type: string
          p_is_active?: boolean
          p_max_count?: number
        }
        Returns: string
      }
      deactivate_profile_highlight: { Args: never; Returns: boolean }
      debit_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      delete_early_bird_counter: {
        Args: { p_counter_id: string }
        Returns: boolean
      }
      delete_test_messages: {
        Args: { p_conversation_id: string }
        Returns: number
      }
      delete_user_account: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      detect_fraud_patterns: { Args: { p_user_id?: string }; Returns: Json }
      end_auction: { Args: { p_auction_id: string }; Returns: Json }
      ensure_my_profile: { Args: never; Returns: string }
      expire_old_profile_highlights: { Args: never; Returns: undefined }
      fraud_burst_activity: {
        Args: {
          p_action: string
          p_limit?: number
          p_min_count?: number
          p_window_minutes?: number
        }
        Returns: {
          action: string
          event_count: number
          first_event: string
          last_event: string
          unique_devices: number
          unique_ips: number
          user_id: string
          username: string
        }[]
      }
      fraud_daily_trend: {
        Args: { p_days?: number }
        Returns: {
          day: string
          suspicious: number
          total_actions: number
          unique_users: number
        }[]
      }
      fraud_search_logs: {
        Args: {
          p_days?: number
          p_device?: string
          p_ip?: string
          p_limit?: number
          p_min_risk?: number
          p_user_id?: string
        }
        Returns: {
          action_type: string
          created_at: string
          device_id: string
          id: string
          ip_address: string
          metadata: Json
          risk_score: number
          user_agent: string
          user_id: string
        }[]
      }
      fraud_top_actions: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          action_type: string
          total: number
          unique_users: number
        }[]
      }
      fraud_top_devices: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          device_id: string
          distinct_users: number
          last_seen: string
          total_actions: number
        }[]
      }
      fraud_top_ips: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          distinct_users: number
          ip_address: string
          last_seen: string
          total_actions: number
        }[]
      }
      generate_creator_referral_code: {
        Args: { p_profile_id: string }
        Returns: string
      }
      generate_referral_code: { Args: never; Returns: string }
      generate_seed_comments: { Args: { comments_data: Json }; Returns: number }
      generate_seed_likes: { Args: { likes_data: Json }; Returns: number }
      generate_seed_posts: {
        Args: { posts_data: Json }
        Returns: {
          id: string
        }[]
      }
      generate_seed_profiles: {
        Args: { profiles_data: Json }
        Returns: {
          id: string
          user_id: string
        }[]
      }
      get_admin_role: { Args: { p_user_id: string }; Returns: string }
      get_advanced_compatibility: {
        Args: { user_a_id: string; user_b_id: string }
        Returns: Json
      }
      get_all_paid_users_with_email: {
        Args: never
        Returns: {
          balance: number
          created_at: string
          email: string
          id: string
          is_creator: boolean
          is_verified: boolean
          name: string
          payment_due_date: string
          payment_status: string
          plan_type: string
          username: string
        }[]
      }
      get_backup_stats: { Args: never; Returns: Json }
      get_campaign_target_users: {
        Args: { p_audience: string; p_filter?: Json }
        Returns: {
          email: string
          user_id: string
          username: string
        }[]
      }
      get_capacity_metrics: { Args: never; Returns: Json }
      get_conversion_funnel: {
        Args: { hours_ago?: number }
        Returns: {
          event_count: number
          event_type: string
          plan_type: string
        }[]
      }
      get_growth_metrics: {
        Args: { days_back?: number }
        Returns: {
          metric_date: string
          new_creators: number
          new_subscriptions: number
          new_users: number
          revenue: number
          transactions: number
        }[]
      }
      get_invoice_stats: {
        Args: never
        Returns: {
          emails_sent: number
          invoices_this_month: number
          invoices_today: number
          total_downloads: number
          total_invoices: number
        }[]
      }
      get_marketplace_admin_stats: { Args: never; Returns: Json }
      get_marketplace_items_admin: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          category: string
          created_at: string
          creator_avatar: string
          creator_id: string
          creator_name: string
          description: string
          id: string
          is_featured: boolean
          item_type: string
          media_url: string
          preview_url: string
          price: number
          sales_count: number
          status: string
          title: string
          view_count: number
        }[]
      }
      get_moderation_summary: { Args: never; Returns: Json }
      get_monthly_top_supporters: {
        Args: { p_creator_id: string; p_limit?: number }
        Returns: {
          is_anonymous: boolean
          rank_position: number
          supporter_avatar: string
          supporter_id: string
          supporter_name: string
          supporter_username: string
          total_spent: number
        }[]
      }
      get_my_ranking_position: {
        Args: { p_creator_id: string; p_user_id: string }
        Returns: {
          amount_to_top10: number
          amount_to_top3: number
          my_position: number
          my_total_spent: number
        }[]
      }
      get_online_users_count: { Args: never; Returns: number }
      get_or_create_conversation: {
        Args: { p_user1_id: string; p_user2_id: string }
        Returns: string
      }
      get_perfect_pairs: {
        Args: {
          p_limit?: number
          p_user_id: string
          p_viewer_lat?: number
          p_viewer_lng?: number
        }
        Returns: {
          age: number
          avatar_url: string
          bio: string
          distance_km: number
          id: string
          is_boosted: boolean
          name: string
          pair_bio: string
          pair_photos: string[]
          plan_type: string
          shared_tags: string[]
          shared_tags_count: number
          tags_adult: string[]
          tags_social: string[]
          username: string
        }[]
      }
      get_pioneer_slots_status: { Args: never; Returns: Json }
      get_plan_distribution: {
        Args: never
        Returns: {
          percentage: number
          plan_type: string
          user_count: number
        }[]
      }
      get_push_stats: {
        Args: { days_back?: number }
        Returns: {
          active_tokens: number
          click_rate: number
          delivery_rate: number
          total_campaigns: number
          total_clicked: number
          total_delivered: number
          total_sent: number
        }[]
      }
      get_realtime_dashboard_metrics: {
        Args: never
        Returns: {
          active_subscriptions: number
          active_users_today: number
          active_users_week: number
          arr: number
          avg_transaction_value: number
          churn_rate: number
          mrr: number
          new_users_today: number
          new_users_week: number
          total_creators: number
          total_revenue_month: number
          total_revenue_today: number
          total_revenue_week: number
          total_transactions_today: number
          total_users: number
          verified_creators: number
        }[]
      }
      get_referral_stats: {
        Args: { p_affiliate_id?: string }
        Returns: {
          active_affiliates: number
          conversion_rate: number
          pending_commissions: number
          total_affiliates: number
          total_clicks: number
          total_commissions: number
          total_conversions: number
          total_revenue: number
          total_signups: number
        }[]
      }
      get_revenue_metrics: {
        Args: never
        Returns: {
          avg_ticket: number
          churn_rate: number
          monthly_revenue: number
          monthly_transactions: number
          mrr_estimate: number
          paid_users: number
          total_revenue: number
          total_transactions: number
        }[]
      }
      get_signups_today_count: { Args: never; Returns: number }
      get_suggested_users: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          avatar_url: string
          common_adult_interests: number
          common_interests: number
          gender: string
          id: string
          is_highlighted: boolean
          is_seed: boolean
          is_test_account: boolean
          mutual_following_count: number
          name: string
          tags_adult: string[]
          tags_social: string[]
          user_id: string
          username: string
        }[]
      }
      get_super_dm_revenue_timeline: {
        Args: { p_days?: number; p_profile_id: string }
        Returns: {
          count: number
          date: string
          revenue: number
        }[]
      }
      get_super_dm_stats: { Args: { p_profile_id: string }; Returns: Json }
      get_top_performers: {
        Args: { limit_count?: number }
        Returns: {
          avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          engagement_rate: number
          posts_count: number
          subscribers_count: number
          total_revenue: number
        }[]
      }
      get_webhook_stats: {
        Args: never
        Returns: {
          active_endpoints: number
          avg_response_time: number
          failed_today: number
          successful_today: number
          total_endpoints: number
          total_logs_today: number
        }[]
      }
      has_active_subscription: {
        Args: { _creator_profile_id: string }
        Returns: boolean
      }
      has_chat_unlocked: {
        Args: { _creator_profile_id: string }
        Returns: boolean
      }
      has_paid_for_post: { Args: { _post_id: string }; Returns: boolean }
      has_purchased_item: { Args: { _item_id: string }; Returns: boolean }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      increment_invoice_download: {
        Args: { invoice_id: string }
        Returns: undefined
      }
      increment_share_view_count: {
        Args: { p_link_id: string }
        Returns: undefined
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_admin_master:
        | { Args: never; Returns: boolean }
        | { Args: { p_user_id: string }; Returns: boolean }
      is_blocked_by: {
        Args: { blocked_id: string; blocker_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { check_user_id: string; conv_id: string }
        Returns: boolean
      }
      is_profile_highlighted: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      link_creator_referral: {
        Args: { p_afilhada_profile_id: string; p_referral_code: string }
        Returns: string
      }
      link_share_referral: {
        Args: { p_child_profile_id: string; p_share_code: string }
        Returns: undefined
      }
      list_blocked_commissions: {
        Args: {
          p_days?: number
          p_ip?: string
          p_limit?: number
          p_reason?: string
          p_status?: string
        }
        Returns: {
          created_at: string
          evidence: Json
          gross_amount: number
          id: string
          reason: string
          referred_id: string
          referrer_id: string
          review_note: string
          review_status: string
          reviewed_at: string
          reviewed_by: string
          subscription_id: string
        }[]
      }
      log_engagement_event: {
        Args: {
          p_event_source?: string
          p_event_type: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      log_user_activity:
        | {
            Args: { p_action: string; p_metadata?: Json; p_user_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_action_type: string
              p_device_id?: string
              p_ip?: string
              p_metadata?: Json
              p_user_agent?: string
              p_user_id: string
            }
            Returns: string
          }
      lookup_referral_code: { Args: { p_code: string }; Returns: Json }
      master_online_unrewarded_get: {
        Args: never
        Returns: {
          already_gifted: boolean
          aura_level: number
          avatar_url: string
          last_seen: string
          name: string
          plan_type: string
          profile_id: string
          user_id: string
          username: string
        }[]
      }
      oculto_get_actor_name: { Args: { p_profile_id: string }; Returns: string }
      oculto_get_post_owner_profile: {
        Args: { p_post_id: string }
        Returns: string
      }
      place_auction_bid: {
        Args: { p_amount: number; p_auction_id: string; p_bidder_id: string }
        Returns: Json
      }
      process_creator_referral_commission: {
        Args: {
          p_afilhada_profile_id: string
          p_gross_amount: number
          p_platform_fee_rate?: number
          p_transaction_id: string
        }
        Returns: Json
      }
      process_payment_split: {
        Args: {
          p_affiliate_id?: string
          p_creator_id?: string
          p_flow_type: string
          p_gross_amount: number
          p_payment_external_id: string
          p_provider?: string
          p_transaction_id: string
        }
        Returns: Json
      }
      purchase_marketplace_item: {
        Args: { p_item_id: string; p_payment_method?: string }
        Returns: Json
      }
      purchase_media: {
        Args: { p_buyer_id: string; p_post_id: string }
        Returns: Json
      }
      purge_seed_data: { Args: never; Returns: Json }
      record_ab_conversion: {
        Args: {
          p_conversion_type?: string
          p_experiment_id: string
          p_session_id?: string
          p_user_id?: string
          p_value?: number
        }
        Returns: boolean
      }
      record_analytics_event: {
        Args: { p_event_type: string; p_metadata?: Json; p_user_id?: string }
        Returns: undefined
      }
      record_profile_visit: {
        Args: { p_visited_id: string; p_visitor_id: string }
        Returns: undefined
      }
      record_referral_subscription_commission: {
        Args: {
          p_gross_amount: number
          p_is_recurring?: boolean
          p_referred_user_id: string
          p_subscription_id: string
        }
        Returns: Json
      }
      redeem_reward: {
        Args: { p_reward_id: string; p_user_id: string }
        Returns: Json
      }
      register_chat_unlock: {
        Args: {
          _amount: number
          _creator_profile_id: string
          _payment_method?: string
          _transaction_id?: string
        }
        Returns: string
      }
      register_referral_commission: {
        Args: {
          p_referred_user_id: string
          p_source_amount: number
          p_source_id: string
          p_source_type: string
        }
        Returns: undefined
      }
      release_pending_balance: {
        Args: { p_release_id: string }
        Returns: undefined
      }
      repair_all_profile_assets: { Args: never; Returns: Json }
      repair_profile_assets: { Args: { p_user_id: string }; Returns: Json }
      reset_early_bird_counter: {
        Args: { p_counter_id: string }
        Returns: boolean
      }
      search_my_messages: {
        Args: { p_limit?: number; p_query: string; p_user_id: string }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          message_id: string
          other_user_avatar: string
          other_user_id: string
          other_user_name: string
          sender_id: string
        }[]
      }
      search_users_with_email: {
        Args: { p_query: string }
        Returns: {
          avatar_url: string
          balance: number
          balance_frozen: boolean
          created_at: string
          email: string
          id: string
          is_creator: boolean
          is_verified: boolean
          name: string
          payment_due_date: string
          payment_status: string
          plan_type: string
          user_id: string
          username: string
        }[]
      }
      send_gift: {
        Args: {
          p_amount: number
          p_conversation_id?: string
          p_receiver_profile_id: string
        }
        Returns: Json
      }
      send_super_dm:
        | {
            Args: {
              p_amount: number
              p_content: string
              p_conversation_id: string
              p_media_type?: string
              p_media_url?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_content: string
              p_conversation_id: string
              p_media_type?: string
              p_media_url?: string
              p_receiver_id: string
              p_sender_id: string
            }
            Returns: Json
          }
      should_show_nps: {
        Args: { p_survey_id: string; p_user_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      spin_daily_wheel: { Args: { p_user_id: string }; Returns: Json }
      trigger_webhook: {
        Args: { p_event_type: string; p_payload: Json }
        Returns: undefined
      }
      try_claim_signup_slot: { Args: never; Returns: boolean }
      undo_last_swipe: { Args: { user_uuid: string }; Returns: string }
      unlock_achievement: {
        Args: { p_achievement_code: string; p_user_id: string }
        Returns: Json
      }
      update_commission_review: {
        Args: { p_block_id: string; p_note?: string; p_status: string }
        Returns: Json
      }
      validate_checkout_fraud: { Args: { p_user_id: string }; Returns: Json }
      validate_subscription_coupon: {
        Args: {
          p_code: string
          p_original_price: number
          p_plan_type: string
          p_user_id: string
        }
        Returns: Json
      }
      vote_on_poll: {
        Args: { p_option_id: string; p_poll_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin_master" | "admin_regional" | "moderator"
      platform_source: "instagram" | "tiktok" | "twitter" | "other"
      promotion_type:
        | "referral"
        | "cashback"
        | "bonus_plan"
        | "creator_commission"
        | "custom"
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
      app_role: ["admin_master", "admin_regional", "moderator"],
      platform_source: ["instagram", "tiktok", "twitter", "other"],
      promotion_type: [
        "referral",
        "cashback",
        "bonus_plan",
        "creator_commission",
        "custom",
      ],
    },
  },
} as const
