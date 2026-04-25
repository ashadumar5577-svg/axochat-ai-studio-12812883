-- Orders table
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'declined', 'dumped');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan TEXT NOT NULL,
  price_usd NUMERIC NOT NULL,
  full_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  phone TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending',
  decline_reason TEXT,
  admin_message TEXT,
  handled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users view own orders" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "admins view all orders" ON public.orders FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "admins update orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admins delete orders" ON public.orders FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- Notifications table (in-app)
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own notifs" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users update own notifs" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "admins insert notifs" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR auth.uid() = user_id);

CREATE INDEX idx_notifs_user ON public.notifications(user_id, read, created_at DESC);

-- When an order is created, notify all admins/co-founders
CREATE OR REPLACE FUNCTION public.notify_admins_on_new_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, link)
  SELECT ur.user_id,
         'New order placed',
         NEW.full_name || ' placed an order for ' || NEW.plan || ' ($' || NEW.price_usd || ')',
         '/admin?tab=orders'
  FROM public.user_roles ur
  WHERE ur.role IN ('admin','co_founder');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_admins_new_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_new_order();