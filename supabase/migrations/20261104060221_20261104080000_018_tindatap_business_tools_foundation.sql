/*
# MariMarket — TindaTap Business Tools Foundation

## Summary
Creates foundational database tables for integrating TindaTap-inspired business
management tools into MariMarket. Supports: POS transactions, cash payment tracking,
stock movement auditing, store customer management, utang/credit ledger with partial
payments, and restocking orders.

All tables are seller-scoped with RLS enforcing only the seller owner (and admins)
can access their data. No fake data is inserted.

## New Tables (creation order respects FK dependencies)
1. store_customers — Seller-managed customer records for in-store credit and repeat customers.
2. pos_transactions — In-store POS sales. Links to seller and optionally to a store customer.
3. pos_transaction_items — Line items within a POS transaction.
4. stock_movements — Audit trail of every stock change.
5. credit_ledger — Utang/credit entries for store customers.
6. credit_payments — Partial or full payments against credit ledger entries.
7. restock_orders — Restocking orders from suppliers.

## Security
- RLS on all tables, scoped to seller_profiles.user_id = auth.uid(), admins get read access.
- 4 policies per table (SELECT/INSERT/UPDATE/DELETE).
- GRANT to authenticated only.
*/

-- ============================================================
-- 1. STORE CUSTOMERS (created first — pos_transactions references it)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.store_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  total_credit_balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_credit_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_customers_seller_id ON public.store_customers(seller_id);
CREATE INDEX IF NOT EXISTS idx_store_customers_phone ON public.store_customers(phone);

ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_customers TO authenticated;

-- ============================================================
-- 2. POS TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  transaction_number text NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  change_due numeric(12,2) NOT NULL DEFAULT 0 CHECK (change_due >= 0),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'gcash', 'maya', 'bank_transfer', 'card')),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided', 'refunded')),
  customer_id uuid REFERENCES public.store_customers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_transactions_seller_id ON public.pos_transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_created_at ON public.pos_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_status ON public.pos_transactions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_transactions_seller_number ON public.pos_transactions(seller_id, transaction_number);

ALTER TABLE public.pos_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_transactions TO authenticated;

-- ============================================================
-- 3. POS TRANSACTION ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_transaction_id uuid NOT NULL REFERENCES public.pos_transactions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_title text NOT NULL,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity int NOT NULL CHECK (quantity > 0),
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_pos_id ON public.pos_transaction_items(pos_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_product_id ON public.pos_transaction_items(product_id);

ALTER TABLE public.pos_transaction_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_transaction_items TO authenticated;

-- ============================================================
-- 4. STOCK MOVEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('sale', 'restock', 'adjustment', 'damage', 'transfer', 'return', 'initial')),
  quantity_change int NOT NULL,
  quantity_after int NOT NULL DEFAULT 0,
  reason text,
  reference_type text CHECK (reference_type IN ('pos_transaction', 'restock_order', 'order', 'manual')),
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_seller_id ON public.stock_movements(seller_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;

-- ============================================================
-- 5. CREDIT LEDGER (Utang)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.store_customers(id) ON DELETE CASCADE,
  pos_transaction_id uuid REFERENCES public.pos_transactions(id) ON DELETE SET NULL,
  description text,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount > 0),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance numeric(12,2) NOT NULL CHECK (balance >= 0),
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue', 'voided')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_seller_id ON public.credit_ledger(seller_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_customer_id ON public.credit_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_status ON public.credit_ledger(status);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_ledger TO authenticated;

-- ============================================================
-- 6. CREDIT PAYMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.credit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_ledger_id uuid NOT NULL REFERENCES public.credit_ledger(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'gcash', 'maya', 'bank_transfer')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_payments_ledger_id ON public.credit_payments(credit_ledger_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_seller_id ON public.credit_payments(seller_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_created_at ON public.credit_payments(created_at DESC);

ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_payments TO authenticated;

-- ============================================================
-- 7. RESTOCK ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.restock_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  supplier_contact text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'received', 'cancelled')),
  total_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  notes text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restock_orders_seller_id ON public.restock_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_restock_orders_status ON public.restock_orders(status);
CREATE INDEX IF NOT EXISTS idx_restock_orders_created_at ON public.restock_orders(created_at DESC);

ALTER TABLE public.restock_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restock_orders TO authenticated;

-- ============================================================
-- RLS POLICIES — STORE CUSTOMERS
-- ============================================================

DROP POLICY IF EXISTS "select_own_store_customers" ON public.store_customers;
CREATE POLICY "select_own_store_customers"
  ON public.store_customers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = store_customers.seller_id AND sp.user_id = auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_store_customers" ON public.store_customers;
CREATE POLICY "insert_own_store_customers"
  ON public.store_customers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = store_customers.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_store_customers" ON public.store_customers;
CREATE POLICY "update_own_store_customers"
  ON public.store_customers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = store_customers.seller_id AND sp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = store_customers.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_store_customers" ON public.store_customers;
CREATE POLICY "delete_own_store_customers"
  ON public.store_customers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = store_customers.seller_id AND sp.user_id = auth.uid()));

-- ============================================================
-- RLS POLICIES — POS TRANSACTIONS
-- ============================================================

DROP POLICY IF EXISTS "select_own_pos_transactions" ON public.pos_transactions;
CREATE POLICY "select_own_pos_transactions"
  ON public.pos_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = pos_transactions.seller_id AND sp.user_id = auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_pos_transactions" ON public.pos_transactions;
CREATE POLICY "insert_own_pos_transactions"
  ON public.pos_transactions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = pos_transactions.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_pos_transactions" ON public.pos_transactions;
CREATE POLICY "update_own_pos_transactions"
  ON public.pos_transactions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = pos_transactions.seller_id AND sp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = pos_transactions.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_pos_transactions" ON public.pos_transactions;
