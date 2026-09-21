import {
  containerOpen,
  escapeHtml,
  logoImg,
  type WelcomeTemplate,
  type WelcomeTemplateOptions,
} from './common.ts';

export const es = (opts: WelcomeTemplateOptions): WelcomeTemplate => {
  const safeFirstName = opts.firstName ? escapeHtml(opts.firstName) : null;
  const opener = safeFirstName ? `Hola ${safeFirstName}:` : 'Hola:';
  const textOpener = opts.firstName ? `Hola ${opts.firstName}:` : 'Hola:';

  const html = `${containerOpen('es')}${logoImg()}<p style="margin:0 0 16px;">${opener}</p><p style="margin:0 0 16px;">Gracias por unirte a Unify.</p><p style="margin:0 0 16px;">Si tienes preguntas o comentarios, escríbenos a <a href="mailto:contact@unifysocial.ca" style="color:#1a1a1a;text-decoration:underline;">contact@unifysocial.ca</a>: nos encantará leerte.</p><p style="margin:32px 0 0;">— Savar y Cedric<br/>Cofundadores de Unify</p><p style="margin:24px 0 0;color:#666;">P. D. Leemos todos y cada uno de los correos.</p></div>`;

  const text = `${textOpener}

Gracias por unirte a Unify.

Si tienes preguntas o comentarios, escríbenos a contact@unifysocial.ca: nos encantará leerte.

— Savar y Cedric
Cofundadores de Unify

P. D. Leemos todos y cada uno de los correos.`;

  return {
    subject: 'Te damos la bienvenida a Unify',
    html,
    text,
  };
};
