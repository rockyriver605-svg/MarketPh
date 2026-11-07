/*
# Product Reviews, Ratings, and Buyer Feedback System

Extends the existing reviews table from migration 004. Drops old policies that reference is_approved, adds order_item_id and status columns, creates all supporting tables, functions, storage, and new RLS policies.

1. Drops old review policies (read_reviews, insert_own_review, update_own_review, delete_own_review) that reference is_approved
2. Alters reviews table: adds order_item_id, status, edited_at; drops is_approved and images array; drops old unique constraint
3. New tables: review_images, review_votes, review_responses, review_reports, review_moderation_logs, review_edit_history
4. Functions: submit_review, update_review, delete_review, toggle_review_vote, submit_review_response, update_review_response, delete_review_response, report_review, moderate_review, get_product_rating_summary, get_seller_rating_summary
5. Storage: review-photos bucket
6. New RLS policies on all review tables
*/

-- ===================== DROP OLD POLICIES FIRST =====================
DROP POLICY IF EXISTS "read_reviews" ON public.reviews;
DROP POLICY IF EXISTS "insert_own_review" ON public.reviews;
DROP POLICY IF EXISTS "update_own_review" ON public.reviews;
DROP POLICY IF EXISTS "delete_own_review" ON public.reviews;

-- ===================== ALTER EXISTING REVIEWS TABLE =====================
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','pending','rejected','hidden'));
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Migrate is_approved to status, then drop is_approved
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reviews' AND column_name='is_approved') THEN
    UPDATE reviews SET status = CASE WHEN is_approved THEN 'published' ELSE 'pending' END WHERE is_approved IS NOT NULL;
    ALTER TABLE public.reviews DROP COLUMN is_approved;
  END IF;
END $$;

-- Drop the images array column in favor of review_images table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reviews' AND column_name='images') THEN
    ALTER TABLE public.reviews DROP COLUMN images;
  END IF;
END $$;

-- Drop old unique constraint on (product_id, reviewer_id) since we now key on order_item_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reviews_product_id_reviewer_id_key') THEN
    ALTER TABLE public.reviews DROP CONSTRAINT reviews_product_id_reviewer_id_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_order_item_unique ON public.reviews (order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_product_published ON public.reviews (product_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_reviews_seller_published ON public.reviews (seller_id) WHERE status = 'published';

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;

DROP POLICY IF EXISTS "public_read_published_reviews" ON public.reviews;
CREATE POLICY "public_read_published_reviews" ON public.reviews FOR SELECT
  TO anon, authenticated USING (status = 'published');

DROP POLICY IF EXISTS "buyer_select_own_reviews" ON public.reviews;
CREATE POLICY "buyer_select_own_reviews" ON public.reviews FOR SELECT
  TO authenticated USING (reviewer_id = auth.uid());

DROP POLICY IF EXISTS "buyer_insert_own_reviews" ON public.reviews;
CREATE POLICY "buyer_insert_own_reviews" ON public.reviews FOR INSERT
  TO authenticated WITH CHECK (reviewer_id = auth.uid());

DROP POLICY IF EXISTS "buyer_update_own_reviews" ON public.reviews;
CREATE POLICY "buyer_update_own_reviews" ON public.reviews FOR UPDATE
  TO authenticated USING (reviewer_id = auth.uid()) WITH CHECK (reviewer_id = auth.uid());

DROP POLICY IF EXISTS "buyer_delete_own_reviews" ON public.reviews;
CREATE POLICY "buyer_delete_own_reviews" ON public.reviews FOR DELETE
  TO authenticated USING (reviewer_id = auth.uid());

DROP POLICY IF EXISTS "seller_read_reviews" ON public.reviews;
CREATE POLICY "seller_read_reviews" ON public.reviews FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = reviews.seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_all_reviews" ON public.reviews;
CREATE POLICY "admin_all_reviews" ON public.reviews FOR SELECT
  TO authenticated USING (public.is_admin());

-- ===================== REVIEW IMAGES =====================
CREATE TABLE IF NOT EXISTS public.review_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_images_review ON public.review_images (review_id);

ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.review_images TO anon, authenticated;
GRANT INSERT, DELETE ON public.review_images TO authenticated;

DROP POLICY IF EXISTS "public_read_review_images" ON public.review_images;
CREATE POLICY "public_read_review_images" ON public.review_images FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "owner_insert_review_images" ON public.review_images;
CREATE POLICY "owner_insert_review_images" ON public.review_images FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND r.reviewer_id = auth.uid())
  );

DROP POLICY IF EXISTS "owner_delete_review_images" ON public.review_images;
CREATE POLICY "owner_delete_review_images" ON public.review_images FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND r.reviewer_id = auth.uid())
  );

