export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string;
          website: string;
          street: string;
          city: string;
          state: string;
          postal_code: string;
          license_number: string;
          logo_url: string;
          logo_storage_path: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string;
          email?: string;
          website?: string;
          street?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          license_number?: string;
          logo_url?: string;
          logo_storage_path?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string;
          website?: string;
          street?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          license_number?: string;
          logo_url?: string;
          logo_storage_path?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          company_id: string;
          full_name: string;
          title: string;
          initials: string;
          role: Database["public"]["Enums"]["seat_role"];
          staff_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          company_id: string;
          full_name: string;
          title?: string;
          initials: string;
          role?: Database["public"]["Enums"]["seat_role"];
          staff_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          full_name?: string;
          title?: string;
          initials?: string;
          role?: Database["public"]["Enums"]["seat_role"];
          staff_id?: string | null;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          lead_staff_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          lead_staff_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["teams"]["Insert"]>;
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          title: string;
          role: Database["public"]["Enums"]["seat_role"];
          team_id: string | null;
          initials: string;
          email: string;
          locked: boolean;
          restricted: boolean;
          invite_expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          title?: string;
          role?: Database["public"]["Enums"]["seat_role"];
          team_id?: string | null;
          initials?: string;
          email?: string;
          locked?: boolean;
          restricted?: boolean;
          invite_expires_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_members"]["Insert"]>;
        Relationships: [];
      };
      account_invites: {
        Row: {
          id: string;
          company_id: string;
          staff_id: string;
          email: string;
          token: string;
          expires_at: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          staff_id: string;
          email: string;
          token: string;
          expires_at: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["account_invites"]["Insert"]>;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          type: Database["public"]["Enums"]["client_type"];
          city: string;
          state: string;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          type: Database["public"]["Enums"]["client_type"];
          city: string;
          state: string;
          notes?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          company_id: string;
          client_id: string | null;
          name: string;
          title: string;
          email: string;
          phone: string;
          owner_staff_id: string | null;
          is_referral_partner: boolean;
        };
        Insert: {
          id?: string;
          company_id: string;
          client_id?: string | null;
          name: string;
          title?: string;
          email?: string;
          phone?: string;
          owner_staff_id?: string | null;
          is_referral_partner?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      opportunities: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          client_id: string | null;
          primary_contact_id: string | null;
          stage: Database["public"]["Enums"]["pipeline_stage"];
          value: number;
          bid_due_at: string | null;
          pre_bid_walk_at: string | null;
          location: string;
          project_type: Database["public"]["Enums"]["project_type"];
          delivery_method: Database["public"]["Enums"]["delivery_method"];
          estimator: string;
          win_probability: number;
          next_step: string;
          lost_reason: string | null;
          owner_staff_id: string | null;
          originator_staff_id: string | null;
          created_at: string;
          code: string;
          lead_source: string;
          referral_contact_id: string | null;
          street: string;
          city: string;
          state: string;
          postal_code: string;
          notes: string;
          market: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          client_id?: string | null;
          primary_contact_id?: string | null;
          stage?: Database["public"]["Enums"]["pipeline_stage"];
          value?: number;
          bid_due_at?: string | null;
          pre_bid_walk_at?: string | null;
          location?: string;
          project_type: Database["public"]["Enums"]["project_type"];
          delivery_method: Database["public"]["Enums"]["delivery_method"];
          estimator?: string;
          win_probability?: number;
          next_step?: string;
          lost_reason?: string | null;
          owner_staff_id?: string | null;
          originator_staff_id?: string | null;
          created_at?: string;
          code?: string;
          lead_source?: string;
          referral_contact_id?: string | null;
          street?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          notes?: string;
          market?: string;
        };
        Update: Partial<Database["public"]["Tables"]["opportunities"]["Insert"]>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          company_id: string;
          opportunity_id: string | null;
          name: string;
          client_id: string | null;
          primary_contact_id: string | null;
          status: Database["public"]["Enums"]["job_status"];
          contract_value: number;
          start_date: string;
          substantial_completion: string | null;
          superintendent: string;
          project_manager: string;
          location: string;
          owner_staff_id: string | null;
          created_at: string;
          code: string;
          description: string;
          tags: string[];
          street: string;
          city: string;
          state: string;
          postal_code: string;
          sales_rep: string;
          assigned: string[];
          subcontractor_ids: string[];
          related_contact_ids: string[];
          custom_fields: Json;
          project_type: Database["public"]["Enums"]["project_type"] | null;
          lead_source: string;
          market: string;
          deleted_at: string | null;
          deleted_reason: string;
          deleted_by: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          opportunity_id?: string | null;
          name: string;
          client_id?: string | null;
          primary_contact_id?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          contract_value?: number;
          start_date?: string;
          substantial_completion?: string | null;
          superintendent?: string;
          project_manager?: string;
          location?: string;
          owner_staff_id?: string | null;
          code?: string;
          description?: string;
          tags?: string[];
          street?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          sales_rep?: string;
          assigned?: string[];
          subcontractor_ids?: string[];
          related_contact_ids?: string[];
          custom_fields?: Json;
          project_type?: Database["public"]["Enums"]["project_type"] | null;
          lead_source?: string;
          market?: string;
          deleted_at?: string | null;
          deleted_reason?: string;
          deleted_by?: string;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [];
      };
      activities: {
        Row: {
          id: string;
          company_id: string;
          entity_type: Database["public"]["Enums"]["entity_kind"];
          entity_id: string;
          type: Database["public"]["Enums"]["activity_type"];
          body: string;
          author: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          entity_type: Database["public"]["Enums"]["entity_kind"];
          entity_id: string;
          type: Database["public"]["Enums"]["activity_type"];
          body: string;
          author: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["activities"]["Insert"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          due_at: string;
          completed: boolean;
          related_type: Database["public"]["Enums"]["entity_kind"] | null;
          related_id: string | null;
          assignee: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          title: string;
          due_at: string;
          completed?: boolean;
          related_type?: Database["public"]["Enums"]["entity_kind"] | null;
          related_id?: string | null;
          assignee?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      catalog_items: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          kind: Database["public"]["Enums"]["catalog_kind"];
          unit: string;
          unit_cost: number;
          cost_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          kind: Database["public"]["Enums"]["catalog_kind"];
          unit?: string;
          unit_cost?: number;
          cost_code?: string;
        };
        Update: Partial<Database["public"]["Tables"]["catalog_items"]["Insert"]>;
        Relationships: [];
      };
      estimates: {
        Row: {
          id: string;
          company_id: string;
          number: string;
          name: string;
          client_id: string | null;
          opportunity_id: string | null;
          job_id: string | null;
          contact_id: string | null;
          status: Database["public"]["Enums"]["estimate_status"];
          notes: string;
          valid_until: string | null;
          sent_at: string | null;
          accepted_at: string | null;
          created_at: string;
          tax_rate: number;
          discount_kind: string;
          discount_value: number;
          deposit_kind: string;
          deposit_value: number;
          intro: string;
          terms: string;
          street: string;
          city: string;
          state: string;
          postal_code: string;
          share_token: string;
          signature_name: string;
          signature_image: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          number: string;
          name: string;
          client_id?: string | null;
          opportunity_id?: string | null;
          job_id?: string | null;
          contact_id?: string | null;
          status?: Database["public"]["Enums"]["estimate_status"];
          notes?: string;
          valid_until?: string | null;
          sent_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          tax_rate?: number;
          discount_kind?: string;
          discount_value?: number;
          deposit_kind?: string;
          deposit_value?: number;
          intro?: string;
          terms?: string;
          street?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          share_token?: string;
          signature_name?: string;
          signature_image?: string;
        };
        Update: Partial<Database["public"]["Tables"]["estimates"]["Insert"]>;
        Relationships: [];
      };
      estimate_lines: {
        Row: {
          id: string;
          company_id: string;
          estimate_id: string;
          catalog_item_id: string | null;
          title: string;
          description: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          sort_order: number;
          group_name: string;
          optional: boolean;
          selected: boolean;
          taxable: boolean;
        };
        Insert: {
          id?: string;
          company_id: string;
          estimate_id: string;
          catalog_item_id?: string | null;
          title?: string;
          description: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          sort_order?: number;
          group_name?: string;
          optional?: boolean;
          selected?: boolean;
          taxable?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_lines"]["Insert"]>;
        Relationships: [];
      };
      estimate_templates: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          description: string;
          market: string;
          intro: string;
          terms: string;
          notes: string;
          tax_rate: number;
          discount_kind: string;
          discount_value: number;
          deposit_kind: string;
          deposit_value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          description?: string;
          market?: string;
          intro?: string;
          terms?: string;
          notes?: string;
          tax_rate?: number;
          discount_kind?: string;
          discount_value?: number;
          deposit_kind?: string;
          deposit_value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_templates"]["Insert"]>;
        Relationships: [];
      };
      estimate_template_lines: {
        Row: {
          id: string;
          company_id: string;
          template_id: string;
          catalog_item_id: string | null;
          title: string;
          description: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          sort_order: number;
          group_name: string;
          optional: boolean;
          selected: boolean;
          taxable: boolean;
        };
        Insert: {
          id?: string;
          company_id: string;
          template_id: string;
          catalog_item_id?: string | null;
          title?: string;
          description?: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          sort_order?: number;
          group_name?: string;
          optional?: boolean;
          selected?: boolean;
          taxable?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_template_lines"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          company_id: string;
          number: string;
          name: string;
          client_id: string | null;
          job_id: string | null;
          estimate_id: string | null;
          status: Database["public"]["Enums"]["invoice_status"];
          issued_at: string;
          due_at: string | null;
          notes: string;
          created_at: string;
          share_token: string;
          qb_status: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          number: string;
          name: string;
          client_id?: string | null;
          job_id?: string | null;
          estimate_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          issued_at?: string;
          due_at?: string | null;
          notes?: string;
          share_token?: string;
          qb_status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
      invoice_lines: {
        Row: {
          id: string;
          company_id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          company_id: string;
          invoice_id: string;
          description: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["invoice_lines"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          company_id: string;
          invoice_id: string | null;
          job_id: string | null;
          amount: number;
          method: string;
          paid_at: string;
          reference: string;
          receipt_url: string;
          receipt_storage_path: string | null;
          qb_status: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          invoice_id?: string | null;
          job_id?: string | null;
          amount: number;
          method?: string;
          paid_at?: string;
          reference?: string;
          receipt_url?: string;
          receipt_storage_path?: string | null;
          qb_status?: string;
          created_by?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          company_id: string;
          number: string;
          job_id: string | null;
          vendor: string;
          account: string;
          amount: number;
          incurred_at: string;
          method: string;
          memo: string;
          receipt_url: string;
          receipt_storage_path: string | null;
          qb_status: string;
          extracted_by_ai: boolean;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          number: string;
          job_id?: string | null;
          vendor?: string;
          account?: string;
          amount?: number;
          incurred_at?: string;
          method?: string;
          memo?: string;
          receipt_url: string;
          receipt_storage_path?: string | null;
          qb_status?: string;
          extracted_by_ai?: boolean;
          created_at?: string;
          created_by?: string;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>;
        Relationships: [];
      };
      schedule_events: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          kind: Database["public"]["Enums"]["event_kind"];
          starts_at: string;
          ends_at: string;
          location: string;
          assignee: string;
          opportunity_id: string | null;
          job_id: string | null;
          client_id: string | null;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          title: string;
          kind?: Database["public"]["Enums"]["event_kind"];
          starts_at: string;
          ends_at: string;
          location?: string;
          assignee?: string;
          opportunity_id?: string | null;
          job_id?: string | null;
          client_id?: string | null;
          notes?: string;
        };
        Update: Partial<Database["public"]["Tables"]["schedule_events"]["Insert"]>;
        Relationships: [];
      };
      job_photos: {
        Row: {
          id: string;
          company_id: string;
          job_id: string;
          caption: string;
          category: Database["public"]["Enums"]["photo_category"];
          taken_at: string;
          image_url: string;
          storage_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          job_id: string;
          caption?: string;
          category?: Database["public"]["Enums"]["photo_category"];
          taken_at?: string;
          image_url: string;
          storage_path?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["job_photos"]["Insert"]>;
        Relationships: [];
      };
      photo_reports: {
        Row: {
          id: string;
          company_id: string;
          job_id: string;
          title: string;
          pages: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          job_id: string;
          title?: string;
          pages?: Json;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["photo_reports"]["Insert"]>;
        Relationships: [];
      };
      calendar_accounts: {
        Row: {
          id: string;
          company_id: string;
          staff_id: string;
          google_email: string;
          google_calendar_id: string;
          linked: boolean;
          linked_at: string | null;
          share_with_team: boolean;
          source: "demo" | "google";
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          staff_id: string;
          google_email?: string;
          google_calendar_id?: string;
          linked?: boolean;
          linked_at?: string | null;
          share_with_team?: boolean;
          source?: "demo" | "google";
        };
        Update: Partial<Database["public"]["Tables"]["calendar_accounts"]["Insert"]>;
        Relationships: [];
      };
      calendar_shares: {
        Row: {
          id: string;
          company_id: string;
          owner_staff_id: string;
          viewer_staff_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          owner_staff_id: string;
          viewer_staff_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_shares"]["Insert"]>;
        Relationships: [];
      };
      calendar_tokens: {
        Row: {
          account_id: string;
          refresh_token: string | null;
          access_token: string | null;
          token_expires_at: string | null;
        };
        Insert: {
          account_id: string;
          refresh_token?: string | null;
          access_token?: string | null;
          token_expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_tokens"]["Insert"]>;
        Relationships: [];
      };
      training_progress: {
        Row: {
          company_id: string;
          staff_id: string;
          read: Json;
          badges: Json;
          attempts: Json;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          staff_id: string;
          read?: Json;
          badges?: Json;
          attempts?: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_progress"]["Insert"]>;
        Relationships: [];
      };
      training_bulletins: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          body: string;
          author: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          title: string;
          body?: string;
          author?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_bulletins"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_google_calendar_tokens: {
        Args: {
          p_staff_id: string;
          p_google_email: string;
          p_calendar_id: string;
          p_refresh_token: string;
          p_access_token: string;
          p_token_expires_at: string;
        };
        Returns: undefined;
      };
      google_calendar_credentials: {
        Args: { target_staff_id: string };
        Returns: {
          refresh_token: string | null;
          access_token: string | null;
          token_expires_at: string | null;
          google_email: string;
          google_calendar_id: string;
        }[];
      };
      disconnect_google_calendar: {
        Args: { p_staff_id: string };
        Returns: undefined;
      };
      can_view_staff_calendar: {
        Args: { target_staff_id: string };
        Returns: boolean;
      };
      shared_estimate: {
        Args: { p_token: string };
        Returns: Json;
      };
      shared_invoice: {
        Args: { p_token: string };
        Returns: Json;
      };
      sign_shared_estimate: {
        Args: { p_token: string; p_signer_name: string; p_signature: string };
        Returns: Json;
      };
      invite_preview: {
        Args: { p_token: string };
        Returns: {
          company_id: string;
          company_name: string;
          seat_name: string;
          seat_title: string;
          seat_role: Database["public"]["Enums"]["seat_role"];
          email: string;
          expires_at: string;
        }[];
      };
      claim_invite: {
        Args: { p_token: string };
        Returns: string;
      };
    };
    Enums: {
      pipeline_stage:
        | "pursuing"
        | "estimating"
        | "bid_submitted"
        | "interview"
        | "awarded"
        | "lost";
      job_status: "precon" | "in_progress" | "punch" | "complete" | "on_hold";
      project_type:
        | "restoration"
        | "remodel"
        | "roofing"
        | "exterior"
        | "addition"
        | "commercial"
        | "multifamily"
        | "healthcare"
        | "education"
        | "industrial"
        | "hospitality"
        | "civic"
        | "tenant_improvement";
      delivery_method:
        | "insurance_claim"
        | "fixed_price"
        | "time_and_materials"
        | "design_bid_build"
        | "cm_at_risk"
        | "design_build"
        | "gc_mp";
      client_type:
        | "owner"
        | "developer"
        | "public"
        | "healthcare_system"
        | "architect"
        | "insurance"
        | "realtor"
        | "trade_partner";
      activity_type: "note" | "call" | "email" | "meeting" | "site_walk" | "stage_change" | "audit";
      entity_kind: "opportunity" | "job" | "client";
      seat_role:
        | "company_admin"
        | "business_development"
        | "team_lead"
        | "team_admin"
        | "project_manager"
        | "estimator"
        | "superintendent"
        | "accountant";
      catalog_kind: "labor" | "material" | "equipment" | "allowance" | "subcontract";
      estimate_status: "draft" | "sent" | "viewed" | "accepted" | "declined";
      invoice_status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
      event_kind: "site_walk" | "pre_bid" | "inspection" | "production" | "meeting" | "punch";
      photo_category: "before" | "progress" | "after" | "issue";
    };
    CompositeTypes: Record<string, never>;
  };
};
