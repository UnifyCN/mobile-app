import {
  containerOpen,
  escapeHtml,
  logoImg,
  type WelcomeTemplate,
  type WelcomeTemplateOptions,
} from './common.ts';

export const ar = (opts: WelcomeTemplateOptions): WelcomeTemplate => {
  const safeFirstName = opts.firstName ? escapeHtml(opts.firstName) : null;
  const opener = safeFirstName ? `مرحبًا ${safeFirstName}،` : 'مرحبًا،';
  const textOpener = opts.firstName ? `مرحبًا ${opts.firstName}،` : 'مرحبًا،';

  // Arabic is the one right-to-left locale: the container carries
  // dir="rtl" lang="ar" and the logo mirrors to the right edge.
  const html = `${containerOpen('ar', 'rtl')}${logoImg('rtl')}<p style="margin:0 0 16px;">${opener}</p><p style="margin:0 0 16px;">شكرًا لانضمامك إلى Unify.</p><p style="margin:0 0 16px;">إذا كان لديك أي سؤال أو ملاحظة، أرسل رسالة إلى <a href="mailto:contact@unifysocial.ca" style="color:#1a1a1a;text-decoration:underline;" dir="ltr">contact@unifysocial.ca</a> — يسعدنا أن نسمع منك.</p><p style="margin:32px 0 0;">— سافار وسيدريك<br/>المؤسّسان المشاركان لـ Unify</p><p style="margin:24px 0 0;color:#666;">ملاحظة: نقرأ كل رسالة تصلنا.</p></div>`;

  const text = `${textOpener}

شكرًا لانضمامك إلى Unify.

إذا كان لديك أي سؤال أو ملاحظة، أرسل رسالة إلى contact@unifysocial.ca — يسعدنا أن نسمع منك.

— سافار وسيدريك
المؤسّسان المشاركان لـ Unify

ملاحظة: نقرأ كل رسالة تصلنا.`;

  return {
    subject: 'مرحبًا بك في Unify',
    html,
    text,
  };
};
