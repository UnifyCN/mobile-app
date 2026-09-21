// supabase/functions/_shared/notificationTemplates.ts
//
// Localized notification copy shared by every edge function that writes a
// `community_notifications` row or sends a push.
//
// Contract (see also `utils/notificationText.ts` on the client):
//   * `title` / `body` columns keep holding ENGLISH text, so builds shipped
//     before this change keep rendering something sensible.
//   * `data.i18n = { key, params }` carries the structured payload. Any reader
//     that understands it re-renders the notification in the recipient's
//     language and ignores the stored English.
//
// The wording here is mirrored 1:1 by `notifications.templates.*` in
// `i18n/locales/<lang>/translation.json`. Change one, change the other.
//
// Mirrors the companionTemplates.ts convention: zero Deno-specific imports, so
// this module can also be loaded by jest and by `deno test`.

export const NOTIFICATION_LANGUAGES = [
  'en',
  'vi',
  'es',
  'hi',
  'ar',
  'fr-CA',
] as const;

export type NotificationLanguage = (typeof NOTIFICATION_LANGUAGES)[number];

export const DEFAULT_NOTIFICATION_LANGUAGE: NotificationLanguage = 'en';

export interface RenderedNotification {
  title: string;
  body: string;
}

export type NotificationTemplateParams = Record<string, string | number>;

export interface NotificationI18nPayload {
  key: string;
  params?: NotificationTemplateParams;
}

type LocalizedTemplate = Record<NotificationLanguage, RenderedNotification>;

/**
 * Display name used when the actor has no username. Resolved at render time so
 * each recipient sees it in their own language.
 */
export const FALLBACK_ACTOR_NAME: Record<NotificationLanguage, string> = {
  en: 'Someone',
  vi: 'Ai đó',
  es: 'Alguien',
  hi: 'कोई',
  ar: 'شخص ما',
  'fr-CA': 'Quelqu’un',
};