-- ===================== REVIEW VOTES =====================
CREATE TABLE IF NOT EXISTS public.review_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_votes_unique ON public.review_votes (review_id, user_id);
CREATE INDEX IF NOT EXISTS idx_review_votes_user ON public.review_votes (user_id);

ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.review_votes TO anon, authenticated;
GRANT INSERT, DELETE ON public.review_votes TO authenticated;

DROP POLICY IF EXISTS "public_read_review_votes" ON public.review_votes;
CREATE POLICY "public_read_review_votes" ON public.review_votes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "user_vote_own" ON public.review_votes;
CREATE POLICY "user_vote_own" ON public.review_votes FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_remove_own_vote" ON public.review_votes;
CREATE POLICY "user_remove_own_vote" ON public.review_votes FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ===================== REVIEW RESPONSES =====================
CREATE TABLE IF NOT EXISTS public.review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 1000),
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_responses_unique ON public.review_responses (review_id);
CREATE INDEX IF NOT EXISTS idx_review_responses_seller ON public.review_responses (seller_id);

ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.review_responses TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.review_responses TO authenticated;

DROP POLICY IF EXISTS "public_read_review_responses" ON public.review_responses;
CREATE POLICY "public_read_review_responses" ON public.review_responses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "seller_insert_own_response" ON public.review_responses;
CREATE POLICY "seller_insert_own_response" ON public.review_responses FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "seller_update_own_response" ON public.review_responses;
CREATE POLICY "seller_update_own_response" ON public.review_responses FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = seller_id AND sp.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "seller_delete_own_response" ON public.review_responses;
CREATE POLICY "seller_delete_own_response" ON public.review_responses FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = seller_id AND sp.user_id = auth.uid())
  );

-- ===================== REVIEW REPORTS =====================
CREATE TABLE IF NOT EXISTS public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid REFERENCES public.reviews(id) ON DELETE CASCADE,
  response_id uuid REFERENCES public.review_responses(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam','harassment','abusive','personal_info','fake','irrelevant','manipulation','other')),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','dismissed')),
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_reports_status ON public.review_reports (status);
CREATE INDEX IF NOT EXISTS idx_review_reports_reporter ON public.review_reports (reporter_id);

ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.review_reports TO authenticated;

DROP POLICY IF EXISTS "reporter_see_own_reports" ON public.review_reports;
CREATE POLICY "reporter_see_own_reports" ON public.review_reports FOR SELECT
  TO authenticated USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "admin_all_reports" ON public.review_reports;
CREATE POLICY "admin_all_reports" ON public.review_reports FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "user_submit_report" ON public.review_reports;
CREATE POLICY "user_submit_report" ON public.review_reports FOR INSERT
  TO authenticated WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "admin_update_reports" ON public.review_reports;
CREATE POLICY "admin_update_reports" ON public.review_reports FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===================== REVIEW MODERATION LOGS =====================
CREATE TABLE IF NOT EXISTS public.review_moderation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('approve','reject','hide','restore','flag')),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_mod_logs_review ON public.review_moderation_logs (review_id);

ALTER TABLE public.review_moderation_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.review_moderation_logs TO authenticated;

DROP POLICY IF EXISTS "admin_read_mod_logs" ON public.review_moderation_logs;
CREATE POLICY "admin_read_mod_logs" ON public.review_moderation_logs FOR SELECT
  TO authenticated USING (public.is_admin());

-- ===================== REVIEW EDIT HISTORY =====================
CREATE TABLE IF NOT EXISTS public.review_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  old_rating smallint,
  new_rating smallint,
  old_body text,
  new_body text,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_edit_history_review ON public.review_edit_history (review_id);

ALTER TABLE public.review_edit_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.review_edit_history TO authenticated;

DROP POLICY IF EXISTS "owner_read_edit_history" ON public.review_edit_history;
CREATE POLICY "owner_read_edit_history" ON public.review_edit_history FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND (r.reviewer_id = auth.uid() OR public.is_admin()))
  );

-- ===================== STORAGE BUCKET =====================
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_review_photos" ON storage.objects;
CREATE POLICY "public_read_review_photos" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'review-photos');

DROP POLICY IF EXISTS "auth_upload_review_photos" ON storage.objects;
CREATE POLICY "auth_upload_review_photos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'review-photos');

DROP POLICY IF EXISTS "owner_delete_review_photos" ON storage.objects;
CREATE POLICY "owner_delete_review_photos" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'review-photos' AND owner = auth.uid());

-- ===================== FUNCTIONS =====================

