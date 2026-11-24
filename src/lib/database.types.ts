
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
                },"bill_counters": {
                  Row: {
                    "branch_id": string,"business_date": string,"last_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_date": string,"last_number"?: number
                  }
                  Update: {
                    "branch_id"?: string,"business_date"?: string,"last_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_counters_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"bills": {
                  Row: {
                    "base_minor": number,"bill_number": number,"branch_id": string,"business_date": string,"created_at": string,"created_by": string | null,"currency": string,"customer_name": string | null,"customer_phone": string | null,"discount_minor": number,"discount_note": string,"fiscal_authority": string | null,"fiscal_error": string | null,"fiscal_invoice_number": string | null,"fiscal_status": string | null,"id": string,"paid_at": string | null,"paid_base_minor": number,"paid_total_minor": number,"receipt_token": string,"service_bps": number,"service_minor": number,"session_id": string | null,"status": Database["public"]['Enums']["bill_status"],"subtotal_minor": number,"tax_minor": number,"tenant_id": string,"type": Database["public"]['Enums']["order_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_minor"?: number,"bill_number": number,"branch_id": string,"business_date": string,"created_at"?: string,"created_by"?: string | null,"currency": string,"customer_name"?: string | null,"customer_phone"?: string | null,"discount_minor"?: number,"discount_note"?: string,"fiscal_authority"?: string | null,"fiscal_error"?: string | null,"fiscal_invoice_number"?: string | null,"fiscal_status"?: string | null,"id"?: string,"paid_at"?: string | null,"paid_base_minor"?: number,"paid_total_minor"?: number,"receipt_token"?: string,"service_bps"?: number,"service_minor"?: number,"session_id"?: string | null,"status"?: Database["public"]['Enums']["bill_status"],"subtotal_minor"?: number,"tax_minor"?: number,"tenant_id": string,"type"?: Database["public"]['Enums']["order_type"],"updated_at"?: string
                  }
                  Update: {
                    "base_minor"?: number,"bill_number"?: number,"branch_id"?: string,"business_date"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_name"?: string | null,"customer_phone"?: string | null,"discount_minor"?: number,"discount_note"?: string,"fiscal_authority"?: string | null,"fiscal_error"?: string | null,"fiscal_invoice_number"?: string | null,"fiscal_status"?: string | null,"id"?: string,"paid_at"?: string | null,"paid_base_minor"?: number,"paid_total_minor"?: number,"receipt_token"?: string,"service_bps"?: number,"service_minor"?: number,"session_id"?: string | null,"status"?: Database["public"]['Enums']["bill_status"],"subtotal_minor"?: number,"tax_minor"?: number,"tenant_id"?: string,"type"?: Database["public"]['Enums']["order_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bills_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "bills_session_id_tenant_id_fkey"
      columns: ["session_id","tenant_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "address": string | null,"city": string | null,"code": string | null,"created_at": string,"google_review_url": string | null,"id": string,"is_active": boolean,"name": string,"phone": string | null,"receipt_footer": string | null,"service_charge_bps": number,"tax_card_bps": number,"tax_cash_bps": number,"tax_label": string,"tax_registration": string | null,"tax_wallet_bps": number,"tenant_id": string,"timezone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"city"?: string | null,"code"?: string | null,"created_at"?: string,"google_review_url"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"phone"?: string | null,"receipt_footer"?: string | null,"service_charge_bps"?: number,"tax_card_bps"?: number,"tax_cash_bps"?: number,"tax_label"?: string,"tax_registration"?: string | null,"tax_wallet_bps"?: number,"tenant_id": string,"timezone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"city"?: string | null,"code"?: string | null,"created_at"?: string,"google_review_url"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string | null,"receipt_footer"?: string | null,"service_charge_bps"?: number,"tax_card_bps"?: number,"tax_cash_bps"?: number,"tax_label"?: string,"tax_registration"?: string | null,"tax_wallet_bps"?: number,"tenant_id"?: string,"timezone"?: string | null,"updated_at"?: string
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
                },"cash_movements": {
                  Row: {
                    "amount_minor": number,"created_at": string,"created_by": string | null,"id": string,"reason": string,"shift_id": string,"tenant_id": string,"type": Database["public"]['Enums']["cash_movement_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"reason": string,"shift_id": string,"tenant_id": string,"type": Database["public"]['Enums']["cash_movement_type"]
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"reason"?: string,"shift_id"?: string,"tenant_id"?: string,"type"?: Database["public"]['Enums']["cash_movement_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_movements_shift_id_tenant_id_fkey"
      columns: ["shift_id","tenant_id"]
isOneToOne: false
      referencedRelation: "cash_shifts"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"cash_shifts": {
                  Row: {
                    "branch_id": string,"closed_at": string | null,"counted_cash_minor": number | null,"expected_cash_minor": number | null,"id": string,"notes": string,"opened_at": string,"opening_float_minor": number,"status": Database["public"]['Enums']["shift_status"],"tenant_id": string,"user_id": string,"variance_minor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"closed_at"?: string | null,"counted_cash_minor"?: number | null,"expected_cash_minor"?: number | null,"id"?: string,"notes"?: string,"opened_at"?: string,"opening_float_minor"?: number,"status"?: Database["public"]['Enums']["shift_status"],"tenant_id": string,"user_id": string,"variance_minor"?: number | null
                  }
                  Update: {
                    "branch_id"?: string,"closed_at"?: string | null,"counted_cash_minor"?: number | null,"expected_cash_minor"?: number | null,"id"?: string,"notes"?: string,"opened_at"?: string,"opening_float_minor"?: number,"status"?: Database["public"]['Enums']["shift_status"],"tenant_id"?: string,"user_id"?: string,"variance_minor"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_shifts_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"image_path": string | null,"is_active": boolean,"name": string,"parent_id": string | null,"sort_order": number,"tenant_id": string,"translations": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"name": string,"parent_id"?: string | null,"sort_order"?: number,"tenant_id": string,"translations"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"name"?: string,"parent_id"?: string | null,"sort_order"?: number,"tenant_id"?: string,"translations"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_tenant_id_fkey"
      columns: ["parent_id","tenant_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "categories_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount_minor": number,"branch_id": string,"category": string,"created_at": string,"created_by": string | null,"id": string,"note": string,"paid_to": string | null,"spent_on": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"branch_id": string,"category": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string,"paid_to"?: string | null,"spent_on": string,"tenant_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"branch_id"?: string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string,"paid_to"?: string | null,"spent_on"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"floor_areas": {
                  Row: {
                    "branch_id": string,"created_at": string,"id": string,"name": string,"sort_order": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"id"?: string,"name": string,"sort_order"?: number,"tenant_id": string
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "floor_areas_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"guest_requests": {
                  Row: {
                    "acknowledged_at": string | null,"branch_id": string,"created_at": string,"handled_by": string | null,"id": string,"note": string,"resolved_at": string | null,"session_id": string | null,"status": Database["public"]['Enums']["guest_request_status"],"table_id": string,"tenant_id": string,"type": Database["public"]['Enums']["guest_request_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"branch_id": string,"created_at"?: string,"handled_by"?: string | null,"id"?: string,"note"?: string,"resolved_at"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["guest_request_status"],"table_id": string,"tenant_id": string,"type": Database["public"]['Enums']["guest_request_type"]
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"branch_id"?: string,"created_at"?: string,"handled_by"?: string | null,"id"?: string,"note"?: string,"resolved_at"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["guest_request_status"],"table_id"?: string,"tenant_id"?: string,"type"?: Database["public"]['Enums']["guest_request_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "guest_requests_session_id_tenant_id_fkey"
      columns: ["session_id","tenant_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "guest_requests_table_id_tenant_id_fkey"
      columns: ["table_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"inventory_items": {
                  Row: {
                    "avg_cost_minor": number,"category": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"reorder_level": number,"sku": string | null,"tenant_id": string,"unit": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_cost_minor"?: number,"category"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"reorder_level"?: number,"sku"?: string | null,"tenant_id": string,"unit": string,"updated_at"?: string
                  }
                  Update: {
                    "avg_cost_minor"?: number,"category"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"reorder_level"?: number,"sku"?: string | null,"tenant_id"?: string,"unit"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_stock": {
                  Row: {
                    "branch_id": string,"item_id": string,"quantity": number,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"item_id": string,"quantity"?: number,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"item_id"?: string,"quantity"?: number,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_stock_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "inventory_stock_item_id_tenant_id_fkey"
      columns: ["item_id","tenant_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"kitchen_stations": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"sort_order": number,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"sort_order"?: number,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kitchen_stations_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"kitchen_tickets": {
                  Row: {
                    "accepted_at": string | null,"branch_id": string,"created_at": string,"id": string,"order_id": string,"priority": boolean,"ready_at": string | null,"started_at": string | null,"station_id": string | null,"station_key": string | null,"status": Database["public"]['Enums']["ticket_status"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"branch_id": string,"created_at"?: string,"id"?: string,"order_id": string,"priority"?: boolean,"ready_at"?: string | null,"started_at"?: string | null,"station_id"?: string | null,"station_key"?: never,"status"?: Database["public"]['Enums']["ticket_status"],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"branch_id"?: string,"created_at"?: string,"id"?: string,"order_id"?: string,"priority"?: boolean,"ready_at"?: string | null,"started_at"?: string | null,"station_id"?: string | null,"station_key"?: never,"status"?: Database["public"]['Enums']["ticket_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kitchen_tickets_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "kitchen_tickets_order_id_tenant_id_fkey"
      columns: ["order_id","tenant_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "kitchen_tickets_station_id_fkey"
      columns: ["station_id"]
isOneToOne: false
      referencedRelation: "kitchen_stations"
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
                },"message_outbox": {
                  Row: {
                    "attempts": number,"branch_id": string | null,"channel": string,"created_at": string,"error": string | null,"id": string,"kind": string,"params": NonNullable<Json>,"provider_message_id": string | null,"ref_id": string,"sent_at": string | null,"status": string,"tenant_id": string,"to_phone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"branch_id"?: string | null,"channel"?: string,"created_at"?: string,"error"?: string | null,"id"?: string,"kind": string,"params"?: NonNullable<Json>,"provider_message_id"?: string | null,"ref_id": string,"sent_at"?: string | null,"status"?: string,"tenant_id": string,"to_phone"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"branch_id"?: string | null,"channel"?: string,"created_at"?: string,"error"?: string | null,"id"?: string,"kind"?: string,"params"?: NonNullable<Json>,"provider_message_id"?: string | null,"ref_id"?: string,"sent_at"?: string | null,"status"?: string,"tenant_id"?: string,"to_phone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_outbox_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"modifier_groups": {
                  Row: {
                    "created_at": string,"id": string,"max_select": number,"min_select": number,"name": string,"sort_order": number,"tenant_id": string,"translations": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"max_select"?: number,"min_select"?: number,"name": string,"sort_order"?: number,"tenant_id": string,"translations"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"max_select"?: number,"min_select"?: number,"name"?: string,"sort_order"?: number,"tenant_id"?: string,"translations"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifier_groups_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"modifiers": {
                  Row: {
                    "group_id": string,"id": string,"is_available": boolean,"name": string,"price_minor": number,"sort_order": number,"tenant_id": string,"translations": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"id"?: string,"is_available"?: boolean,"name": string,"price_minor"?: number,"sort_order"?: number,"tenant_id": string,"translations"?: NonNullable<Json>
                  }
                  Update: {
                    "group_id"?: string,"id"?: string,"is_available"?: boolean,"name"?: string,"price_minor"?: number,"sort_order"?: number,"tenant_id"?: string,"translations"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifiers_group_id_tenant_id_fkey"
      columns: ["group_id","tenant_id"]
isOneToOne: false
      referencedRelation: "modifier_groups"
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
                },"online_payments": {
                  Row: {
                    "amount_minor": number,"base_minor": number,"bill_id": string,"branch_id": string,"completed_at": string | null,"created_at": string,"expires_at": string,"id": string,"needs_review": boolean,"payment_id": string | null,"provider": string,"provider_ref": string | null,"response_code": string | null,"response_message": string | null,"status": string,"tax_bps": number,"tax_minor": number,"tenant_id": string,"txn_ref": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"base_minor": number,"bill_id": string,"branch_id": string,"completed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"needs_review"?: boolean,"payment_id"?: string | null,"provider": string,"provider_ref"?: string | null,"response_code"?: string | null,"response_message"?: string | null,"status"?: string,"tax_bps": number,"tax_minor": number,"tenant_id": string,"txn_ref"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"base_minor"?: number,"bill_id"?: string,"branch_id"?: string,"completed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"needs_review"?: boolean,"payment_id"?: string | null,"provider"?: string,"provider_ref"?: string | null,"response_code"?: string | null,"response_message"?: string | null,"status"?: string,"tax_bps"?: number,"tax_minor"?: number,"tenant_id"?: string,"txn_ref"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "online_payments_bill_id_tenant_id_fkey"
      columns: ["bill_id","tenant_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "online_payments_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "online_payments_payment_id_tenant_id_fkey"
      columns: ["payment_id","tenant_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"order_counters": {
                  Row: {
                    "branch_id": string,"business_date": string,"last_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_date": string,"last_number"?: number
                  }
                  Update: {
                    "branch_id"?: string,"business_date"?: string,"last_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_counters_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"order_item_modifiers": {
                  Row: {
                    "group_name": string,"id": string,"modifier_id": string | null,"name": string,"order_item_id": string,"price_minor": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_name": string,"id"?: string,"modifier_id"?: string | null,"name": string,"order_item_id": string,"price_minor": number,"tenant_id": string
                  }
                  Update: {
                    "group_name"?: string,"id"?: string,"modifier_id"?: string | null,"name"?: string,"order_item_id"?: string,"price_minor"?: number,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_item_modifiers_modifier_id_fkey"
      columns: ["modifier_id"]
isOneToOne: false
      referencedRelation: "modifiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_modifiers_order_item_id_tenant_id_fkey"
      columns: ["order_item_id","tenant_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"id": string,"kitchen_station_id": string | null,"line_total_minor": number,"modifiers_minor": number,"name": string,"notes": string,"order_id": string,"product_id": string | null,"quantity": number,"status": Database["public"]['Enums']["order_status"],"tenant_id": string,"unit_price_minor": number,"variant_id": string | null,"variant_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kitchen_station_id"?: string | null,"line_total_minor": number,"modifiers_minor"?: number,"name": string,"notes"?: string,"order_id": string,"product_id"?: string | null,"quantity": number,"status"?: Database["public"]['Enums']["order_status"],"tenant_id": string,"unit_price_minor": number,"variant_id"?: string | null,"variant_name"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kitchen_station_id"?: string | null,"line_total_minor"?: number,"modifiers_minor"?: number,"name"?: string,"notes"?: string,"order_id"?: string,"product_id"?: string | null,"quantity"?: number,"status"?: Database["public"]['Enums']["order_status"],"tenant_id"?: string,"unit_price_minor"?: number,"variant_id"?: string | null,"variant_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_kitchen_station_id_fkey"
      columns: ["kitchen_station_id"]
isOneToOne: false
      referencedRelation: "kitchen_stations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_tenant_id_fkey"
      columns: ["order_id","tenant_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "accepted_at": string | null,"bill_id": string | null,"branch_id": string,"business_date": string,"cancel_reason": string | null,"created_at": string,"created_by": string | null,"currency": string,"discount_minor": number,"id": string,"notes": string,"order_number": number,"ready_at": string | null,"served_at": string | null,"service_minor": number,"session_id": string | null,"source": Database["public"]['Enums']["order_source"],"status": Database["public"]['Enums']["order_status"],"subtotal_minor": number,"table_id": string | null,"tax_minor": number,"tenant_id": string,"total_minor": number,"type": Database["public"]['Enums']["order_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"bill_id"?: string | null,"branch_id": string,"business_date": string,"cancel_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency": string,"discount_minor"?: number,"id"?: string,"notes"?: string,"order_number": number,"ready_at"?: string | null,"served_at"?: string | null,"service_minor"?: number,"session_id"?: string | null,"source": Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"subtotal_minor"?: number,"table_id"?: string | null,"tax_minor"?: number,"tenant_id": string,"total_minor"?: number,"type"?: Database["public"]['Enums']["order_type"],"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"bill_id"?: string | null,"branch_id"?: string,"business_date"?: string,"cancel_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"discount_minor"?: number,"id"?: string,"notes"?: string,"order_number"?: number,"ready_at"?: string | null,"served_at"?: string | null,"service_minor"?: number,"session_id"?: string | null,"source"?: Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"subtotal_minor"?: number,"table_id"?: string | null,"tax_minor"?: number,"tenant_id"?: string,"total_minor"?: number,"type"?: Database["public"]['Enums']["order_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_bill_fk"
      columns: ["bill_id","tenant_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "orders_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "orders_session_id_tenant_id_fkey"
      columns: ["session_id","tenant_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "orders_table_id_tenant_id_fkey"
      columns: ["table_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_minor": number,"base_minor": number,"bill_id": string,"branch_id": string,"change_minor": number,"created_at": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"note": string,"provider": string | null,"received_by": string | null,"reference": string | null,"shift_id": string | null,"status": Database["public"]['Enums']["payment_status"],"tax_bps": number,"tax_minor": number,"tenant_id": string,"tendered_minor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"base_minor": number,"bill_id": string,"branch_id": string,"change_minor"?: number,"created_at"?: string,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"note"?: string,"provider"?: string | null,"received_by"?: string | null,"reference"?: string | null,"shift_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"tax_bps": number,"tax_minor": number,"tenant_id": string,"tendered_minor"?: number | null
                  }
                  Update: {
                    "amount_minor"?: number,"base_minor"?: number,"bill_id"?: string,"branch_id"?: string,"change_minor"?: number,"created_at"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"note"?: string,"provider"?: string | null,"received_by"?: string | null,"reference"?: string | null,"shift_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"tax_bps"?: number,"tax_minor"?: number,"tenant_id"?: string,"tendered_minor"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_bill_id_tenant_id_fkey"
      columns: ["bill_id","tenant_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "payments_shift_id_tenant_id_fkey"
      columns: ["shift_id","tenant_id"]
isOneToOne: false
      referencedRelation: "cash_shifts"
      referencedColumns: ["id","tenant_id"]
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
                },"platform_settings": {
                  Row: {
                    "grace_days": number,"id": boolean,"require_approval": boolean,"support_email": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "grace_days"?: number,"id"?: boolean,"require_approval"?: boolean,"support_email"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "grace_days"?: number,"id"?: boolean,"require_approval"?: boolean,"support_email"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pos_operator_sessions": {
                  Row: {
                    "branch_id": string,"created_at": string,"device_user_id": string,"expires_at": string,"operator_id": string,"revoked_at": string | null,"tenant_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"device_user_id": string,"expires_at"?: string,"operator_id": string,"revoked_at"?: string | null,"tenant_id": string,"token"?: string
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"device_user_id"?: string,"expires_at"?: string,"operator_id"?: string,"revoked_at"?: string | null,"tenant_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_operator_sessions_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pos_operator_sessions_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_unlock_attempts": {
                  Row: {
                    "device_user_id": string,"failures": number,"locked_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "device_user_id": string,"failures"?: number,"locked_until"?: string | null
                  }
                  Update: {
                    "device_user_id"?: string,"failures"?: number,"locked_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"product_branch_overrides": {
                  Row: {
                    "branch_id": string,"is_available": boolean | null,"price_minor": number | null,"product_id": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"is_available"?: boolean | null,"price_minor"?: number | null,"product_id": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"is_available"?: boolean | null,"price_minor"?: number | null,"product_id"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_branch_overrides_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "product_branch_overrides_product_id_tenant_id_fkey"
      columns: ["product_id","tenant_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"product_modifier_groups": {
                  Row: {
                    "group_id": string,"product_id": string,"sort_order": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"product_id": string,"sort_order"?: number,"tenant_id": string
                  }
                  Update: {
                    "group_id"?: string,"product_id"?: string,"sort_order"?: number,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_modifier_groups_group_id_tenant_id_fkey"
      columns: ["group_id","tenant_id"]
isOneToOne: false
      referencedRelation: "modifier_groups"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "product_modifier_groups_product_id_tenant_id_fkey"
      columns: ["product_id","tenant_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "id": string,"is_default": boolean,"name": string,"price_minor": number,"product_id": string,"sort_order": number,"tenant_id": string,"translations": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"is_default"?: boolean,"name": string,"price_minor": number,"product_id": string,"sort_order"?: number,"tenant_id": string,"translations"?: NonNullable<Json>
                  }
                  Update: {
                    "id"?: string,"is_default"?: boolean,"name"?: string,"price_minor"?: number,"product_id"?: string,"sort_order"?: number,"tenant_id"?: string,"translations"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_tenant_id_fkey"
      columns: ["product_id","tenant_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"products": {
                  Row: {
                    "category_id": string,"compare_at_price_minor": number | null,"created_at": string,"description": string,"id": string,"image_path": string | null,"is_active": boolean,"is_available": boolean,"kitchen_station_id": string | null,"name": string,"prep_time_minutes": number | null,"price_minor": number,"sku": string | null,"sort_order": number,"tags": (string)[],"tenant_id": string,"translations": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"compare_at_price_minor"?: number | null,"created_at"?: string,"description"?: string,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"is_available"?: boolean,"kitchen_station_id"?: string | null,"name": string,"prep_time_minutes"?: number | null,"price_minor"?: number,"sku"?: string | null,"sort_order"?: number,"tags"?: (string)[],"tenant_id": string,"translations"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"compare_at_price_minor"?: number | null,"created_at"?: string,"description"?: string,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"is_available"?: boolean,"kitchen_station_id"?: string | null,"name"?: string,"prep_time_minutes"?: number | null,"price_minor"?: number,"sku"?: string | null,"sort_order"?: number,"tags"?: (string)[],"tenant_id"?: string,"translations"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_tenant_id_fkey"
      columns: ["category_id","tenant_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "products_kitchen_station_id_tenant_id_fkey"
      columns: ["kitchen_station_id","tenant_id"]
isOneToOne: false
      referencedRelation: "kitchen_stations"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "products_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
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
                },"purchase_items": {
                  Row: {
                    "id": string,"item_id": string,"purchase_id": string,"quantity": number,"tenant_id": string,"total_minor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"item_id": string,"purchase_id": string,"quantity": number,"tenant_id": string,"total_minor": number
                  }
                  Update: {
                    "id"?: string,"item_id"?: string,"purchase_id"?: string,"quantity"?: number,"tenant_id"?: string,"total_minor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_items_item_id_tenant_id_fkey"
      columns: ["item_id","tenant_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "purchase_items_purchase_id_tenant_id_fkey"
      columns: ["purchase_id","tenant_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"purchases": {
                  Row: {
                    "branch_id": string,"created_at": string,"created_by": string | null,"id": string,"notes": string,"received_at": string | null,"received_by": string | null,"reference": string | null,"status": string,"supplier_id": string | null,"tenant_id": string,"total_minor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string,"received_at"?: string | null,"received_by"?: string | null,"reference"?: string | null,"status"?: string,"supplier_id"?: string | null,"tenant_id": string,"total_minor"?: number
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string,"received_at"?: string | null,"received_by"?: string | null,"reference"?: string | null,"status"?: string,"supplier_id"?: string | null,"tenant_id"?: string,"total_minor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "purchases_supplier_id_tenant_id_fkey"
      columns: ["supplier_id","tenant_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"recipe_items": {
                  Row: {
                    "id": string,"item_id": string,"modifier_id": string | null,"product_id": string | null,"quantity": number,"tenant_id": string,"variant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"item_id": string,"modifier_id"?: string | null,"product_id"?: string | null,"quantity": number,"tenant_id": string,"variant_id"?: string | null
                  }
                  Update: {
                    "id"?: string,"item_id"?: string,"modifier_id"?: string | null,"product_id"?: string | null,"quantity"?: number,"tenant_id"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_items_item_id_tenant_id_fkey"
      columns: ["item_id","tenant_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "recipe_items_modifier_id_fkey"
      columns: ["modifier_id"]
isOneToOne: false
      referencedRelation: "modifiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"refunds": {
                  Row: {
                    "amount_minor": number,"created_at": string,"id": string,"payment_id": string,"reason": string,"refunded_by": string,"shift_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"id"?: string,"payment_id": string,"reason": string,"refunded_by": string,"shift_id": string,"tenant_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"id"?: string,"payment_id"?: string,"reason"?: string,"refunded_by"?: string,"shift_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_payment_id_tenant_id_fkey"
      columns: ["payment_id","tenant_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "refunds_shift_id_tenant_id_fkey"
      columns: ["shift_id","tenant_id"]
isOneToOne: false
      referencedRelation: "cash_shifts"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "bill_id": string,"branch_id": string,"comment": string,"created_at": string,"customer_name": string | null,"customer_phone": string | null,"id": string,"rating": number,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_id": string,"branch_id": string,"comment"?: string,"created_at"?: string,"customer_name"?: string | null,"customer_phone"?: string | null,"id"?: string,"rating": number,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bill_id"?: string,"branch_id"?: string,"comment"?: string,"created_at"?: string,"customer_name"?: string | null,"customer_phone"?: string | null,"id"?: string,"rating"?: number,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_bill_id_tenant_id_fkey"
      columns: ["bill_id","tenant_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "reviews_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    }
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
                },"staff_pins": {
                  Row: {
                    "member_id": string,"pin_hash": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "member_id": string,"pin_hash": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "member_id"?: string,"pin_hash"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_pins_member_id_tenant_id_fkey"
      columns: ["member_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tenant_members"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "branch_id": string,"business_date": string,"created_at": string,"created_by": string | null,"id": string,"item_id": string,"kind": Database["public"]['Enums']["stock_movement_kind"],"order_item_id": string | null,"purchase_id": string | null,"quantity": number,"reason": string | null,"tenant_id": string,"unit_cost_minor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_date": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id": string,"kind": Database["public"]['Enums']["stock_movement_kind"],"order_item_id"?: string | null,"purchase_id"?: string | null,"quantity": number,"reason"?: string | null,"tenant_id": string,"unit_cost_minor"?: number
                  }
                  Update: {
                    "branch_id"?: string,"business_date"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string,"kind"?: Database["public"]['Enums']["stock_movement_kind"],"order_item_id"?: string | null,"purchase_id"?: string | null,"quantity"?: number,"reason"?: string | null,"tenant_id"?: string,"unit_cost_minor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "stock_movements_item_id_tenant_id_fkey"
      columns: ["item_id","tenant_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"subscription_invoices": {
                  Row: {
                    "amount_minor": number,"billing_cycle": Database["public"]['Enums']["billing_cycle"],"created_at": string,"currency": string,"id": string,"method": string,"period_end": string,"period_start": string,"plan_id": string,"recorded_by": string | null,"reference": string | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"billing_cycle": Database["public"]['Enums']["billing_cycle"],"created_at"?: string,"currency": string,"id"?: string,"method": string,"period_end": string,"period_start": string,"plan_id": string,"recorded_by"?: string | null,"reference"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"billing_cycle"?: Database["public"]['Enums']["billing_cycle"],"created_at"?: string,"currency"?: string,"id"?: string,"method"?: string,"period_end"?: string,"period_start"?: string,"plan_id"?: string,"recorded_by"?: string | null,"reference"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_invoices_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_invoices_tenant_id_fkey"
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
                },"suppliers": {
                  Row: {
                    "contact_name": string | null,"created_at": string,"id": string,"is_active": boolean,"name": string,"notes": string,"ntn": string | null,"phone": string | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_name"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"notes"?: string,"ntn"?: string | null,"phone"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "contact_name"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"notes"?: string,"ntn"?: string | null,"phone"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"support_messages": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"from_platform": boolean,"id": string,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"from_platform"?: boolean,"id"?: string,"ticket_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"from_platform"?: boolean,"id"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_messages_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string,"id": string,"state": Database["public"]['Enums']["ticket_state"],"subject": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"created_by": string,"id"?: string,"state"?: Database["public"]['Enums']["ticket_state"],"subject": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"state"?: Database["public"]['Enums']["ticket_state"],"subject"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_tickets_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"table_sessions": {
                  Row: {
                    "branch_id": string,"closed_at": string | null,"closed_by": string | null,"guest_token": string,"id": string,"opened_at": string,"status": Database["public"]['Enums']["session_status"],"table_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"closed_at"?: string | null,"closed_by"?: string | null,"guest_token"?: string,"id"?: string,"opened_at"?: string,"status"?: Database["public"]['Enums']["session_status"],"table_id": string,"tenant_id": string
                  }
                  Update: {
                    "branch_id"?: string,"closed_at"?: string | null,"closed_by"?: string | null,"guest_token"?: string,"id"?: string,"opened_at"?: string,"status"?: Database["public"]['Enums']["session_status"],"table_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_sessions_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "table_sessions_table_id_tenant_id_fkey"
      columns: ["table_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"tables": {
                  Row: {
                    "area_id": string | null,"branch_id": string,"created_at": string,"id": string,"is_active": boolean,"label": string,"pos_x": number,"pos_y": number,"qr_token": string,"seats": number,"shape": Database["public"]['Enums']["table_shape"],"status": Database["public"]['Enums']["table_status"],"tenant_id": string,"updated_at": string,"waiter_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_id"?: string | null,"branch_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label": string,"pos_x"?: number,"pos_y"?: number,"qr_token"?: string,"seats"?: number,"shape"?: Database["public"]['Enums']["table_shape"],"status"?: Database["public"]['Enums']["table_status"],"tenant_id": string,"updated_at"?: string,"waiter_id"?: string | null
                  }
                  Update: {
                    "area_id"?: string | null,"branch_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label"?: string,"pos_x"?: number,"pos_y"?: number,"qr_token"?: string,"seats"?: number,"shape"?: Database["public"]['Enums']["table_shape"],"status"?: Database["public"]['Enums']["table_status"],"tenant_id"?: string,"updated_at"?: string,"waiter_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_area_id_branch_id_fkey"
      columns: ["area_id","branch_id"]
isOneToOne: false
      referencedRelation: "floor_areas"
      referencedColumns: ["id","branch_id"]
    },{
      foreignKeyName: "tables_branch_id_tenant_id_fkey"
      columns: ["branch_id","tenant_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"tenant_integrations": {
                  Row: {
                    "enabled": boolean,"mode": string,"provider": string,"secret_keys": (string)[],"settings": NonNullable<Json>,"tenant_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"mode"?: string,"provider": string,"secret_keys"?: (string)[],"settings"?: NonNullable<Json>,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "enabled"?: boolean,"mode"?: string,"provider"?: string,"secret_keys"?: (string)[],"settings"?: NonNullable<Json>,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_integrations_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
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
"admin_list_tenants":
{ Args: { "p_search"?: string }; Returns: Json
                           },
"admin_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_record_payment":
{ Args: { "p_amount_minor": number,"p_cycle": Database["public"]['Enums']["billing_cycle"],"p_method": string,"p_plan_id": string,"p_reference"?: string,"p_tenant_id": string }; Returns: string
                           },
"admin_set_subscription":
{ Args: { "p_cycle": Database["public"]['Enums']["billing_cycle"],"p_ends_at": string,"p_plan_id": string,"p_status": Database["public"]['Enums']["subscription_status"],"p_tenant_id": string }; Returns: undefined
                           },
"admin_set_tenant_status":
{ Args: { "p_reason": string,"p_status": Database["public"]['Enums']["tenant_status"],"p_tenant_id": string }; Returns: undefined
                           },
"admin_tenant_detail":
{ Args: { "p_tenant_id": string }; Returns: Json
                           },
"admin_update_settings":
{ Args: { "p_grace_days": number,"p_require_approval": boolean,"p_support_email": string }; Returns: undefined
                           },
"apply_bill_discount":
{ Args: { "p_amount_minor": number,"p_bill_id": string,"p_note": string,"p_operator_token"?: string }; Returns: undefined
                           },
"assign_table_waiter":
{ Args: { "p_table_id": string,"p_user_id": string }; Returns: undefined
                           },
"cancel_purchase":
{ Args: { "p_purchase_id": string }; Returns: undefined
                           },
"close_shift":
{ Args: { "p_counted_cash_minor": number,"p_notes"?: string,"p_operator_token"?: string,"p_shift_id": string }; Returns: Json
                           },
"close_table_session":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"count_stock":
{ Args: { "p_branch_id": string,"p_counts": Json,"p_note"?: string }; Returns: number
                           },
"create_counter_order":
{ Args: { "p_branch_id": string,"p_customer_name"?: string,"p_customer_phone"?: string,"p_items": Json,"p_notes"?: string,"p_operator_token"?: string,"p_type": Database["public"]['Enums']["order_type"] }; Returns: Json
                           },
"create_guest_request":
{ Args: { "p_note"?: string,"p_table_token": string,"p_type": Database["public"]['Enums']["guest_request_type"] }; Returns: Json
                           },
"create_support_ticket":
{ Args: { "p_body": string,"p_category": string,"p_subject": string,"p_tenant_id": string }; Returns: string
                           },
"create_tenant":
{ Args: { "p_branch_name": string,"p_city"?: string,"p_country"?: string,"p_currency"?: string,"p_name": string,"p_slug": string,"p_timezone"?: string }; Returns: string
                           },
"customer_detail":
{ Args: { "p_phone": string,"p_tenant_id": string }; Returns: Json
                           },
"customer_insights":
{ Args: { "p_branch_id": string,"p_from": string,"p_tenant_id": string,"p_to": string }; Returns: Json
                           },
"customers_list":
{ Args: { "p_branch_id"?: string,"p_search"?: string,"p_tenant_id": string }; Returns: Json
                           },
"dashboard_today":
{ Args: { "p_branch_id": string,"p_tenant_id": string }; Returns: Json
                           },
"delete_expense":
{ Args: { "p_expense_id": string }; Returns: undefined
                           },
"get_guest_menu":
{ Args: { "p_slug": string,"p_table_token"?: string }; Returns: Json
                           },
"get_guest_session":
{ Args: { "p_guest_token": string }; Returns: Json
                           },
"get_invite":
{ Args: { "p_token": string }; Returns: {
              "email": string,"is_valid": boolean,"role_name": string,"tenant_name": string
            }[]
                           },
"get_receipt":
{ Args: { "p_receipt_token": string }; Returns: Json
                           },
"get_receipt_payment_options":
{ Args: { "p_receipt_token": string }; Returns: Json
                           },
"get_review":
{ Args: { "p_receipt_token": string }; Returns: Json
                           },
"inventory_report":
{ Args: { "p_branch_id": string,"p_from": string,"p_tenant_id": string,"p_to": string }; Returns: Json
                           },
"invite_member":
{ Args: { "p_all_branches"?: boolean,"p_branch_ids"?: (string)[],"p_email": string,"p_role_id": string,"p_tenant_id": string }; Returns: string
                           },
"is_slug_available":
{ Args: { "p_slug": string }; Returns: boolean
                           },
"low_stock":
{ Args: { "p_branch_id"?: string,"p_tenant_id": string }; Returns: Json
                           },
"menu_costing":
{ Args: { "p_tenant_id": string }; Returns: Json
                           },
"merge_table_sessions":
{ Args: { "p_from_session_id": string,"p_into_session_id": string }; Returns: undefined
                           },
"my_permissions":
{ Args: { "p_tenant_id": string }; Returns: (string)[]
                           },
"my_tenant_access":
{ Args: { "p_tenant_id": string }; Returns: Json
                           },
"open_shift":
{ Args: { "p_branch_id": string,"p_opening_float_minor": number,"p_operator_token"?: string }; Returns: string
                           },
"open_table_bill":
{ Args: { "p_operator_token"?: string,"p_session_id": string }; Returns: string
                           },
"place_guest_order":
{ Args: { "p_items": Json,"p_notes"?: string,"p_table_token": string }; Returns: Json
                           },
"place_staff_order":
{ Args: { "p_items": Json,"p_notes"?: string,"p_table_id": string }; Returns: Json
                           },
"pos_lock":
{ Args: { "p_operator_token": string }; Returns: undefined
                           },
"pos_unlock":
{ Args: { "p_branch_id": string,"p_pin": string }; Returns: Json
                           },
"profit_loss":
{ Args: { "p_branch_id": string,"p_from": string,"p_tenant_id": string,"p_to": string }; Returns: Json
                           },
"receive_purchase":
{ Args: { "p_purchase_id": string }; Returns: undefined
                           },
"record_cash_movement":
{ Args: { "p_amount_minor": number,"p_operator_token"?: string,"p_reason": string,"p_shift_id": string,"p_type": Database["public"]['Enums']["cash_movement_type"] }; Returns: undefined
                           },
"record_wastage":
{ Args: { "p_branch_id": string,"p_item_id": string,"p_quantity": number,"p_reason": string }; Returns: undefined
                           },
"refund_payment":
{ Args: { "p_operator_token"?: string,"p_payment_id": string,"p_reason": string }; Returns: undefined
                           },
"regenerate_table_qr":
{ Args: { "p_table_id": string }; Returns: string
                           },
"remove_member":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"reorder_menu":
{ Args: { "p_ids": (string)[],"p_kind": string }; Returns: undefined
                           },
"reply_support_ticket":
{ Args: { "p_body": string,"p_state"?: Database["public"]['Enums']["ticket_state"],"p_ticket_id": string }; Returns: undefined
                           },
"request_plan_change":
{ Args: { "p_cycle": Database["public"]['Enums']["billing_cycle"],"p_plan_id": string,"p_tenant_id": string }; Returns: string
                           },
"respond_guest_request":
{ Args: { "p_request_id": string,"p_status": Database["public"]['Enums']["guest_request_status"] }; Returns: undefined
                           },
"retry_fiscal_invoice":
{ Args: { "p_bill_id": string }; Returns: undefined
                           },
"sales_report":
{ Args: { "p_branch_id": string,"p_from": string,"p_tenant_id": string,"p_to": string }; Returns: Json
                           },
"save_expense":
{ Args: { "p": Json }; Returns: string
                           },
"save_integration":
{ Args: { "p_enabled": boolean,"p_mode": string,"p_provider": string,"p_secrets"?: Json,"p_settings": Json,"p_tenant_id": string }; Returns: undefined
                           },
"save_inventory_item":
{ Args: { "p": Json }; Returns: string
                           },
"save_modifier_group":
{ Args: { "p_group": Json,"p_modifiers": Json }; Returns: string
                           },
"save_product":
{ Args: { "p_group_ids"?: (string)[],"p_product": Json,"p_variants"?: Json }; Returns: string
                           },
"save_purchase":
{ Args: { "p": Json }; Returns: string
                           },
"save_recipe":
{ Args: { "p_lines": Json,"p_target": Json,"p_tenant_id": string }; Returns: undefined
                           },
"save_supplier":
{ Args: { "p": Json }; Returns: string
                           },
"server_claim_messages":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"server_finish_online_payment":
{ Args: { "p_amount_minor": number,"p_code"?: string,"p_message"?: string,"p_provider_ref"?: string,"p_success": boolean,"p_txn_ref": string }; Returns: Json
                           },
"server_message_result":
{ Args: { "p_error"?: string,"p_final"?: boolean,"p_id": string,"p_ok": boolean,"p_provider_id"?: string }; Returns: undefined
                           },
"server_online_payment":
{ Args: { "p_txn_ref": string }; Returns: Json
                           },
"server_start_online_payment":
{ Args: { "p_provider": string,"p_receipt_token": string }; Returns: Json
                           },
"set_my_pin":
{ Args: { "p_pin": string,"p_tenant_id": string }; Returns: undefined
                           },
"set_role_permissions":
{ Args: { "p_permissions": (string)[],"p_role_id": string }; Returns: undefined
                           },
"set_table_status":
{ Args: { "p_status": Database["public"]['Enums']["table_status"],"p_table_id": string }; Returns: undefined
                           },
"set_ticket_priority":
{ Args: { "p_priority": boolean,"p_ticket_id": string }; Returns: undefined
                           },
"shift_report":
{ Args: { "p_shift_id": string }; Returns: Json
                           },
"submit_review":
{ Args: { "p_comment"?: string,"p_rating": number,"p_receipt_token": string }; Returns: Json
                           },
"take_payment":
{ Args: { "p_base_minor": number,"p_bill_id": string,"p_method": Database["public"]['Enums']["payment_method"],"p_note"?: string,"p_operator_token"?: string,"p_reference"?: string,"p_tendered_minor"?: number }; Returns: Json
                           },
"transfer_table_session":
{ Args: { "p_session_id": string,"p_to_table_id": string }; Returns: undefined
                           },
"update_member":
{ Args: { "p_all_branches": boolean,"p_branch_ids"?: (string)[],"p_member_id": string,"p_role_id": string,"p_status"?: Database["public"]['Enums']["member_status"] }; Returns: undefined
                           },
"update_order_status":
{ Args: { "p_order_id": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["order_status"] }; Returns: undefined
                           },
"update_ticket_status":
{ Args: { "p_status": Database["public"]['Enums']["ticket_status"],"p_ticket_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "bill_status": "open"|"paid"|"refunded"|"void","billing_cycle": "monthly"|"yearly","cash_movement_type": "in"|"out","guest_request_status": "open"|"acknowledged"|"resolved","guest_request_type": "assistance"|"water"|"napkins"|"bill"|"other","member_status": "active"|"disabled","order_source": "qr"|"waiter"|"pos"|"online","order_status": "new"|"accepted"|"preparing"|"ready"|"served"|"completed"|"cancelled","order_type": "dine_in"|"takeaway"|"delivery","payment_method": "cash"|"card"|"wallet"|"bank_transfer","payment_status": "completed"|"refunded","session_status": "open"|"closed","shift_status": "open"|"closed","stock_movement_kind": "purchase"|"sale"|"sale_reversal"|"wastage"|"count"|"adjustment","subscription_status": "trialing"|"active"|"past_due"|"canceled"|"expired","table_shape": "square"|"round"|"rect","table_status": "available"|"occupied"|"reserved"|"cleaning","tenant_status": "pending"|"active"|"suspended","ticket_state": "open"|"waiting"|"closed","ticket_status": "new"|"accepted"|"preparing"|"ready"|"served"|"cancelled"
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
            "bill_status": ["open", "paid", "refunded", "void"],"billing_cycle": ["monthly", "yearly"],"cash_movement_type": ["in", "out"],"guest_request_status": ["open", "acknowledged", "resolved"],"guest_request_type": ["assistance", "water", "napkins", "bill", "other"],"member_status": ["active", "disabled"],"order_source": ["qr", "waiter", "pos", "online"],"order_status": ["new", "accepted", "preparing", "ready", "served", "completed", "cancelled"],"order_type": ["dine_in", "takeaway", "delivery"],"payment_method": ["cash", "card", "wallet", "bank_transfer"],"payment_status": ["completed", "refunded"],"session_status": ["open", "closed"],"shift_status": ["open", "closed"],"stock_movement_kind": ["purchase", "sale", "sale_reversal", "wastage", "count", "adjustment"],"subscription_status": ["trialing", "active", "past_due", "canceled", "expired"],"table_shape": ["square", "round", "rect"],"table_status": ["available", "occupied", "reserved", "cleaning"],"tenant_status": ["pending", "active", "suspended"],"ticket_state": ["open", "waiting", "closed"],"ticket_status": ["new", "accepted", "preparing", "ready", "served", "cancelled"]
          }
        }
} as const
