import {
  containerOpen,
  escapeHtml,
  logoImg,
  type WelcomeTemplate,
  type WelcomeTemplateOptions,
} from './common.ts';

export const vi = (opts: WelcomeTemplateOptions): WelcomeTemplate => {
  const safeFirstName = opts.firstName ? escapeHtml(opts.firstName) : null;
  const opener = safeFirstName ? `Chào ${safeFirstName},` : 'Chào bạn,';
  const textOpener = opts.firstName ? `Chào ${opts.firstName},` : 'Chào bạn,';

  const html = `${containerOpen('vi')}${logoImg()}<p style="margin:0 0 16px;">${opener}</p><p style="margin:0 0 16px;">Cảm ơn bạn đã tham gia Unify.</p><p style="margin:0 0 16px;">Nếu bạn có câu hỏi hoặc góp ý, hãy gửi email đến <a href="mailto:contact@unifysocial.ca" style="color:#1a1a1a;text-decoration:underline;">contact@unifysocial.ca</a> — chúng tôi rất mong được nghe từ bạn.</p><p style="margin:32px 0 0;">— Savar &amp; Cedric<br/>Đồng sáng lập, Unify</p><p style="margin:24px 0 0;color:#666;">T.B. Chúng tôi đọc từng email một.</p></div>`;

  const text = `${textOpener}

Cảm ơn bạn đã tham gia Unify.

Nếu bạn có câu hỏi hoặc góp ý, hãy gửi email đến contact@unifysocial.ca — chúng tôi rất mong được nghe từ bạn.

— Savar & Cedric
Đồng sáng lập, Unify

T.B. Chúng tôi đọc từng email một.`;

  return {
    subject: 'Chào mừng bạn đến với Unify',
    html,
    text,
  };
};
