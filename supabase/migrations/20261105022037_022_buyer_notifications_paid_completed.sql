/*
# Buyer notifications for payment received and order completed

1. Changes
- Updates the notify_buyer_order_status function so buyers also get a notification when an order is marked paid or completed.
- No tables, columns, or data are changed.

2. Security
- Function keeps its existing SECURITY DEFINER setting and search path.
- No grants or policies are changed.

3. Notes
- Previously paid and completed transitions produced no buyer notification.
*/

CREATE OR REPLACE FUNCTION public.notify_buyer_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_buyer uuid;
v_order_number text;
v_title text;
v_body text;
BEGIN
SELECT buyer_id, order_number INTO v_buyer, v_order_number FROM orders WHERE id = NEW.order_id;

v_title := CASE NEW.new_status
WHEN 'confirmed' THEN 'Order confirmed'
WHEN 'paid' THEN 'Payment received'
WHEN 'processing' THEN 'Your order is being prepared'
WHEN 'ready_for_pickup' THEN 'Ready for pickup'
WHEN 'shipped' THEN 'Your order has shipped'
WHEN 'delivered' THEN 'Your order was delivered'
WHEN 'completed' THEN 'Order completed'
WHEN 'cancelled' THEN 'Order cancelled'
WHEN 'refunded' THEN 'Order refunded'
WHEN 'disputed' THEN 'Order disputed'
ELSE NULL
END;

IF v_title IS NULL THEN
RETURN NEW;
END IF;

v_body := 'Order ' || COALESCE(v_order_number, '') || ' is now ' || replace(NEW.new_status, '_', ' ') || '.';

INSERT INTO notifications (user_id, type, title, body, link, data)
VALUES (
v_buyer,
'order',
v_title,
v_body,
'/orders/' || NEW.order_id::text || '/track',
jsonb_build_object('order_id', NEW.order_id, 'status', NEW.new_status, 'history_id', NEW.id)
);

RETURN NEW;
END;
$function$;
