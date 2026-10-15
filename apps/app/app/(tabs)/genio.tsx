import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiRequestError, type ChatMessageView } from '../../src/lib/api';
import { attachmentCard, suggestions } from '../../src/lib/chat';
import { useSession } from '../../src/lib/session';
import { useAsync } from '../../src/lib/useAsync';
import { Body, Notice, Title } from '../../src/ui/components';
import { color, maxWidth, radius, space, type } from '../../src/ui/theme';

export default function Genio() {
  const { api, setGoalId } = useSession();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goals = useAsync(() => api.goals(), [api]);
  const me = useAsync(() => api.me(), [api]);
  useFocusEffect(useCallback(() => void goals.reload(), [goals.reload]));

  // Retoma la conversación más reciente
  useEffect(() => {
    let alive = true;
    api
      .conversations()
      .then(async (list) => {
        const last = list[0];
        if (!last || !alive) return;
        const msgs = await api.conversation(last.id);
        if (alive) {
          setConversationId(last.id);
          setMessages(msgs);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [api]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, sending]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || sending) return;
    setError(null);
    setText('');
    const mine: ChatMessageView = { id: `local-${Date.now()}`, role: 'user', content: message, attachments: [], createdAt: new Date().toISOString() };
    setMessages((m) => [...m, mine]);
    setSending(true);
    try {
      const r = await api.chat(message, conversationId);
      setConversationId(r.conversationId);
      setMessages((m) => [...m, { id: r.messageId, role: 'assistant', content: r.reply, attachments: r.attachments, createdAt: new Date().toISOString() }]);
      if (r.attachments.some((a) => a.type === 'goal')) void goals.reload();
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== mine.id));
      setText(message);
      setError(
        e instanceof ApiRequestError && e.code === 'chat_unavailable'
          ? 'El Genio no está disponible ahora. Mientras tanto, usa las pestañas Metas, Plan y Productos.'
          : e instanceof Error
            ? e.message
            : 'No pudimos enviar tu mensaje.',
      );
    } finally {
      setSending(false);
    }
  }

  function newConversation() {
    setConversationId(undefined);
    setMessages([]);
    setError(null);
  }

  const chips = sending ? [] : suggestions(goals.data, !!me.data?.has_snapshot);

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} style={s.root} contentContainerStyle={[s.inner, { paddingTop: space.xl + insets.top }]} keyboardShouldPersistTaps="handled">
        <View style={s.column}>
          <View style={s.header}>
            <Title>Tu Genio</Title>
            {messages.length > 0 ? (
              <Pressable onPress={newConversation} accessibilityRole="button">
                <Text style={s.link}>Nueva conversación</Text>
              </Pressable>
            ) : null}
          </View>
          {messages.length === 0 ? (
            <Body muted>
              Pregúntame si estás listo para tu meta, qué hacer este mes o cuál es la mejor opción para ti. Uso tus datos y el
              catálogo de bancos: no invento tasas y la aprobación siempre la decide el banco.
            </Body>
          ) : null}

          {messages.map((m) => (
            <View key={m.id} style={[s.bubble, m.role === 'user' ? s.mine : s.theirs]}>
              <Text style={m.role === 'user' ? s.mineText : s.theirsText}>{m.content}</Text>
              {m.attachments.map((a, i) => {
                const c = attachmentCard(a);
                return (
                  <Pressable
                    key={`${a.type}-${i}`}
                    style={s.card}
                    accessibilityRole="button"
                    onPress={() => {
                      setGoalId(c.goalId);
                      router.push(c.href);
                    }}
                  >
                    <Text style={s.cardTitle}>{c.title}</Text>
                    <Text style={s.cardDetail}>{c.detail}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {sending ? (
            <View style={[s.bubble, s.theirs, s.thinking]}>
              <ActivityIndicator color={color.lock} />
              <Text style={s.theirsText}>Revisando tus datos…</Text>
            </View>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}

          {chips.length > 0 ? (
            <View style={s.chips}>
              {chips.map((c) => (
                <Pressable key={c} style={s.chip} onPress={() => void send(c)} accessibilityRole="button">
                  <Text style={s.chipText}>{c}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[s.composer, { paddingBottom: space.md }]}>
        <View style={[s.column, s.row]}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Escríbele a tu Genio"
            placeholderTextColor={color.muted}
            multiline
            maxLength={2000}
            onSubmitEditing={() => void send(text)}
            blurOnSubmit={Platform.OS === 'web'}
            accessibilityLabel="Mensaje para el Genio"
          />
          <Pressable
            style={[s.send, (!text.trim() || sending) && s.sendOff]}
            onPress={() => void send(text)}
            disabled={!text.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
          >
            <Text style={s.sendText}>Enviar</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  inner: { paddingHorizontal: space.lg, paddingBottom: space.xl, flexGrow: 1 },
  column: { width: '100%', maxWidth, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  link: { ...type.small, color: color.lockSoft, textDecorationLine: 'underline' },
  bubble: { marginTop: space.md, padding: space.md, borderRadius: radius.lg, maxWidth: '88%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.lock, borderBottomRightRadius: radius.sm },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderBottomLeftRadius: radius.sm },
  mineText: { ...type.body, color: '#FFFFFF' },
  theirsText: { ...type.body, color: color.lock },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: { marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.bg, borderLeftWidth: 4, borderLeftColor: color.water },
  cardTitle: { ...type.heading, fontSize: 16, color: color.lock },
  cardDetail: { ...type.small, color: color.muted, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 999, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
  chipText: { ...type.small, color: color.lock },
  composer: { borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.surface, paddingTop: space.md, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.bg,
    color: color.lock,
    ...type.body,
  },
  send: { height: 44, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: color.lock, justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  sendText: { ...type.body, fontWeight: '600', color: '#FFFFFF' },
});
