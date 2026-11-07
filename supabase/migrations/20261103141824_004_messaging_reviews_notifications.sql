/*
# MariMarket — Messaging, Reviews, Favorites, Notifications, Reports & Audit Logs

## Summary
Creates the communication and community infrastructure: conversations, messages, reviews,
favorites, notifications, reports, and audit logs.

## New Tables
1. **conversations** — 1-to-1 conversations between users (typically buyer-seller).
2. **messages** — individual messages within a conversation.
3. **reviews** — product reviews by buyers.
4. **favorites** — saved/favorited products by users.
5. **notifications** — in-app notifications for users.
6. **reports** — content reports submitted by users for moderation.
7. **audit_logs** — system audit trail for admin/moderator actions.

## Security
- RLS on all tables.
- Conversations: participants can read/write their own conversations.
- Messages: participants can read/send messages in their conversations.
- Reviews: public read; only buyers who purchased can review; users can edit/delete their own reviews.
- Favorites: users can see and manage their own favorites only.
- Notifications: users can see and manage their own notifications only.
- Reports: users can create reports; moderators/admins can read all; moderators can update status.
- Audit logs: only admins can read; only service_role can write (via edge functions/triggers).
*/

-- ============================================================
-- CONVERSATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_2 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (participant_1 <> participant_2)
);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_1 ON public.conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_2 ON public.conversations(participant_2);
CREATE INDEX IF NOT EXISTS idx_conversations_product_id ON public.conversations(product_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;

DROP POLICY IF EXISTS "read_own_conversations" ON public.conversations;
CREATE POLICY "read_own_conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

DROP POLICY IF EXISTS "insert_own_conversation" ON public.conversations;
CREATE POLICY "insert_own_conversation"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = participant_1 OR auth.uid() = participant_2);

DROP POLICY IF EXISTS "update_own_conversation" ON public.conversations;
CREATE POLICY "update_own_conversation"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2)
  WITH CHECK (auth.uid() = participant_1 OR auth.uid() = participant_2);

DROP POLICY IF EXISTS "delete_own_conversation" ON public.conversations;
CREATE POLICY "delete_own_conversation"
  ON public.conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  image_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;

-- Participants can read messages in their conversations
DROP POLICY IF EXISTS "read_own_messages" ON public.messages;
CREATE POLICY "read_own_messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- Only conversation participants can send messages
DROP POLICY IF EXISTS "send_own_message" ON public.messages;
CREATE POLICY "send_own_message"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    ) AND sender_id = auth.uid()
  );

-- Participants can mark messages as read
DROP POLICY IF EXISTS "update_own_messages" ON public.messages;
CREATE POLICY "update_own_messages"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- ============================================================
-- REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  body text,
  images text[],
  is_approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON public.reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_seller_id ON public.reviews(seller_id);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;

-- Public can read approved reviews
DROP POLICY IF EXISTS "read_reviews" ON public.reviews;
CREATE POLICY "read_reviews"
  ON public.reviews FOR SELECT
  TO anon, authenticated
  USING (is_approved = true OR reviewer_id = auth.uid() OR public.is_moderator());

-- Only authenticated users can review; reviewer must be the authenticated user
DROP POLICY IF EXISTS "insert_own_review" ON public.reviews;
CREATE POLICY "insert_own_review"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

-- Users can update their own reviews; moderators can update (approve/unapprove)
DROP POLICY IF EXISTS "update_own_review" ON public.reviews;
CREATE POLICY "update_own_review"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (reviewer_id = auth.uid() OR public.is_moderator())
  WITH CHECK (reviewer_id = auth.uid() OR public.is_moderator());

-- Users can delete their own reviews; admins can delete any
DROP POLICY IF EXISTS "delete_own_review" ON public.reviews;
CREATE POLICY "delete_own_review"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (reviewer_id = auth.uid() OR public.is_admin());

-- ============================================================
-- FAVORITES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_product_id ON public.favorites(product_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;

DROP POLICY IF EXISTS "read_own_favorites" ON public.favorites;
CREATE POLICY "read_own_favorites"
  ON public.favorites FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_favorite" ON public.favorites;
CREATE POLICY "insert_own_favorite"
  ON public.favorites FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_favorite" ON public.favorites;
CREATE POLICY "delete_own_favorite"
  ON public.favorites FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('order', 'message', 'review', 'system', 'report', 'verification', 'product', 'promo')),
  title text NOT NULL,
  body text,
  link text,
  data jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "read_own_notifications" ON public.notifications;
CREATE POLICY "read_own_notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_notifications" ON public.notifications;
CREATE POLICY "update_own_notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_notifications" ON public.notifications;
CREATE POLICY "delete_own_notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- REPORTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('product', 'seller', 'review', 'message', 'user')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'scam', 'inappropriate', 'counterfeit', 'harassment', 'other')),
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_target ON public.reports(target_type, target_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;

-- Reporter can see their own reports; moderators/admins can see all
DROP POLICY IF EXISTS "read_reports" ON public.reports;
CREATE POLICY "read_reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid() OR public.is_moderator());

-- Any authenticated user can create a report
DROP POLICY IF EXISTS "insert_own_report" ON public.reports;
CREATE POLICY "insert_own_report"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Only moderators/admins can update report status
DROP POLICY IF EXISTS "update_report" ON public.reports;
CREATE POLICY "update_report"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (reporter_id = auth.uid() OR public.is_moderator())
  WITH CHECK (reporter_id = auth.uid() OR public.is_moderator());

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.audit_logs TO authenticated;

-- Only admins can read audit logs
DROP POLICY IF EXISTS "read_audit_logs_admin" ON public.audit_logs;
CREATE POLICY "read_audit_logs_admin"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS conversations_updated_at ON public.conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS reviews_updated_at ON public.reviews;
CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS reports_updated_at ON public.reports;
CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- UPDATE CONVERSATION UPDATED_AT WHEN MESSAGE IS SENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_conversation_on_message();
