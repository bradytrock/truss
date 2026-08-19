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
    };
    CompositeTypes: Record<string, never>;
  };
};