CREATE OR REPLACE FUNCTION public.submit_review(
  p_order_item_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id uuid := auth.uid();
  v_item record;
  v_existing uuid;
  v_review_id uuid;
  v_seller_user_id uuid;
BEGIN
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit a review.';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Please select a rating between 1 and 5 stars.';
  END IF;
  IF char_length(coalesce(p_body, '')) > 2000 THEN
    RAISE EXCEPTION 'Your review is too long. Please keep it under 2000 characters.';
  END IF;

  SELECT oi.product_id, oi.seller_id, o.buyer_id, o.status
  INTO v_item
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This order item could not be found.';
  END IF;
  IF v_item.buyer_id != v_buyer_id THEN
    RAISE EXCEPTION 'You can only review products from your own orders.';
  END IF;
  IF v_item.status NOT IN ('completed', 'delivered') THEN
    RAISE EXCEPTION 'You can only review products from completed or delivered orders.';
  END IF;

  SELECT id INTO v_existing FROM reviews WHERE order_item_id = p_order_item_id;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'You have already reviewed this product from this purchase.';
  END IF;

  IF EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = v_item.seller_id AND sp.user_id = v_buyer_id) THEN
    RAISE EXCEPTION 'You cannot review your own product.';
  END IF;

  INSERT INTO reviews (order_item_id, product_id, seller_id, reviewer_id, rating, title, body)
  VALUES (p_order_item_id, v_item.product_id, v_item.seller_id, v_buyer_id, p_rating, coalesce(p_title, ''), coalesce(p_body, ''))
  RETURNING id INTO v_review_id;

  SELECT sp.user_id INTO v_seller_user_id FROM seller_profiles sp WHERE sp.id = v_item.seller_id;
  IF v_seller_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link, data)
    VALUES (
      v_seller_user_id, 'review',
      'New product review',
      'A buyer left a ' || p_rating || '-star review on your product.',
      '/seller/reviews',
      jsonb_build_object('review_id', v_review_id, 'product_id', v_item.product_id, 'rating', p_rating)
    );
  END IF;

  RETURN v_review_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_review(uuid, smallint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, smallint, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_review(
  p_review_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review record;
BEGIN
  SELECT * INTO v_review FROM reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found.'; END IF;
  IF v_review.reviewer_id != auth.uid() THEN RAISE EXCEPTION 'You can only edit your own reviews.'; END IF;
  IF v_review.status = 'hidden' THEN RAISE EXCEPTION 'This review has been removed.'; END IF;
  IF now() - v_review.created_at > interval '7 days' THEN
    RAISE EXCEPTION 'The editing window for this review has expired (7 days).';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Please select a rating between 1 and 5 stars.';
  END IF;
  IF char_length(coalesce(p_body, '')) > 2000 THEN
    RAISE EXCEPTION 'Your review is too long. Please keep it under 2000 characters.';
  END IF;

  INSERT INTO review_edit_history (review_id, old_rating, new_rating, old_body, new_body, edited_by)
  VALUES (p_review_id, v_review.rating, p_rating, v_review.body, coalesce(p_body, ''), auth.uid());

  UPDATE reviews
  SET rating = p_rating, title = coalesce(p_title, ''), body = coalesce(p_body, ''),
      edited_at = now(), updated_at = now()
  WHERE id = p_review_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_review(uuid, smallint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_review(uuid, smallint, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_review(p_review_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review record;
BEGIN
  SELECT * INTO v_review FROM reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found.'; END IF;
  IF v_review.reviewer_id != auth.uid() THEN RAISE EXCEPTION 'You can only delete your own reviews.'; END IF;
  UPDATE reviews SET status = 'hidden', updated_at = now() WHERE id = p_review_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_review(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_review_vote(p_review_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_reviewer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in to vote.'; END IF;
  SELECT reviewer_id INTO v_reviewer_id FROM reviews WHERE id = p_review_id;
  IF v_reviewer_id = auth.uid() THEN RAISE EXCEPTION 'You cannot vote on your own review.'; END IF;

  SELECT id INTO v_existing FROM review_votes WHERE review_id = p_review_id AND user_id = auth.uid();
  IF v_existing IS NOT NULL THEN
    DELETE FROM review_votes WHERE id = v_existing;
    RETURN false;
  END IF;
  INSERT INTO review_votes (review_id, user_id) VALUES (p_review_id, auth.uid());
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_review_vote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_review_vote(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_review_response(
  p_review_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review record;
  v_response_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in.'; END IF;
  IF char_length(coalesce(p_body, '')) < 1 OR char_length(coalesce(p_body, '')) > 1000 THEN
    RAISE EXCEPTION 'Response must be between 1 and 1000 characters.';
  END IF;

  SELECT * INTO v_review FROM reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM seller_profiles sp WHERE sp.id = v_review.seller_id AND sp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only respond to reviews for your own products.';
  END IF;

  IF EXISTS (SELECT 1 FROM review_responses WHERE review_id = p_review_id) THEN
    RAISE EXCEPTION 'A response already exists for this review. Edit it instead.';
  END IF;

  INSERT INTO review_responses (review_id, seller_id, body)
  VALUES (p_review_id, v_review.seller_id, p_body)
  RETURNING id INTO v_response_id;

  INSERT INTO notifications (user_id, type, title, body, link, data)
  VALUES (
    v_review.reviewer_id, 'review',
    'Seller responded to your review',
    'The seller has responded to your product review.',
    '/my-reviews',
    jsonb_build_object('review_id', p_review_id, 'response_id', v_response_id)
  );

  RETURN v_response_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_review_response(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review_response(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_review_response(
  p_response_id uuid,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in.'; END IF;
  IF char_length(coalesce(p_body, '')) < 1 OR char_length(coalesce(p_body, '')) > 1000 THEN
    RAISE EXCEPTION 'Response must be between 1 and 1000 characters.';
  END IF;

  SELECT * INTO v_response FROM review_responses WHERE id = p_response_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Response not found.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM seller_profiles sp WHERE sp.id = v_response.seller_id AND sp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only edit your own responses.';
  END IF;

  UPDATE review_responses SET body = p_body, edited_at = now(), updated_at = now() WHERE id = p_response_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_review_response(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_review_response(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_review_response(p_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in.'; END IF;
  SELECT * INTO v_response FROM review_responses WHERE id = p_response_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Response not found.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM seller_profiles sp WHERE sp.id = v_response.seller_id AND sp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only delete your own responses.';
  END IF;
  DELETE FROM review_responses WHERE id = p_response_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_review_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_review_response(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_review(
  p_review_id uuid,
  p_reason text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in to report a review.'; END IF;
  IF p_reason NOT IN ('spam','harassment','abusive','personal_info','fake','irrelevant','manipulation','other') THEN
    RAISE EXCEPTION 'Invalid report reason.';
  END IF;
  SELECT id INTO v_existing FROM review_reports WHERE review_id = p_review_id AND reporter_id = auth.uid();
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'You have already reported this review.';
  END IF;
  INSERT INTO review_reports (review_id, reporter_id, reason, description)
  VALUES (p_review_id, auth.uid(), p_reason, coalesce(p_description, ''))
  RETURNING id INTO v_report_id;
  RETURN v_report_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_review(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_review(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_review(
  p_review_id uuid,
  p_action text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review record;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in.'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only administrators can moderate reviews.'; END IF;
  IF p_action NOT IN ('approve','reject','hide','restore','flag') THEN
    RAISE EXCEPTION 'Invalid moderation action.';
  END IF;

  SELECT * INTO v_review FROM reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found.'; END IF;

  v_new_status := CASE p_action
    WHEN 'approve' THEN 'published'
    WHEN 'reject' THEN 'rejected'
    WHEN 'hide' THEN 'hidden'
    WHEN 'restore' THEN 'published'
    WHEN 'flag' THEN v_review.status
  END;

  IF v_new_status != v_review.status THEN
    UPDATE reviews SET status = v_new_status, updated_at = now() WHERE id = p_review_id;
  END IF;

  INSERT INTO review_moderation_logs (review_id, admin_id, action, reason)
  VALUES (p_review_id, auth.uid(), p_action, coalesce(p_reason, ''));

  INSERT INTO notifications (user_id, type, title, body, link, data)
  VALUES (
    v_review.reviewer_id, 'review',
    'Your review has been moderated',
    'An administrator ' || p_action || 'd your review. Reason: ' || coalesce(p_reason, 'N/A'),
    '/my-reviews',
    jsonb_build_object('review_id', p_review_id, 'action', p_action)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.moderate_review(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_review(uuid, text, text) TO authenticated;

-- ===================== RATING SUMMARY FUNCTIONS =====================

CREATE OR REPLACE FUNCTION public.get_product_rating_summary(p_product_id uuid)
RETURNS TABLE (avg_rating numeric, total_reviews bigint, five_star bigint, four_star bigint, three_star bigint, two_star bigint, one_star bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE rating = 5),
    COUNT(*) FILTER (WHERE rating = 4),
    COUNT(*) FILTER (WHERE rating = 3),
    COUNT(*) FILTER (WHERE rating = 2),
    COUNT(*) FILTER (WHERE rating = 1)
  FROM reviews
  WHERE product_id = p_product_id AND status = 'published';
$$;

REVOKE EXECUTE ON FUNCTION public.get_product_rating_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_rating_summary(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_rating_summary(p_seller_id uuid)
RETURNS TABLE (avg_rating numeric, total_reviews bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    COUNT(*)
  FROM reviews
  WHERE seller_id = p_seller_id AND status = 'published';
$$;

REVOKE EXECUTE ON FUNCTION public.get_seller_rating_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_rating_summary(uuid) TO anon, authenticated;

GRANT ALL ON public.review_images, public.review_votes, public.review_responses, public.review_reports, public.review_moderation_logs, public.review_edit_history TO service_role;
