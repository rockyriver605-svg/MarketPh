import { supabase } from '@/lib/supabase';

export async function openSellerConversation(
  buyerId: string,
  sellerUserId: string,
  productId: string | null,
): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('id')
    .or(`and(participant_1.eq.${buyerId},participant_2.eq.${sellerUserId}),and(participant_1.eq.${sellerUserId},participant_2.eq.${buyerId})`)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing.id;

  const { data: conv, error: insertError } = await supabase
    .from('conversations')
    .insert({ participant_1: buyerId, participant_2: sellerUserId, product_id: productId })
    .select('id')
    .single();
  if (insertError || !conv) throw new Error(insertError?.message ?? 'Could not start conversation.');
  return conv.id;
}
