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
          slug: string;
          card_logo_url: string;
          card_logo_storage_path: string;
          payment_venmo: string;
          payment_zelle: string;
          payment_cashapp: string;
          payment_paypal: string;
          payment_note: string;
          social_facebook: string;
          social_instagram: string;
          social_youtube: string;
          social_linkedin: string;
          social_tiktok: string;
          google_review_url: string;
          default_estimate_terms: string | null;
          default_invoice_terms: string | null;
          minimum_margin_percent: number;
          default_email_signature: string;
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
          slug?: string;
          card_logo_url?: string;
          card_logo_storage_path?: string;
          payment_venmo?: string;
          payment_zelle?: string;
          payment_cashapp?: string;
          payment_paypal?: string;
          payment_note?: string;
          social_facebook?: string;
          social_instagram?: string;
          social_youtube?: string;
          social_linkedin?: string;
          social_tiktok?: string;
          google_review_url?: string;
          default_estimate_terms?: string | null;
          default_invoice_terms?: string | null;
          minimum_margin_percent?: number;
          default_email_signature?: string;
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
          slug?: string;
          card_logo_url?: string;
          card_logo_storage_path?: string;
          payment_venmo?: string;
          payment_zelle?: string;
          payment_cashapp?: string;
          payment_paypal?: string;
          payment_note?: string;
          social_facebook?: string;
          social_instagram?: string;
          social_youtube?: string;
          social_linkedin?: string;
          social_tiktok?: string;
          google_review_url?: string;
          default_estimate_terms?: string | null;
          default_invoice_terms?: string | null;
          minimum_margin_percent?: number;
          default_email_signature?: string;
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
      google_locations: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          review_url: string;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          review_url?: string;
          is_default?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["google_locations"]["Insert"]>;
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
          phone: string;
          card_slug: string;
          photo_url: string;
          photo_storage_path: string;
          google_review_url: string;
          google_location_id: string | null;
          email_signature: string;
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
          phone?: string;
          card_slug?: string;
          photo_url?: string;
          photo_storage_path?: string;
          google_review_url?: string;
          google_location_id?: string | null;
          email_signature?: string;
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
          margin_percent: number;
          price_list_id: string | null;
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
          margin_percent?: number;
          price_list_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["catalog_items"]["Insert"]>;
        Relationships: [];
      };
      price_lists: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          effective_on: string;
          outdated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          effective_on: string;
          outdated_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["price_lists"]["Insert"]>;
        Relationships: [];
      };
      material_orders: {
        Row: {
          id: string;
          company_id: string;
          number: string;
          job_id: string;
          vendor: string;
          notes: string;
          needed_by: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          number: string;
          job_id: string;
          vendor?: string;
          notes?: string;
          needed_by?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["material_orders"]["Insert"]>;
        Relationships: [];
      };
      material_order_lines: {
        Row: {
          id: string;
          company_id: string;
          material_order_id: string;
          catalog_item_id: string | null;
          name: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          company_id: string;
          material_order_id: string;
          catalog_item_id?: string | null;
          name: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["material_order_lines"]["Insert"]>;
        Relationships: [];
      };
      material_order_templates: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          description: string;
          vendor: string;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          description?: string;
          vendor?: string;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["material_order_templates"]["Insert"]>;
        Relationships: [];
      };
      material_order_template_lines: {
        Row: {
          id: string;
          company_id: string;
          template_id: string;
          catalog_item_id: string | null;
          name: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          company_id: string;
          template_id: string;
          catalog_item_id?: string | null;
          name: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["material_order_template_lines"]["Insert"]>;
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
          second_contact_id: string | null;
          status: Database["public"]["Enums"]["estimate_status"];
          notes: string;
          valid_until: string | null;
          sent_at: string | null;
          accepted_at: string | null;
          second_accepted_at: string | null;
          owner_signed_at: string | null;
          owner_signed_name: string;
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
          second_share_token: string;
          signature_name: string;
          signature_image: string;
          second_signature_name: string;
          second_signature_image: string;
          package_mode: string;
          selected_package: string;
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
          second_contact_id?: string | null;
          status?: Database["public"]["Enums"]["estimate_status"];
          notes?: string;
          valid_until?: string | null;
          sent_at?: string | null;
          accepted_at?: string | null;
          second_accepted_at?: string | null;
          owner_signed_at?: string | null;
          owner_signed_name?: string;
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
          second_share_token?: string;
          signature_name?: string;
          signature_image?: string;
          second_signature_name?: string;
          second_signature_image?: string;
          package_mode?: string;
          selected_package?: string;
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
          photo_ids: string[];
          package: string;
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
          photo_ids?: string[];
          package?: string;
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
          terms: string;
          created_at: string;
          share_token: string;
          qb_status: string;
          qb_txn_id: string;
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
          terms?: string;
          share_token?: string;
          qb_status?: string;
          qb_txn_id?: string;
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
          qb_txn_id: string;
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
          qb_txn_id?: string;
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
          qb_txn_id: string;
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
          qb_txn_id?: string;
          extracted_by_ai?: boolean;
          created_at?: string;
          created_by?: string;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>;
        Relationships: [];
      };
      qb_vendors: {
        Row: {
          id: string;
          company_id: string;
          list_id: string;
          name: string;
          is_active: boolean;
          synced_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          list_id?: string;
          name: string;
          is_active?: boolean;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["qb_vendors"]["Insert"]>;
        Relationships: [];
      };
      qb_review_comments: {
        Row: {
          id: string;
          company_id: string;
          kind: string;
          record_id: string;
          body: string;
          intent: string;
          author_staff_id: string;
          author_name: string;
          mentioned_staff_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          kind: string;
          record_id: string;
          body: string;
          intent?: string;
          author_staff_id?: string;
          author_name?: string;
          mentioned_staff_ids?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["qb_review_comments"]["Insert"]>;
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
          created_by: string;
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
          created_by?: string;
        };
        Update: Partial<Database["public"]["Tables"]["job_photos"]["Insert"]>;
        Relationships: [];
      };
      job_files: {
        Row: {
          id: string;
          company_id: string;
          job_id: string | null;
          opportunity_id?: string | null;
          name: string;
          mime_type?: string;
          content_type?: string;
          category?: string;
          size_bytes: number;
          storage_path: string;
          url: string;
          created_by?: string;
          uploaded_by?: string | null;
          created_at: string;
          share_token?: string | null;
          share_token_created_at?: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          job_id?: string | null;
          opportunity_id?: string | null;
          name: string;
          mime_type?: string;
          content_type?: string;
          category?: string;
          size_bytes?: number;
          storage_path: string;
          url: string;
          created_by?: string;
          uploaded_by?: string | null;
          created_at?: string;
          share_token?: string | null;
          share_token_created_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          job_id?: string | null;
          opportunity_id?: string | null;
          name?: string;
          mime_type?: string;
          content_type?: string;
          category?: string;
          size_bytes?: number;
          storage_path?: string;
          url?: string;
          created_by?: string;
          uploaded_by?: string | null;
          created_at?: string;
          share_token?: string | null;
          share_token_created_at?: string | null;
        };
        Relationships: [];
      };
      company_files: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          category: string;
          content_type: string;
          size_bytes: number;
          storage_path: string;
          url: string;
          notes: string;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          category?: string;
          content_type?: string;
          size_bytes?: number;
          storage_path: string;
          url: string;
          notes?: string;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          category?: string;
          content_type?: string;
          size_bytes?: number;
          storage_path?: string;
          url?: string;
          notes?: string;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      eagleview_connections: {
        Row: {
          company_id: string;
          client_id: string;
          client_secret: string;
          sandbox: boolean;
          default_product: string;
          webhook_token: string;
          linked: boolean;
          linked_at: string | null;
          access_token: string;
          token_expires_at: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          company_id: string;
          client_id?: string;
          client_secret?: string;
          sandbox?: boolean;
          default_product?: string;
          webhook_token?: string;
          linked?: boolean;
          linked_at?: string | null;
          access_token?: string;
          token_expires_at?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          company_id?: string;
          client_id?: string;
          client_secret?: string;
          sandbox?: boolean;
          default_product?: string;
          webhook_token?: string;
          linked?: boolean;
          linked_at?: string | null;
          access_token?: string;
          token_expires_at?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      eagleview_orders: {
        Row: {
          id: string;
          company_id: string;
          job_id: string;
          estimate_id: string | null;
          reference_id: string;
          eagleview_order_id: string;
          eagleview_report_id: string;
          product: string;
          status: string;
          status_detail: string;
          address_line: string;
          city: string;
          state: string;
          postal_code: string;
          claim_number: string;
          total_squares: number | null;
          waste_percent: number | null;
          pitch_summary: string;
          measurements: Json;
          report_file_id: string | null;
          report_url: string;
          applied_estimate_id: string | null;
          applied_at: string | null;
          mocked: boolean;
          ordered_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          job_id: string;
          estimate_id?: string | null;
          reference_id?: string;
          eagleview_order_id?: string;
          eagleview_report_id?: string;
          product?: string;
          status?: string;
          status_detail?: string;
          address_line?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          claim_number?: string;
          total_squares?: number | null;
          waste_percent?: number | null;
          pitch_summary?: string;
          measurements?: Json;
          report_file_id?: string | null;
          report_url?: string;
          applied_estimate_id?: string | null;
          applied_at?: string | null;
          mocked?: boolean;
          ordered_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          job_id?: string;
          estimate_id?: string | null;
          reference_id?: string;
          eagleview_order_id?: string;
          eagleview_report_id?: string;
          product?: string;
          status?: string;
          status_detail?: string;
          address_line?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          claim_number?: string;
          total_squares?: number | null;
          waste_percent?: number | null;
          pitch_summary?: string;
          measurements?: Json;
          report_file_id?: string | null;
          report_url?: string;
          applied_estimate_id?: string | null;
          applied_at?: string | null;
          mocked?: boolean;
          ordered_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      photo_reports: {
        Row: {
          id: string;
          company_id: string;
          job_id: string;
          title: string;
          pages: Json;
          template: string;
          share_token: string;
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
          template?: string;
          share_token?: string;
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
      gmail_accounts: {
        Row: {
          id: string;
          company_id: string;
          staff_id: string;
          google_email: string;
          linked: boolean;
          linked_at: string | null;
          source: "demo" | "google";
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          staff_id: string;
          google_email?: string;
          linked?: boolean;
          linked_at?: string | null;
          source?: "demo" | "google";
        };
        Update: Partial<Database["public"]["Tables"]["gmail_accounts"]["Insert"]>;
        Relationships: [];
      };
      gmail_tokens: {
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
        Update: Partial<Database["public"]["Tables"]["gmail_tokens"]["Insert"]>;
        Relationships: [];
      };
      gmail_messages: {
        Row: {
          id: string;
          company_id: string;
          account_id: string;
          gmail_id: string;
          thread_id: string;
          from_name: string;
          from_email: string;
          to_email: string;
          cc_email: string;
          subject: string;
          snippet: string;
          body_text: string;
          received_at: string;
          direction: string;
          job_id: string | null;
          contact_id: string | null;
          related_contact_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          account_id: string;
          gmail_id?: string;
          thread_id?: string;
          from_name?: string;
          from_email?: string;
          to_email?: string;
          cc_email?: string;
          subject?: string;
          snippet?: string;
          body_text?: string;
          received_at?: string;
          direction?: string;
          job_id?: string | null;
          contact_id?: string | null;
          related_contact_ids?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["gmail_messages"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          company_id: string;
          contact_id: string | null;
          job_id: string | null;
          opportunity_id: string | null;
          direction: string;
          phone: string;
          body: string;
          handle: string;
          status: string;
          media_url: string;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          contact_id?: string | null;
          job_id?: string | null;
          opportunity_id?: string | null;
          direction?: string;
          phone?: string;
          body?: string;
          handle?: string;
          status?: string;
          media_url?: string;
          created_at?: string;
          created_by?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      returning_client_leads: {
        Row: {
          id: string;
          company_id: string;
          opportunity_id: string;
          job_id: string | null;
          contact_id: string | null;
          previous_job_id: string | null;
          previous_staff_id: string | null;
          previous_staff_name: string;
          previous_job_code: string;
          completed_at: string | null;
          opened_by_staff_id: string | null;
          opened_by_name: string;
          status: string;
          decided_by_staff_id: string | null;
          decided_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          opportunity_id: string;
          job_id?: string | null;
          contact_id?: string | null;
          previous_job_id?: string | null;
          previous_staff_id?: string | null;
          previous_staff_name?: string;
          previous_job_code?: string;
          completed_at?: string | null;
          opened_by_staff_id?: string | null;
          opened_by_name?: string;
          status?: string;
          decided_by_staff_id?: string | null;
          decided_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["returning_client_leads"]["Insert"]>;
        Relationships: [];
      };
      estimate_signature_events: {
        Row: {
          id: string;
          company_id: string;
          estimate_id: string;
          kind: string;
          signer_role: string;
          contact_id: string | null;
          signer_name: string;
          token_suffix: string;
          token_sha256: string;
          ip_address: string;
          forwarded_for: string;
          user_agent: string;
          accept_language: string;
          time_zone: string;
          delivery_channel: string;
          delivery_to: string;
          consent_text: string;
          consent_version: string;
          document_sha256: string;
          document_snapshot: Json;
          captured_in_office: boolean;
          staff_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          estimate_id: string;
          kind: string;
          signer_role?: string;
          contact_id?: string | null;
          signer_name?: string;
          token_suffix?: string;
          token_sha256?: string;
          ip_address?: string;
          forwarded_for?: string;
          user_agent?: string;
          accept_language?: string;
          time_zone?: string;
          delivery_channel?: string;
          delivery_to?: string;
          consent_text?: string;
          consent_version?: string;
          document_sha256?: string;
          document_snapshot?: Json;
          captured_in_office?: boolean;
          staff_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_signature_events"]["Insert"]>;
        Relationships: [];
      };
      qbwc_connectors: {
        Row: {
          company_id: string;
          username: string;
          password_hash: string;
          owner_id: string;
          file_id: string;
          default_item_name: string;
          bank_account_name: string;
          cc_account_name: string;
          enabled: boolean;
          last_connected_at: string | null;
          last_error: string;
          vendor_sync_requested: boolean;
          vendors_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          username: string;
          password_hash: string;
          owner_id?: string;
          file_id?: string;
          default_item_name?: string;
          bank_account_name?: string;
          cc_account_name?: string;
          enabled?: boolean;
          last_connected_at?: string | null;
          last_error?: string;
          vendor_sync_requested?: boolean;
          vendors_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["qbwc_connectors"]["Insert"]>;
        Relationships: [];
      };
      qbwc_sessions: {
        Row: {
          ticket: string;
          company_id: string;
          invoice_id: string | null;
          expense_id: string | null;
          payment_id: string | null;
          step: string;
          last_error: string;
          resolved_customer: string;
          resolved_customer_list_id: string;
          resolved_job_list_id: string;
          vendor_sync: boolean;
          vendor_iterator_id: string;
          vendor_sync_started_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          ticket?: string;
          company_id: string;
          invoice_id?: string | null;
          expense_id?: string | null;
          payment_id?: string | null;
          step?: string;
          last_error?: string;
          resolved_customer?: string;
          resolved_customer_list_id?: string;
          resolved_job_list_id?: string;
          vendor_sync?: boolean;
          vendor_iterator_id?: string;
          vendor_sync_started_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["qbwc_sessions"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      qbwc_request_vendor_sync: {
        Args: Record<string, never>;
        Returns: Json;
      };
      qbwc_save_vendors: {
        Args: {
          p_ticket: string;
          p_vendors?: Json;
          p_iterator_id?: string;
          p_done?: boolean;
          p_abort?: boolean;
        };
        Returns: Json;
      };
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
      save_gmail_tokens: {
        Args: {
          p_staff_id: string;
          p_google_email: string;
          p_refresh_token: string;
          p_access_token: string;
          p_token_expires_at: string;
        };
        Returns: string;
      };
      gmail_credentials: {
        Args: { target_staff_id: string };
        Returns: {
          account_id: string;
          refresh_token: string | null;
          access_token: string | null;
          token_expires_at: string | null;
          google_email: string;
        }[];
      };
      disconnect_gmail: {
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
      shared_page: {
        Args: { p_token: string };
        Returns: Json;
      };
      shared_job_file: {
        Args: { p_token: string };
        Returns: Json;
      };
      storage_share_access: {
        Args: { p_token: string; p_path: string };
        Returns: boolean;
      };
      shared_card: {
        Args: { p_company: string; p_person: string };
        Returns: Json;
      };
      record_card_event: {
        Args: {
          p_company: string;
          p_person: string;
          p_kind: string;
          p_detail?: string;
          p_ip?: string;
          p_user_agent?: string;
        };
        Returns: undefined;
      };
      card_event_totals: {
        Args: { p_since?: string | null };
        Returns: { staff_id: string; kind: string; total: number }[];
      };
      shared_link_sender: {
        Args: { p_token: string };
        Returns: Json;
      };
      sign_shared_estimate: {
        Args: { p_token: string; p_signer_name: string; p_signature: string };
        Returns: Json;
      };
      record_estimate_share_event: {
        Args: {
          p_token: string;
          p_kind: string;
          p_signer_name?: string;
          p_consent_text?: string;
          p_consent_version?: string;
          p_document_sha256?: string;
          p_document_snapshot?: Json;
          p_ip?: string;
          p_forwarded_for?: string;
          p_user_agent?: string;
          p_accept_language?: string;
          p_time_zone?: string;
          p_delivery_channel?: string;
          p_delivery_to?: string;
        };
        Returns: Json;
      };
      shared_estimate_audit: {
        Args: { p_token: string };
        Returns: Json;
      };
      select_shared_estimate_line: {
        Args: { p_token: string; p_line_id: string; p_selected: boolean };
        Returns: Json;
      };
      select_shared_estimate_package: {
        Args: { p_token: string; p_package: string };
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
      ingest_inbound_text: {
        Args: {
          p_from: string;
          p_body: string;
          p_handle?: string;
          p_media_url?: string;
          p_sent_at?: string | null;
        };
        Returns: Json;
      };
      eagleview_ingest_webhook: {
        Args: {
          p_token: string;
          p_reference_id?: string;
          p_report_id?: string;
          p_order_id?: string;
          p_status_id?: number | null;
          p_status_detail?: string;
        };
        Returns: Json;
      };
      qbwc_upsert_connector: {
        Args: { p_password: string; p_item_name?: string };
        Returns: Json;
      };
      qbwc_authenticate: {
        Args: { p_username: string; p_password: string };
        Returns: Json;
      };
      qbwc_next_work: {
        Args: { p_ticket: string };
        Returns: Json;
      };
      qbwc_apply_response: {
        Args: {
          p_ticket: string;
          p_action: string;
          p_next_step?: string;
          p_txn_id?: string;
          p_error?: string;
          p_customer_name?: string;
          p_customer_list_id?: string;
          p_job_list_id?: string;
        };
        Returns: Json;
      };
      qbwc_get_last_error: {
        Args: { p_ticket: string };
        Returns: string;
      };
      qbwc_close: {
        Args: { p_ticket: string };
        Returns: Json;
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
      activity_type: "note" | "call" | "email" | "meeting" | "site_walk" | "stage_change" | "audit" | "text";
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
