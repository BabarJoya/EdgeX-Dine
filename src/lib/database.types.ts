
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"data": NonNullable<Json>,"entity": string,"entity_id": string | null,"id": number,"tenant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"id"?: never,"tenant_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"id"?: never,"tenant_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"branches": {
                  Row: {
                    "address": string | null,"city": string | null,"code": string | null,"created_at": string,"id": string,"is_active": boolean,"name": string,"phone": string | null,"tenant_id": string,"timezone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"city"?: string | null,"code"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"phone"?: string | null,"tenant_id": string,"timezone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"city"?: string | null,"code"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string | null,"tenant_id"?: string,"timezone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branches_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"member_branches": {
                  Row: {
                    "branch_id": string,"member_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"member_id": string,"tenant_id": string
                  }
                  Update: {
                    "branch_id"?: string,"member_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_branches_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "member_branches_member_id_tenant_id_fkey"
      columns: ["member_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tenant_members"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"data": NonNullable<Json>,"id": string,"read_at": string | null,"tenant_id": string,"title": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"read_at"?: string | null,"tenant_id": string,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"read_at"?: string | null,"tenant_id"?: string,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "description": string,"key": string,"label": string,"module": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string,"key": string,"label": string,"module": string,"sort_order"?: number
                  }
                  Update: {
                    "description"?: string,"key"?: string,"label"?: string,"module"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"is_platform_admin": boolean,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"full_name"?: string,"id": string,"is_platform_admin"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"is_platform_admin"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_key": string,"role_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_key": string,"role_id": string,"tenant_id": string
                  }
                  Update: {
                    "permission_key"?: string,"role_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_tenant_id_fkey"
      columns: ["role_id","tenant_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"role_templates": {
                  Row: {
                    "description": string,"key": string,"name": string,"permissions": (string)[],"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string,"key": string,"name": string,"permissions"?: (string)[],"sort_order"?: number
                  }
                  Update: {
                    "description"?: string,"key"?: string,"name"?: string,"permissions"?: (string)[],"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"is_owner": boolean,"is_system": boolean,"name": string,"template_key": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"id"?: string,"is_owner"?: boolean,"is_system"?: boolean,"name": string,"template_key"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"is_owner"?: boolean,"is_system"?: boolean,"name"?: string,"template_key"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_template_key_fkey"
      columns: ["template_key"]
isOneToOne: false
      referencedRelation: "role_templates"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "roles_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_plans": {
                  Row: {
                    "code": string,"created_at": string,"currency": string,"description": string,"features": (string)[],"id": string,"is_active": boolean,"is_default_trial": boolean,"limits": NonNullable<Json>,"name": string,"price_monthly_minor": number,"price_yearly_minor": number,"sort_order": number,"trial_days": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"currency"?: string,"description"?: string,"features"?: (string)[],"id"?: string,"is_active"?: boolean,"is_default_trial"?: boolean,"limits"?: NonNullable<Json>,"name": string,"price_monthly_minor"?: number,"price_yearly_minor"?: number,"sort_order"?: number,"trial_days"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"currency"?: string,"description"?: string,"features"?: (string)[],"id"?: string,"is_active"?: boolean,"is_default_trial"?: boolean,"limits"?: NonNullable<Json>,"name"?: string,"price_monthly_minor"?: number,"price_yearly_minor"?: number,"sort_order"?: number,"trial_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "billing_cycle": Database["public"]['Enums']["billing_cycle"],"created_at": string,"current_period_end": string | null,"id": string,"plan_id": string,"status": Database["public"]['Enums']["subscription_status"],"tenant_id": string,"trial_ends_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_cycle"?: Database["public"]['Enums']["billing_cycle"],"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"plan_id": string,"status"?: Database["public"]['Enums']["subscription_status"],"tenant_id": string,"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "billing_cycle"?: Database["public"]['Enums']["billing_cycle"],"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"plan_id"?: string,"status"?: Database["public"]['Enums']["subscription_status"],"tenant_id"?: string,"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: true
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_invites": {
                  Row: {
                    "accepted_at": string | null,"all_branches": boolean,"branch_ids": (string)[],"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"role_id": string,"tenant_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"all_branches"?: boolean,"branch_ids"?: (string)[],"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"role_id": string,"tenant_id": string,"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"all_branches"?: boolean,"branch_ids"?: (string)[],"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"role_id"?: string,"tenant_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_invites_role_id_tenant_id_fkey"
      columns: ["role_id","tenant_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "tenant_invites_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_members": {
                  Row: {
                    "all_branches": boolean,"created_at": string,"id": string,"role_id": string,"status": Database["public"]['Enums']["member_status"],"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_branches"?: boolean,"created_at"?: string,"id"?: string,"role_id": string,"status"?: Database["public"]['Enums']["member_status"],"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "all_branches"?: boolean,"created_at"?: string,"id"?: string,"role_id"?: string,"status"?: Database["public"]['Enums']["member_status"],"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_members_role_id_tenant_id_fkey"
      columns: ["role_id","tenant_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "tenant_members_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "brand_color": string | null,"country": string,"created_at": string,"created_by": string | null,"currency": string,"id": string,"logo_url": string | null,"name": string,"slug": string,"status": Database["public"]['Enums']["tenant_status"],"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_color"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"logo_url"?: string | null,"name": string,"slug": string,"status"?: Database["public"]['Enums']["tenant_status"],"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "brand_color"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"logo_url"?: string | null,"name"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["tenant_status"],"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"create_tenant":
{ Args: { "p_branch_name": string,"p_city"?: string,"p_country"?: string,"p_currency"?: string,"p_name": string,"p_slug": string,"p_timezone"?: string }; Returns: string
                           },
"get_invite":
{ Args: { "p_token": string }; Returns: {
              "email": string,"is_valid": boolean,"role_name": string,"tenant_name": string
            }[]
                           },
"invite_member":
{ Args: { "p_all_branches"?: boolean,"p_branch_ids"?: (string)[],"p_email": string,"p_role_id": string,"p_tenant_id": string }; Returns: string
                           },
"is_slug_available":
{ Args: { "p_slug": string }; Returns: boolean
                           },
"my_permissions":
{ Args: { "p_tenant_id": string }; Returns: (string)[]
                           },
"remove_member":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"set_role_permissions":
{ Args: { "p_permissions": (string)[],"p_role_id": string }; Returns: undefined
                           },
"update_member":
{ Args: { "p_all_branches": boolean,"p_branch_ids"?: (string)[],"p_member_id": string,"p_role_id": string,"p_status"?: Database["public"]['Enums']["member_status"] }; Returns: undefined
                           }
          }
          Enums: {
            "billing_cycle": "monthly"|"yearly","member_status": "active"|"disabled","subscription_status": "trialing"|"active"|"past_due"|"canceled"|"expired","tenant_status": "active"|"suspended"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "billing_cycle": ["monthly", "yearly"],"member_status": ["active", "disabled"],"subscription_status": ["trialing", "active", "past_due", "canceled", "expired"],"tenant_status": ["active", "suspended"]
          }
        }
} as const
