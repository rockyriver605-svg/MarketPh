import { useEffect, useState, useRef, type FormEvent } from 'react';
import { MessageCircle, Send, ArrowLeft, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from '@/lib/router';
import type { Conversation, Message, Profile } from '@/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { timeAgo } from '@/lib/utils';

export function MessagesPage() {
  const { user } = useAuth();
  const { route, navigate } = useRouter();
  const [conversations, setConversations] = useState<(Conversation & { other_profile?: Profile })[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConvId = route.query.c ?? '';

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order('updated_at', { ascending: false });
      const convs = convData as Conversation[] ?? [];

      const otherIds = convs.map((c) => c.participant_1 === user.id ? c.participant_2 : c.participant_1);
      const { data: profileData } = await supabase.from('profiles').select('*').in('id', otherIds);
      const profileMap: Record<string, Profile> = {};
      (profileData as Profile[] | null)?.forEach((p) => { profileMap[p.id] = p; });

      const enriched = convs.map((c) => {
        const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1;
        return { ...c, other_profile: profileMap[otherId] };
      });
      setConversations(enriched);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !activeConvId) return;
    (async () => {
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', activeConvId)
        .maybeSingle();
      const conv = convData as Conversation | null;
      setActiveConv(conv ?? null);

      if (conv) {
        const otherId = conv.participant_1 === user.id ? conv.participant_2 : conv.participant_1;
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', otherId).maybeSingle();
        setOtherProfile(prof as Profile | null);

        const { data: msgData } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', activeConvId)
          .order('created_at', { ascending: true });
        setMessages(msgData as Message[] ?? []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    })();
  }, [user, activeConvId]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !activeConv || !newMessage.trim()) return;
    setSending(true);
    const { data: msg } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        body: newMessage.trim(),
      })
      .select('*')
      .single();
    if (msg) {
      setMessages([...messages, msg as Message]);
      setNewMessage('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
    setSending(false);
  };

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (loading) {
    return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/4" /></div>;
  }

  return (
    <div className="container-app py-6 animate-fade-in">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </button>
      <h1 className="text-2xl font-bold text-brand-900 mb-6">Messages</h1>

      {conversations.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-8 w-8" />}
          title="No conversations yet"
          description="Start a conversation with a seller by visiting their product page."
          action={<Button onClick={() => navigate('/browse')}>Browse Products</Button>}
        />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4 h-[calc(100vh-280px)] min-h-[400px]">
          {/* Conversation list */}
          <div className={`bg-white rounded-xl border border-brand-100 overflow-y-auto ${activeConvId ? 'hidden lg:block' : ''}`}>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => navigate(`/messages?c=${conv.id}`)}
                className={`w-full flex items-center gap-3 p-4 border-b border-brand-50 text-left transition-colors hover:bg-brand-50 ${activeConvId === conv.id ? 'bg-brand-50' : ''}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-600 font-semibold text-sm shrink-0">
                  {conv.other_profile?.display_name?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brand-900 truncate">{conv.other_profile?.display_name ?? 'Unknown'}</p>
                  <p className="text-xs text-brand-400">{timeAgo(conv.updated_at)}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Message thread */}
          <div className={`lg:col-span-2 flex flex-col bg-white rounded-xl border border-brand-100 ${!activeConvId ? 'hidden lg:flex' : ''}`}>
            {activeConv && otherProfile ? (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-brand-100">
                  <button onClick={() => navigate('/messages')} className="lg:hidden text-brand-500"><ArrowLeft className="h-5 w-5" /></button>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-600 font-semibold text-sm">
                    {otherProfile.display_name?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-brand-900">{otherProfile.display_name}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${msg.sender_id === user.id ? 'bg-brand-600 text-white' : 'bg-cream-100 text-brand-800'}`}>
                        <p>{msg.body}</p>
                        <p className={`text-[10px] mt-1 ${msg.sender_id === user.id ? 'text-brand-200' : 'text-brand-400'}`}>{timeAgo(msg.created_at)}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSend} className="p-3 border-t border-brand-100 flex gap-2">
                  <input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 h-11 px-4 rounded-lg border border-brand-200 text-sm focus:border-brand-500"
                  />
                  <Button type="submit" size="icon" loading={sending} disabled={!newMessage.trim()}>
                    <Send className="h-5 w-5" />
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState icon={<User className="h-8 w-8" />} title="Select a conversation" description="Choose a conversation from the list to view messages." />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
