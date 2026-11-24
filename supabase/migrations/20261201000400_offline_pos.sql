-- =============================================================================
-- Phase 11: offline POS sales.
--
-- When the internet or power drops, the POS keeps selling takeaway / delivery
-- from its cached menu and queues each sale on the device. On reconnect each
-- queued sale is replayed through sync_offline_sale, which:
--   * is idempotent by the device's client_ref (a retry never double-bills),
--   * creates the order and bill through the normal POS functions (same
--     permissions, prices from the database, stock, kitchen ticket, WhatsApp
--     receipt and tax invoice as an online sale),
--   * takes the payment in full with the method used at the till,
--   * marks the order completed (it was already served) and back-dates it to
--     when the sale happened,
--   * flags the bill if menu prices changed since the till's cached menu.
-- =============================================================================

alter table public.bills
  add column offline_ref uuid unique,
  add column offline_at timestamptz,
  add column offline_note text check (char_length(offline_note) <= 300);

create or replace function public.sync_offline_sale(
  p_branch_id uuid,
  p_client_ref uuid,
  p_type public.order_type,
  p_items jsonb,
  p_notes text,
  p_customer_name text,
  p_customer_phone text,
  p_method public.payment_method,
  p_offline_at timestamptz,
  p_charged_minor bigint,
  p_operator_token text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_created jsonb;
  v_paid jsonb;
  v_at timestamptz := least(greatest(coalesce(p_offline_at, now()), now() - interval '7 days'), now());
begin
  if p_client_ref is null then
    raise exception 'Missing sale reference' using errcode = '22023';
  end if;
  select * into v_bill from public.bills where offline_ref = p_client_ref;
  if v_bill.id is not null then
    return jsonb_build_object('bill_id', v_bill.id, 'bill_number', v_bill.bill_number, 'duplicate', true);
  end if;

  v_created := public.create_counter_order(p_branch_id, p_type, p_items, coalesce(p_notes, ''),
                                           p_customer_name, p_customer_phone, p_operator_token);
  v_bill := private.recalc_bill((v_created ->> 'bill_id')::uuid);
  update public.bills set offline_ref = p_client_ref, offline_at = v_at, created_at = v_at where id = v_bill.id;

  v_paid := public.take_payment(v_bill.id, p_method, v_bill.base_minor, null, null, 'Taken while offline', p_operator_token);

  -- Already served at the counter: complete it (closes its kitchen ticket).
  update public.order_items set status = 'completed' where order_id = (v_created ->> 'order_id')::uuid and status <> 'cancelled';
  update public.orders set status = 'completed', created_at = v_at where id = (v_created ->> 'order_id')::uuid;

  if p_charged_minor is not null and (v_paid ->> 'amount_minor')::bigint <> p_charged_minor then
    update public.bills set offline_note = format('Charged %s offline; current prices give %s',
                                                   p_charged_minor / 100.0, (v_paid ->> 'amount_minor')::bigint / 100.0)
    where id = v_bill.id;
  end if;

  return jsonb_build_object('bill_id', v_bill.id, 'bill_number', v_bill.bill_number,
                            'order_number', (v_created ->> 'order_number')::int,
                            'amount_minor', (v_paid ->> 'amount_minor')::bigint,
                            'price_changed', p_charged_minor is not null and (v_paid ->> 'amount_minor')::bigint <> p_charged_minor,
                            'duplicate', false);
end;
$$;
revoke execute on function public.sync_offline_sale(uuid, uuid, public.order_type, jsonb, text, text, text,
  public.payment_method, timestamptz, bigint, text) from public, anon;
grant execute on function public.sync_offline_sale(uuid, uuid, public.order_type, jsonb, text, text, text,
  public.payment_method, timestamptz, bigint, text) to authenticated;