export const NOTIFICATION_TEMPLATES = {
  followed: {
    en: { title: 'New follower', body: '{{name}} started following you.' },
    vi: {
      title: 'Người theo dõi mới',
      body: '{{name}} đã bắt đầu theo dõi bạn.',
    },
    es: { title: 'Nuevo seguidor', body: '{{name}} empezó a seguirte.' },
    hi: {
      title: 'नया फ़ॉलोअर',
      body: '{{name}} ने आपको फ़ॉलो करना शुरू किया।',
    },
    ar: { title: 'متابع جديد', body: 'بدأ {{name}} بمتابعتك.' },
    'fr-CA': {
      title: 'Nouvel abonné',
      body: '{{name}} vous suit maintenant.',
    },
  },
  liked: {
    en: {
      title: 'New like on your post',
      body: '{{name}} liked your post.',
    },
    vi: {
      title: 'Lượt thích mới cho bài viết của bạn',
      body: '{{name}} đã thích bài viết của bạn.',
    },
    es: {
      title: 'Nuevo me gusta en tu publicación',
      body: 'A {{name}} le gustó tu publicación.',
    },
    hi: {
      title: 'आपकी पोस्ट पर नया लाइक',
      body: '{{name}} ने आपकी पोस्ट को लाइक किया।',
    },
    ar: { title: 'إعجاب جديد بمنشورك', body: 'أعجب {{name}} بمنشورك.' },
    'fr-CA': {
      title: 'Nouvelle mention J’aime sur votre publication',
      body: '{{name}} a aimé votre publication.',
    },
  },
  commented: {
    en: {
      title: 'New comment on your post',
      body: '{{name}} commented on your post.',
    },
    vi: {
      title: 'Bình luận mới về bài viết của bạn',
      body: '{{name}} đã bình luận về bài viết của bạn.',
    },
    es: {
      title: 'Nuevo comentario en tu publicación',
      body: '{{name}} comentó tu publicación.',
    },
    hi: {
      title: 'आपकी पोस्ट पर नई टिप्पणी',
      body: '{{name}} ने आपकी पोस्ट पर टिप्पणी की।',
    },
    ar: {
      title: 'تعليق جديد على منشورك',
      body: 'علّق {{name}} على منشورك.',
    },
    'fr-CA': {
      title: 'Nouveau commentaire sur votre publication',
      body: '{{name}} a commenté votre publication.',
    },
  },
  commentReply: {
    en: {
      title: 'Reply to your comment',
      body: '{{name}} replied to your comment.',
    },
    vi: {
      title: 'Trả lời bình luận của bạn',
      body: '{{name}} đã trả lời bình luận của bạn.',
    },
    es: {
      title: 'Respuesta a tu comentario',
      body: '{{name}} respondió a tu comentario.',
    },
    hi: {
      title: 'आपकी टिप्पणी का जवाब',
      body: '{{name}} ने आपकी टिप्पणी का जवाब दिया।',
    },
    ar: { title: 'رد على تعليقك', body: 'ردّ {{name}} على تعليقك.' },
    'fr-CA': {
      title: 'Réponse à votre commentaire',
      body: '{{name}} a répondu à votre commentaire.',
    },
  },
  commentLiked: {
    en: {
      title: 'Someone liked your comment',
      body: '{{name}} liked your comment.',
    },
    vi: {
      title: 'Ai đó đã thích bình luận của bạn',
      body: '{{name}} đã thích bình luận của bạn.',
    },
    es: {
      title: 'Alguien dio me gusta a tu comentario',
      body: 'A {{name}} le gustó tu comentario.',
    },
    hi: {
      title: 'किसी ने आपकी टिप्पणी को लाइक किया',
      body: '{{name}} ने आपकी टिप्पणी को लाइक किया।',
    },
    ar: { title: 'أعجب أحدهم بتعليقك', body: 'أعجب {{name}} بتعليقك.' },
    'fr-CA': {
      title: 'Quelqu’un a aimé votre commentaire',
      body: '{{name}} a aimé votre commentaire.',
    },
  },
  inviteRedeemed: {
    en: {
      title: 'New friend on Unify',
      body: '🎉 {{name}} just joined Unify thanks to you.',
    },
    vi: {
      title: 'Bạn mới trên Unify',
      body: '🎉 {{name}} vừa tham gia Unify nhờ bạn.',
    },
    es: {
      title: 'Nuevo amigo en Unify',
      body: '🎉 {{name}} acaba de unirse a Unify gracias a ti.',
    },
    hi: {
      title: 'Unify पर नया दोस्त',
      body: '🎉 {{name}} आपकी वजह से अभी Unify से जुड़े।',
    },
    ar: {
      title: 'صديق جديد على Unify',
      body: '🎉 انضم {{name}} إلى Unify بفضلك.',
    },
    'fr-CA': {
      title: 'Nouvel ami sur Unify',
      body: '🎉 {{name}} vient de rejoindre Unify grâce à vous.',
    },
  },
  circleMatched: {
    en: {
      title: 'You’ve been matched!',
      body: 'Your Unify Circle is ready. Tap to meet your group.',
    },
    vi: {
      title: 'Bạn đã được ghép nhóm!',
      body: 'Nhóm Unify Circle của bạn đã sẵn sàng. Nhấn để gặp nhóm của bạn.',
    },
    es: {
      title: '¡Ya tienes grupo!',
      body: 'Tu Círculo de Unify está listo. Toca para conocer a tu grupo.',
    },
    hi: {
      title: 'आपका ग्रुप मिल गया!',
      body: 'आपका Unify Circle तैयार है। अपने ग्रुप से मिलने के लिए टैप करें।',
    },
    ar: {
      title: 'تمّت مطابقتك!',
      body: 'دائرة Unify الخاصة بك جاهزة. اضغط للتعرف على مجموعتك.',
    },
    'fr-CA': {
      title: 'Vous avez été jumelé!',
      body: 'Votre cercle Unify est prêt. Touchez pour rencontrer votre groupe.',
    },
  },
  circleMatchedForced: {
    en: {
      title: 'You’ve been matched!',
      body: 'We placed you into a circle so you wouldn’t keep waiting. Tap to meet your group.',
    },
    vi: {
      title: 'Bạn đã được ghép nhóm!',
      body: 'Chúng tôi đã xếp bạn vào một nhóm để bạn không phải chờ thêm. Nhấn để gặp nhóm của bạn.',
    },
    es: {
      title: '¡Ya tienes grupo!',
      body: 'Te colocamos en un círculo para que no sigas esperando. Toca para conocer a tu grupo.',
    },
    hi: {
      title: 'आपका ग्रुप मिल गया!',
      body: 'हमने आपको एक सर्कल में रखा ताकि आपको और इंतज़ार न करना पड़े। अपने ग्रुप से मिलने के लिए टैप करें।',
    },
    ar: {
      title: 'تمّت مطابقتك!',
      body: 'وضعناك في دائرة حتى لا تنتظر أكثر. اضغط للتعرف على مجموعتك.',
    },
    'fr-CA': {
      title: 'Vous avez été jumelé!',
      body: 'Nous vous avons placé dans un cercle pour ne pas vous faire attendre plus longtemps. Touchez pour rencontrer votre groupe.',
    },
  },
  circleEnded: {
    en: {
      title: 'Your circle has wrapped up',
      body: 'Say thanks, follow one another, and keep the support going.',
    },
    vi: {
      title: 'Nhóm của bạn đã kết thúc',
      body: 'Hãy nói lời cảm ơn, theo dõi nhau và tiếp tục hỗ trợ nhau.',
    },
    es: {
      title: 'Tu círculo ha terminado',
      body: 'Da las gracias, síganse entre ustedes y sigan apoyándose.',
    },
    hi: {
      title: 'आपका सर्कल पूरा हो गया',
      body: 'धन्यवाद कहें, एक-दूसरे को फ़ॉलो करें और सहयोग जारी रखें।',
    },
    ar: {
      title: 'انتهت دائرتك',
      body: 'اشكر الآخرين، وتابعوا بعضكم، واستمروا في الدعم.',
    },
    'fr-CA': {
      title: 'Votre cercle est terminé',
      body: 'Dites merci, suivez-vous les uns les autres et continuez à vous entraider.',
    },
  },
  circleEndingSoon: {
    en: {
      title: 'One day left in your circle',
      body: 'One day left in this circle. Share one last useful tip, thank someone who helped you, or exchange contact info if you want to stay in touch.',
    },
    vi: {
      title: 'Còn một ngày nữa trong nhóm của bạn',
      body: 'Còn một ngày nữa trong nhóm này. Hãy chia sẻ một mẹo hữu ích cuối cùng, cảm ơn người đã giúp bạn, hoặc trao đổi thông tin liên lạc nếu bạn muốn giữ liên lạc.',
    },
    es: {
      title: 'Queda un día en tu círculo',
      body: 'Queda un día en este círculo. Comparte un último consejo útil, agradece a quien te ayudó o intercambia contactos si quieres seguir en contacto.',
    },
    hi: {
      title: 'आपके सर्कल में एक दिन बाकी है',
      body: 'इस सर्कल में एक दिन बाकी है। एक आख़िरी उपयोगी सुझाव साझा करें, जिसने मदद की उसे धन्यवाद दें, या संपर्क में रहना चाहते हैं तो संपर्क जानकारी साझा करें।',
    },
    ar: {
      title: 'بقي يوم واحد في دائرتك',
      body: 'بقي يوم واحد في هذه الدائرة. شارك نصيحة مفيدة أخيرة، أو اشكر من ساعدك، أو تبادل معلومات التواصل إذا أردت البقاء على اتصال.',
    },
    'fr-CA': {
      title: 'Il reste une journée à votre cercle',
      body: 'Il reste une journée à ce cercle. Partagez un dernier conseil utile, remerciez une personne qui vous a aidé ou échangez vos coordonnées si vous voulez rester en contact.',
    },
  },
  learnReminderTier1: {
    en: {
      title: 'Continue your lesson',
      body: 'Pick up where you left off — your progress is saved.',
    },
    vi: {
      title: 'Tiếp tục bài học của bạn',
      body: 'Hãy tiếp tục từ chỗ bạn dừng lại — tiến độ của bạn đã được lưu.',
    },
    es: {
      title: 'Continúa tu lección',
      body: 'Retoma donde lo dejaste: tu progreso está guardado.',
    },
    hi: {
      title: 'अपना पाठ जारी रखें',
      body: 'जहाँ छोड़ा था वहीं से शुरू करें — आपकी प्रगति सुरक्षित है।',
    },
    ar: { title: 'تابع درسك', body: 'أكمل من حيث توقفت — تقدمك محفوظ.' },
    'fr-CA': {
      title: 'Continuez votre leçon',
      body: 'Reprenez où vous étiez rendu — votre progression est enregistrée.',
    },
  },
  learnReminderTier1Named: {
    en: {
      title: 'Continue your lesson',
      body: '{{name}}, pick up where you left off — your progress is saved.',
    },
    vi: {
      title: 'Tiếp tục bài học của bạn',
      body: '{{name}}, hãy tiếp tục từ chỗ bạn dừng lại — tiến độ của bạn đã được lưu.',
    },
    es: {
      title: 'Continúa tu lección',
      body: '{{name}}, retoma donde lo dejaste: tu progreso está guardado.',
    },
    hi: {
      title: 'अपना पाठ जारी रखें',
      body: '{{name}}, जहाँ छोड़ा था वहीं से शुरू करें — आपकी प्रगति सुरक्षित है।',
    },
    ar: {
      title: 'تابع درسك',
      body: '{{name}}، أكمل من حيث توقفت — تقدمك محفوظ.',
    },
    'fr-CA': {
      title: 'Continuez votre leçon',
      body: '{{name}}, reprenez où vous étiez rendu — votre progression est enregistrée.',
    },
  },
  learnReminderTier2: {
    en: {
      title: 'Keep learning!',
      body: 'You’re making progress — don’t stop now.',
    },
    vi: {
      title: 'Tiếp tục học nhé!',
      body: 'Bạn đang tiến bộ — đừng dừng lại lúc này.',
    },
    es: {
      title: '¡Sigue aprendiendo!',
      body: 'Estás avanzando: no te detengas ahora.',
    },
    hi: {
      title: 'सीखते रहें!',
      body: 'आप प्रगति कर रहे हैं — अभी मत रुकिए।',
    },
    ar: { title: 'واصل التعلّم!', body: 'أنت تتقدّم — لا تتوقف الآن.' },
    'fr-CA': {
      title: 'Continuez d’apprendre!',
      body: 'Vous progressez — ne vous arrêtez pas maintenant.',
    },
  },
  learnReminderTier2Named: {
    en: {
      title: 'Keep learning!',
      body: '{{name}}, you’re making progress — don’t stop now.',
    },
    vi: {
      title: 'Tiếp tục học nhé!',
      body: '{{name}}, bạn đang tiến bộ — đừng dừng lại lúc này.',
    },
    es: {
      title: '¡Sigue aprendiendo!',
      body: '{{name}}, estás avanzando: no te detengas ahora.',
    },
    hi: {
      title: 'सीखते रहें!',
      body: '{{name}}, आप प्रगति कर रहे हैं — अभी मत रुकिए।',
    },
    ar: {
      title: 'واصل التعلّم!',
      body: '{{name}}، أنت تتقدّم — لا تتوقف الآن.',
    },
    'fr-CA': {
      title: 'Continuez d’apprendre!',
      body: '{{name}}, vous progressez — ne vous arrêtez pas maintenant.',
    },
  },
  learnReminderTier3: {
    en: {
      title: 'We miss you!',
      body: 'It’s been a week — pick up where you left off.',
    },
    vi: {
      title: 'Chúng tôi nhớ bạn!',
      body: 'Đã một tuần rồi — hãy tiếp tục từ chỗ bạn dừng lại.',
    },
    es: {
      title: '¡Te extrañamos!',
      body: 'Ha pasado una semana: retoma donde lo dejaste.',
    },
    hi: {
      title: 'हमें आपकी कमी महसूस हुई!',
      body: 'एक हफ़्ता हो गया — जहाँ छोड़ा था वहीं से शुरू करें।',
    },
    ar: { title: 'اشتقنا إليك!', body: 'مضى أسبوع — أكمل من حيث توقفت.' },
    'fr-CA': {
      title: 'Vous nous manquez!',
      body: 'Ça fait une semaine — reprenez où vous étiez rendu.',
    },
  },
  learnReminderTier3Named: {
    en: {
      title: 'We miss you!',
      body: '{{name}}, it’s been a week — pick up where you left off.',
    },
    vi: {
      title: 'Chúng tôi nhớ bạn!',
      body: '{{name}}, đã một tuần rồi — hãy tiếp tục từ chỗ bạn dừng lại.',
    },
    es: {
      title: '¡Te extrañamos!',
      body: '{{name}}, ha pasado una semana: retoma donde lo dejaste.',
    },
    hi: {
      title: 'हमें आपकी कमी महसूस हुई!',
      body: '{{name}}, एक हफ़्ता हो गया — जहाँ छोड़ा था वहीं से शुरू करें।',
    },
    ar: {
      title: 'اشتقنا إليك!',
      body: '{{name}}، مضى أسبوع — أكمل من حيث توقفت.',
    },
    'fr-CA': {
      title: 'Vous nous manquez!',
      body: '{{name}}, ça fait une semaine — reprenez où vous étiez rendu.',
    },
  },
} as const satisfies Record<string, LocalizedTemplate>;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

