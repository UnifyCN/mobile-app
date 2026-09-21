import {
  containerOpen,
  escapeHtml,
  logoImg,
  type WelcomeTemplate,
  type WelcomeTemplateOptions,
} from './common.ts';

export const en = (opts: WelcomeTemplateOptions): WelcomeTemplate => {
  const safeFirstName = opts.firstName ? escapeHtml(opts.firstName) : null;
  const opener = safeFirstName ? `Hey ${safeFirstName},` : 'Hey there,';
  const textOpener = opts.firstName ? `Hey ${opts.firstName},` : 'Hey there,';

  const html = `${containerOpen('en')}${logoImg()}<p style="margin:0 0 16px;">${opener}</p><p style="margin:0 0 16px;">Thanks for joining Unify.</p><p style="margin:0 0 16px;">If you have any questions or feedback, send an email to <a href="mailto:contact@unifysocial.ca" style="color:#1a1a1a;text-decoration:underline;">contact@unifysocial.ca</a> — we'd love to hear from you.</p><p style="margin:32px 0 0;">— Savar &amp; Cedric<br/>Co-Founders, Unify</p><p style="margin:24px 0 0;color:#666;">P.S. We read every single email.</p></div>`;

  const text = `${textOpener}

Thanks for joining Unify.

If you have any questions or feedback, send an email to contact@unifysocial.ca — we'd love to hear from you.

— Savar & Cedric
Co-Founders, Unify

P.S. We read every single email.`;

  return {
    subject: 'Welcome to Unify',
    html,
    text,
  };
};
