-- Keep the full QuickBooks vendor card so Contacts can show payee details and inactive status.

alter table public.qb_vendors
  add column if not exists company_name text not null default '',
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists street text not null default '',
  add column if not exists street2 text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists alt_phone text not null default '',
  add column if not exists fax text not null default '',
  add column if not exists email text not null default '',
  add column if not exists contact text not null default '',
  add column if not exists account_number text not null default '',
  add column if not exists vendor_type text not null default '',
  add column if not exists terms text not null default '',
  add column if not exists tax_id text not null default '',
  add column if not exists credit_limit text not null default '',
  add column if not exists balance text not null default '',
  add column if not exists notes text not null default '';

create or replace function public.qbwc_save_vendors(
  p_ticket uuid,
  p_vendors jsonb default '[]'::jsonb,
  p_iterator_id text default '',
  p_done boolean default false,
  p_abort boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.qbwc_sessions%rowtype;
  item jsonb;
  v_name text;
  v_list text;
  v_active boolean;
  v_started timestamptz;
begin
  select * into sess from public.qbwc_sessions where ticket = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;

  if p_abort then
    update public.qbwc_sessions
    set vendor_sync = false, vendor_iterator_id = '', step = 'customer_query', updated_at = now()
    where ticket = p_ticket;
    return jsonb_build_object('ok', true, 'aborted', true);
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_vendors, '[]'::jsonb))
  loop
    v_name := nullif(trim(coalesce(item->>'name', '')), '');
    if v_name is null then
      continue;
    end if;
    v_list := coalesce(nullif(trim(item->>'listId'), ''), '');
    v_active := coalesce((item->>'isActive')::boolean, true);
    if v_list = '' then
      continue;
    end if;
    insert into public.qb_vendors (
      company_id, list_id, name, is_active, synced_at,
      company_name, first_name, last_name, street, street2, city, state, postal_code,
      phone, alt_phone, fax, email, contact, account_number, vendor_type, terms,
      tax_id, credit_limit, balance, notes
    )
    values (
      sess.company_id, v_list, v_name, v_active, now(),
      coalesce(nullif(trim(item->>'companyName'), ''), ''),
      coalesce(nullif(trim(item->>'firstName'), ''), ''),
      coalesce(nullif(trim(item->>'lastName'), ''), ''),
      coalesce(nullif(trim(item->>'street'), ''), ''),
      coalesce(nullif(trim(item->>'street2'), ''), ''),
      coalesce(nullif(trim(item->>'city'), ''), ''),
      coalesce(nullif(trim(item->>'state'), ''), ''),
      coalesce(nullif(trim(item->>'postalCode'), ''), ''),
      coalesce(nullif(trim(item->>'phone'), ''), ''),
      coalesce(nullif(trim(item->>'altPhone'), ''), ''),
      coalesce(nullif(trim(item->>'fax'), ''), ''),
      coalesce(nullif(trim(item->>'email'), ''), ''),
      coalesce(nullif(trim(item->>'contact'), ''), ''),
      coalesce(nullif(trim(item->>'accountNumber'), ''), ''),
      coalesce(nullif(trim(item->>'vendorType'), ''), ''),
      coalesce(nullif(trim(item->>'terms'), ''), ''),
      coalesce(nullif(trim(item->>'taxId'), ''), ''),
      coalesce(nullif(trim(item->>'creditLimit'), ''), ''),
      coalesce(nullif(trim(item->>'balance'), ''), ''),
      coalesce(nullif(trim(item->>'notes'), ''), '')
    )
    on conflict (company_id, list_id)
    do update set
      name = excluded.name,
      is_active = excluded.is_active,
      synced_at = now(),
      company_name = excluded.company_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      street = excluded.street,
      street2 = excluded.street2,
      city = excluded.city,
      state = excluded.state,
      postal_code = excluded.postal_code,
      phone = excluded.phone,
      alt_phone = excluded.alt_phone,
      fax = excluded.fax,
      email = excluded.email,
      contact = excluded.contact,
      account_number = excluded.account_number,
      vendor_type = excluded.vendor_type,
      terms = excluded.terms,
      tax_id = excluded.tax_id,
      credit_limit = excluded.credit_limit,
      balance = excluded.balance,
      notes = excluded.notes;
  end loop;

  if p_done then
    v_started := coalesce(sess.vendor_sync_started_at, now() - interval '1 second');
    update public.qb_vendors
    set is_active = false
    where company_id = sess.company_id
      and synced_at < v_started;
    update public.qbwc_connectors
    set vendors_synced_at = now(), vendor_sync_requested = false, last_error = '', updated_at = now()
    where company_id = sess.company_id;
    update public.qbwc_sessions
    set vendor_sync = false, vendor_iterator_id = '', vendor_sync_started_at = null,
        step = 'customer_query', last_error = '', updated_at = now()
    where ticket = p_ticket;
  else
    update public.qbwc_sessions
    set vendor_iterator_id = coalesce(p_iterator_id, ''),
        step = 'vendor_list_query',
        last_error = '',
        updated_at = now()
    where ticket = p_ticket;
  end if;

  return jsonb_build_object('ok', true, 'done', p_done);
end;
$$;

revoke all on function public.qbwc_save_vendors(uuid, jsonb, text, boolean, boolean) from public;
grant execute on function public.qbwc_save_vendors(uuid, jsonb, text, boolean, boolean) to anon, authenticated;