export function isNotificationLanguage(
  value: unknown
): value is NotificationLanguage {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * Map an arbitrary stored/profile value onto a supported language.
 * `fr`, `fr-FR`, … all collapse onto `fr-CA`, the only French we ship —
 * the same rule the app uses for device locales.
 */
export function resolveNotificationLanguage(
  value: unknown
): NotificationLanguage {
  if (isNotificationLanguage(value)) return value;
  if (typeof value !== 'string') return DEFAULT_NOTIFICATION_LANGUAGE;
  const base = value.split('-')[0]?.toLowerCase();
  if (base === 'fr') return 'fr-CA';
  if (isNotificationLanguage(base)) return base;
  return DEFAULT_NOTIFICATION_LANGUAGE;
}

export function isNotificationTemplateKey(
  value: unknown
): value is NotificationTemplateKey {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(NOTIFICATION_TEMPLATES, value)
  );
}

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Minimal `{{token}}` interpolation, matching i18next's default syntax so the
 * server and the client can share one set of strings. A missing `name` falls
 * back to the localized "Someone"; any other missing token renders empty.
 */
export function interpolate(
  template: string,
  params: NotificationTemplateParams | undefined,
  lang: NotificationLanguage
): string {
  return template.replace(PLACEHOLDER_RE, (_match, token: string) => {
    const value = params?.[token];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
    if (token === 'name') return FALLBACK_ACTOR_NAME[lang];
    return '';
  });
}