CREATE POLICY "delete_own_pos_transactions"
  ON public.pos_transactions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = pos_transactions.seller_id AND sp.user_id = auth.uid()));

-- ============================================================
-- RLS POLICIES — POS TRANSACTION ITEMS
-- ============================================================

DROP POLICY IF EXISTS "select_own_pos_transaction_items" ON public.pos_transaction_items;
CREATE POLICY "select_own_pos_transaction_items"
  ON public.pos_transaction_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_transactions pt
    JOIN public.seller_profiles sp ON sp.id = pt.seller_id AND sp.user_id = auth.uid()
    WHERE pt.id = pos_transaction_items.pos_transaction_id
  ) OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_pos_transaction_items" ON public.pos_transaction_items;
CREATE POLICY "insert_own_pos_transaction_items"
  ON public.pos_transaction_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pos_transactions pt
    JOIN public.seller_profiles sp ON sp.id = pt.seller_id AND sp.user_id = auth.uid()
    WHERE pt.id = pos_transaction_items.pos_transaction_id
  ));

DROP POLICY IF EXISTS "update_own_pos_transaction_items" ON public.pos_transaction_items;
CREATE POLICY "update_own_pos_transaction_items"
  ON public.pos_transaction_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_transactions pt
    JOIN public.seller_profiles sp ON sp.id = pt.seller_id AND sp.user_id = auth.uid()
    WHERE pt.id = pos_transaction_items.pos_transaction_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pos_transactions pt
    JOIN public.seller_profiles sp ON sp.id = pt.seller_id AND sp.user_id = auth.uid()
    WHERE pt.id = pos_transaction_items.pos_transaction_id
  ));

DROP POLICY IF EXISTS "delete_own_pos_transaction_items" ON public.pos_transaction_items;
CREATE POLICY "delete_own_pos_transaction_items"
  ON public.pos_transaction_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_transactions pt
    JOIN public.seller_profiles sp ON sp.id = pt.seller_id AND sp.user_id = auth.uid()
    WHERE pt.id = pos_transaction_items.pos_transaction_id
  ));

-- ============================================================
-- RLS POLICIES — STOCK MOVEMENTS
-- ============================================================

DROP POLICY IF EXISTS "select_own_stock_movements" ON public.stock_movements;
CREATE POLICY "select_own_stock_movements"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = stock_movements.seller_id AND sp.user_id = auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_stock_movements" ON public.stock_movements;
CREATE POLICY "insert_own_stock_movements"
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = stock_movements.seller_id AND sp.user_id = auth.uid()));

-- ============================================================
-- RLS POLICIES — CREDIT LEDGER
-- ============================================================

DROP POLICY IF EXISTS "select_own_credit_ledger" ON public.credit_ledger;
CREATE POLICY "select_own_credit_ledger"
  ON public.credit_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_ledger.seller_id AND sp.user_id = auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_credit_ledger" ON public.credit_ledger;
CREATE POLICY "insert_own_credit_ledger"
  ON public.credit_ledger FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_ledger.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_credit_ledger" ON public.credit_ledger;
CREATE POLICY "update_own_credit_ledger"
  ON public.credit_ledger FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_ledger.seller_id AND sp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_ledger.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_credit_ledger" ON public.credit_ledger;
CREATE POLICY "delete_own_credit_ledger"
  ON public.credit_ledger FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_ledger.seller_id AND sp.user_id = auth.uid()));

-- ============================================================
-- RLS POLICIES — CREDIT PAYMENTS
-- ============================================================

DROP POLICY IF EXISTS "select_own_credit_payments" ON public.credit_payments;
CREATE POLICY "select_own_credit_payments"
  ON public.credit_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_payments.seller_id AND sp.user_id = auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_credit_payments" ON public.credit_payments;
CREATE POLICY "insert_own_credit_payments"
  ON public.credit_payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_payments.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_credit_payments" ON public.credit_payments;
CREATE POLICY "update_own_credit_payments"
  ON public.credit_payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_payments.seller_id AND sp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_payments.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_credit_payments" ON public.credit_payments;
CREATE POLICY "delete_own_credit_payments"
  ON public.credit_payments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = credit_payments.seller_id AND sp.user_id = auth.uid()));

-- ============================================================
-- RLS POLICIES — RESTOCK ORDERS
-- ============================================================

DROP POLICY IF EXISTS "select_own_restock_orders" ON public.restock_orders;
CREATE POLICY "select_own_restock_orders"
  ON public.restock_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = restock_orders.seller_id AND sp.user_id = auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_restock_orders" ON public.restock_orders;
CREATE POLICY "insert_own_restock_orders"
  ON public.restock_orders FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = restock_orders.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_restock_orders" ON public.restock_orders;
CREATE POLICY "update_own_restock_orders"
  ON public.restock_orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = restock_orders.seller_id AND sp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = restock_orders.seller_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_restock_orders" ON public.restock_orders;
CREATE POLICY "delete_own_restock_orders"
  ON public.restock_orders FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = restock_orders.seller_id AND sp.user_id = auth.uid()));

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS store_customers_updated_at ON public.store_customers;
CREATE TRIGGER store_customers_updated_at
  BEFORE UPDATE ON public.store_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS pos_transactions_updated_at ON public.pos_transactions;
CREATE TRIGGER pos_transactions_updated_at
  BEFORE UPDATE ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS credit_ledger_updated_at ON public.credit_ledger;
CREATE TRIGGER credit_ledger_updated_at
  BEFORE UPDATE ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS restock_orders_updated_at ON public.restock_orders;
CREATE TRIGGER restock_orders_updated_at
  BEFORE UPDATE ON public.restock_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
