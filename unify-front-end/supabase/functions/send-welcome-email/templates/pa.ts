import {
  containerOpen,
  escapeHtml,
  logoImg,
  type WelcomeTemplate,
  type WelcomeTemplateOptions,
} from './common.ts';

export const pa = (opts: WelcomeTemplateOptions): WelcomeTemplate => {
  const safeFirstName = opts.firstName ? escapeHtml(opts.firstName) : null;
  const opener = safeFirstName
    ? `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${safeFirstName},`
    : 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ,';
  const textOpener = opts.firstName
    ? `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${opts.firstName},`
    : 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ,';

  const html = `${containerOpen('pa')}${logoImg()}<p style="margin:0 0 16px;">${opener}</p><p style="margin:0 0 16px;">Unify ਨਾਲ ਜੁੜਨ ਲਈ ਤੁਹਾਡਾ ਧੰਨਵਾਦ।</p><p style="margin:0 0 16px;">ਜੇ ਤੁਹਾਡੇ ਕੋਈ ਸਵਾਲ ਜਾਂ ਸੁਝਾਅ ਹਨ, ਤਾਂ <a href="mailto:contact@unifysocial.ca" style="color:#1a1a1a;text-decoration:underline;">contact@unifysocial.ca</a> 'ਤੇ ਈਮੇਲ ਭੇਜੋ — ਸਾਨੂੰ ਤੁਹਾਡੇ ਤੋਂ ਸੁਣ ਕੇ ਬਹੁਤ ਖੁਸ਼ੀ ਹੋਵੇਗੀ।</p><p style="margin:32px 0 0;">— ਸਵਾਰ ਅਤੇ ਸੈਡਰਿਕ<br/>ਸਹਿ-ਸੰਸਥਾਪਕ, Unify</p><p style="margin:24px 0 0;color:#666;">ਪੁਨਸ਼ਚ: ਅਸੀਂ ਹਰ ਇੱਕ ਈਮੇਲ ਪੜ੍ਹਦੇ ਹਾਂ।</p></div>`;

  const text = `${textOpener}

Unify ਨਾਲ ਜੁੜਨ ਲਈ ਤੁਹਾਡਾ ਧੰਨਵਾਦ।

ਜੇ ਤੁਹਾਡੇ ਕੋਈ ਸਵਾਲ ਜਾਂ ਸੁਝਾਅ ਹਨ, ਤਾਂ contact@unifysocial.ca 'ਤੇ ਈਮੇਲ ਭੇਜੋ — ਸਾਨੂੰ ਤੁਹਾਡੇ ਤੋਂ ਸੁਣ ਕੇ ਬਹੁਤ ਖੁਸ਼ੀ ਹੋਵੇਗੀ।

— ਸਵਾਰ ਅਤੇ ਸੈਡਰਿਕ
ਸਹਿ-ਸੰਸਥਾਪਕ, Unify

ਪੁਨਸ਼ਚ: ਅਸੀਂ ਹਰ ਇੱਕ ਈਮੇਲ ਪੜ੍ਹਦੇ ਹਾਂ।`;

  return {
    subject: 'Unify ਵਿੱਚ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ',
    html,
    text,
  };
};