/**
 * Render a template key in one language. Returns null for unknown keys so the
 * caller can fall back to stored English rather than print a raw key.
 */
export function render(
  key: string,
  lang: unknown,
  params?: NotificationTemplateParams
): RenderedNotification | null {
  if (!isNotificationTemplateKey(key)) return null;
  const language = resolveNotificationLanguage(lang);
  const entry =
    NOTIFICATION_TEMPLATES[key][language] ??
    NOTIFICATION_TEMPLATES[key][DEFAULT_NOTIFICATION_LANGUAGE];
  return {
    title: interpolate(entry.title, params, language),
    body: interpolate(entry.body, params, language),
  };
}

/** Build the `data.i18n` payload stored alongside the English text. */
export function buildI18n(
  key: NotificationTemplateKey,
  params?: NotificationTemplateParams
): NotificationI18nPayload {
  return params && Object.keys(params).length > 0 ? { key, params } : { key };
}

/** Read `data.i18n` back out of a notification row's jsonb, defensively. */
export function readI18nPayload(data: unknown): NotificationI18nPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const i18n = (data as Record<string, unknown>).i18n;
  if (typeof i18n !== 'object' || i18n === null) return null;
  const { key, params } = i18n as Record<string, unknown>;
  if (typeof key !== 'string') return null;
  if (params !== undefined && (typeof params !== 'object' || params === null)) {
    return { key };
  }
  return {
    key,
    params: params as NotificationTemplateParams | undefined,
  };
}

