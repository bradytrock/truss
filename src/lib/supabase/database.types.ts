export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          company_id: string;
          full_name: string;
          title: string;
          initials: string;
          created_at: string;
        };
        Insert: {
          id: string;
          company_id: string;
          full_name: string;
          title?: string;
          initials: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          full_name?: string;
          title?: string;
          initials?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: { id: string; company_id: string; name: string; title: string; created_at: string };
        Insert: { id?: string; company_id: string; name: string; title?: string; created_at?: string };
        Update: { name?: string; title?: string };
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
          client_id: string;
          name: string;
          title: string;
          email: string;
          phone: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          client_id: string;
          name: string;
          title?: string;
          email?: string;
          phone?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      opportunities: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          client_id: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          client_id: string;
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
          created_at?: string;
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
          client_id: string;
          status: Database["public"]["Enums"]["job_status"];
          contract_value: number;
          start_date: string;
          substantial_completion: string | null;
          superintendent: string;
          project_manager: string;
          location: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          opportunity_id?: string | null;
          name: string;
          client_id: string;
          status?: Database["public"]["Enums"]["job_status"];
          contract_value?: number;
          start_date?: string;
          substantial_completion?: string | null;
          superintendent?: string;
          project_manager?: string;
          location?: string;
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
          client_id: string;
          opportunity_id: string | null;
          job_id: string | null;
          status: Database["public"]["Enums"]["estimate_status"];
          notes: string;
          valid_until: string | null;
          sent_at: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          number: string;
          name: string;
          client_id: string;
          opportunity_id?: string | null;
          job_id?: string | null;
          status?: Database["public"]["Enums"]["estimate_status"];
          notes?: string;
          valid_until?: string | null;
          sent_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
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
          description: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          company_id: string;
          estimate_id: string;
          catalog_item_id?: string | null;
          description: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_lines"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          company_id: string;
          number: string;
          name: string;
          client_id: string;
          job_id: string | null;
          estimate_id: string | null;
          status: Database["public"]["Enums"]["invoice_status"];
          issued_at: string;
          due_at: string | null;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          number: string;
          name: string;
          client_id: string;
          job_id?: string | null;
          estimate_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          issued_at?: string;
          due_at?: string | null;
          notes?: string;
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
          invoice_id: string;
          amount: number;
          method: string;
          paid_at: string;
          reference: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          invoice_id: string;
          amount: number;
          method?: string;
          paid_at?: string;
          reference?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
        | "commercial"
        | "multifamily"
        | "healthcare"
        | "education"
        | "industrial"
        | "hospitality"
        | "civic"
        | "tenant_improvement";
      delivery_method: "design_bid_build" | "cm_at_risk" | "design_build" | "gc_mp";
      client_type: "owner" | "developer" | "public" | "healthcare_system" | "architect";
      activity_type: "note" | "call" | "email" | "meeting" | "site_walk" | "stage_change";
      entity_kind: "opportunity" | "job" | "client";
      catalog_kind: "labor" | "material" | "equipment" | "allowance" | "subcontract";
      estimate_status: "draft" | "sent" | "viewed" | "accepted" | "declined";
      invoice_status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
      event_kind: "site_walk" | "pre_bid" | "inspection" | "production" | "meeting" | "punch";
      photo_category: "before" | "progress" | "after" | "issue";
    };
    CompositeTypes: Record<string, never>;
  };
};
