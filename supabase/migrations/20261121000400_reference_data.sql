-- =============================================================================
-- Phase 1 · Reference data: permission catalogue, role templates, plans.
-- Prices / limits are starting values; Super Admin edits them in Phase 6.
-- =============================================================================

insert into public.permissions (key, module, label, description, sort_order) values
  ('dashboard.view',   'General',   'View dashboard',            'See the overview and today''s numbers.', 10),
  ('orders.view',      'Orders',    'View orders',               'See orders and their status.', 20),
  ('orders.create',    'Orders',    'Create orders',             'Take new orders and add items.', 21),
  ('orders.edit',      'Orders',    'Edit orders',               'Change items on an open order.', 22),
  ('orders.discount',  'Orders',    'Apply discounts',           'Give discounts on items or bills.', 23),
  ('orders.cancel',    'Orders',    'Cancel orders',             'Void orders or items.', 24),
  ('orders.refund',    'Orders',    'Refund payments',           'Refund paid orders.', 25),
  ('tables.view',      'Tables',    'View tables',               'See the floor plan and table status.', 30),
  ('tables.manage',    'Tables',    'Manage tables',             'Add tables, edit the floor plan, print QR codes.', 31),
  ('menu.view',        'Menu',      'View menu',                 'See menu items and prices.', 40),
  ('menu.manage',      'Menu',      'Manage menu',               'Add and edit items, prices and availability.', 41),
  ('kitchen.view',     'Kitchen',   'View kitchen display',      'See kitchen tickets.', 50),
  ('kitchen.update',   'Kitchen',   'Update kitchen tickets',    'Accept, prepare and mark tickets ready.', 51),
  ('pos.use',          'POS',       'Use POS',                   'Open the POS and bill orders.', 60),
  ('payments.take',    'POS',       'Take payments',             'Record cash, card and wallet payments.', 61),
  ('shifts.manage',    'POS',       'Manage cash shifts',        'Open and close cashier shifts.', 62),
  ('customers.view',   'Customers', 'View customers',            'See customer profiles and history.', 70),
  ('customers.manage', 'Customers', 'Manage customers',          'Add and edit customers.', 71),
  ('inventory.view',   'Inventory', 'View inventory',            'See stock levels and recipes.', 80),
  ('inventory.manage', 'Inventory', 'Manage inventory',          'Purchases, stock adjustments, suppliers.', 81),
  ('reports.view',     'Reports',   'View reports',              'See sales and performance reports.', 90),
  ('reports.export',   'Reports',   'Export reports',            'Download reports as Excel or PDF.', 91),
  ('staff.view',       'Team',      'View staff',                'See team members.', 100),
  ('staff.manage',     'Team',      'Manage staff',              'Invite, edit and remove team members.', 101),
  ('roles.manage',     'Team',      'Manage roles',              'Create roles and change their permissions.', 102),
  ('branches.manage',  'Settings',  'Manage branches',           'Add and edit branches.', 110),
  ('settings.manage',  'Settings',  'Manage restaurant settings','Edit profile, branding, taxes.', 111),
  ('billing.manage',   'Settings',  'Manage subscription',       'Change plan and billing details.', 112),
  ('audit.view',       'Settings',  'View audit log',            'See who changed what.', 113);

insert into public.role_templates (key, name, description, permissions, sort_order) values
  ('owner', 'Owner', 'Full access to everything, including billing.', '{}', 0),
  ('branch_manager', 'Branch Manager', 'Runs one or more branches, including staff.', array[
    'dashboard.view','orders.view','orders.create','orders.edit','orders.discount','orders.cancel','orders.refund',
    'tables.view','tables.manage','menu.view','menu.manage','kitchen.view','kitchen.update',
    'pos.use','payments.take','shifts.manage','customers.view','customers.manage',
    'inventory.view','inventory.manage','reports.view','reports.export','staff.view','staff.manage','audit.view'
  ], 10),
  ('restaurant_manager', 'Restaurant Manager', 'Day-to-day floor and kitchen operations.', array[
    'dashboard.view','orders.view','orders.create','orders.edit','orders.discount','orders.cancel',
    'tables.view','tables.manage','menu.view','menu.manage','kitchen.view','kitchen.update',
    'pos.use','payments.take','shifts.manage','customers.view','customers.manage','reports.view','staff.view'
  ], 20),
  ('cashier', 'Cashier', 'Bills orders and takes payments at the POS.', array[
    'orders.view','orders.create','orders.edit','tables.view','menu.view',
    'pos.use','payments.take','customers.view','customers.manage'
  ], 30),
  ('waiter', 'Waiter', 'Takes orders and serves assigned tables.', array[
    'orders.view','orders.create','orders.edit','tables.view','menu.view','kitchen.view'
  ], 40),
  ('kitchen', 'Kitchen Staff', 'Works the kitchen display.', array[
    'orders.view','menu.view','kitchen.view','kitchen.update'
  ], 50),
  ('inventory_manager', 'Inventory Manager', 'Stock, purchases and suppliers.', array[
    'menu.view','inventory.view','inventory.manage','reports.view'
  ], 60),
  ('accountant', 'Accountant', 'Reports, exports and the audit log.', array[
    'dashboard.view','orders.view','customers.view','reports.view','reports.export','audit.view'
  ], 70);

-- Prices in minor units (paisa). Rs 4,999 = 499900.
insert into public.subscription_plans
  (code, name, description, currency, price_monthly_minor, price_yearly_minor, trial_days, limits, features, is_default_trial, sort_order)
values
  ('starter', 'Starter', 'One branch with QR menu and basic POS.', 'PKR', 499900, 4999000, 14,
   '{"branches": 1, "tables": 15, "staff": 5}', array['qr_menu','pos'], false, 10),
  ('professional', 'Professional', 'Kitchen display, online ordering, reports and inventory.', 'PKR', 1199900, 11999000, 14,
   '{"branches": 2, "tables": 50, "staff": 25}', array['qr_menu','pos','kds','online_ordering','reports','inventory'], true, 20),
  ('enterprise', 'Enterprise', 'Multiple branches, advanced analytics, custom branding and API.', 'PKR', 2999900, 29999000, 14,
   '{}', array['qr_menu','pos','kds','online_ordering','reports','inventory','advanced_analytics','custom_branding','api'], false, 30);