/**
 * Resolve the text to show a recipient: the localized template when the row
 * carries `data.i18n` and the key is known, otherwise the stored English.
 * This is the single fallback path used by `send-social-push`.
 */
export function resolveNotificationText(
  row: { title: string; body: string; data?: unknown },
  lang: unknown
): RenderedNotification {
  const payload = readI18nPayload(row.data);
  if (payload) {
    const rendered = render(payload.key, lang, payload.params);
    if (rendered) return rendered;
  }
  return { title: row.title, body: row.body };
}

/**
 * Structural shape of the bits of `SupabaseClient` these helpers touch. Typed
 * loosely on purpose: the edge functions import supabase-js from both `jsr:`
 * and `esm.sh`, and those two client types are not mutually assignable.
 */
export interface NotificationLanguageSource {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        maybeSingle(): PromiseLike<{
          data: { preferred_language?: unknown } | null;
          error: unknown;
        }>;
      };
      in(
        column: string,
        values: string[]
      ): PromiseLike<{
        data: Array<{ id: string; preferred_language?: unknown }> | null;
        error: unknown;
      }>;
    };
  };
}

const LANGUAGE_TABLE = 'user_onboarding_profiles';

/**
 * Recipient language for one user. Never throws: any failure means English,
 * which is what the row's stored copy already says.
 */
export async function getPreferredLanguage(
  supabase: NotificationLanguageSource,
  userId: string
): Promise<NotificationLanguage> {
  try {
    const { data, error } = await supabase
      .from(LANGUAGE_TABLE)
      .select('preferred_language')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return DEFAULT_NOTIFICATION_LANGUAGE;
    return resolveNotificationLanguage(data.preferred_language);
  } catch (e) {
    console.error('getPreferredLanguage failed', e);
    return DEFAULT_NOTIFICATION_LANGUAGE;
  }
}

/**
 * Recipient languages for many users in one round trip. Users with no row, or
 * an unrecognized value, are reported as English.
 */
export async function getPreferredLanguages(
  supabase: NotificationLanguageSource,
  userIds: string[]
): Promise<Map<string, NotificationLanguage>> {
  const byUser = new Map<string, NotificationLanguage>();
  const unique = [...new Set(userIds)];
  for (const id of unique) byUser.set(id, DEFAULT_NOTIFICATION_LANGUAGE);
  if (!unique.length) return byUser;

  try {
    const { data, error } = await supabase
      .from(LANGUAGE_TABLE)
      .select('id, preferred_language')
      .in('id', unique);
    if (error || !data) return byUser;
    for (const row of data) {
      byUser.set(row.id, resolveNotificationLanguage(row.preferred_language));
    }
  } catch (e) {
    console.error('getPreferredLanguages failed', e);
  }
  return byUser;
}
