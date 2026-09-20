import {
  containerOpen,
  escapeHtml,
  logoImg,
  type WelcomeTemplate,
  type WelcomeTemplateOptions,
} from './common.ts';

export const frCA = (opts: WelcomeTemplateOptions): WelcomeTemplate => {
  const safeFirstName = opts.firstName ? escapeHtml(opts.firstName) : null;
  const opener = safeFirstName ? `Bonjour ${safeFirstName},` : 'Bonjour,';
  const textOpener = opts.firstName ? `Bonjour ${opts.firstName},` : 'Bonjour,';

  const html = `${containerOpen('fr-CA')}${logoImg()}<p style="margin:0 0 16px;">${opener}</p><p style="margin:0 0 16px;">Merci de vous être joint à Unify.</p><p style="margin:0 0 16px;">Si vous avez des questions ou des commentaires, écrivez-nous à <a href="mailto:contact@unifysocial.ca" style="color:#1a1a1a;text-decoration:underline;">contact@unifysocial.ca</a> — nous serons ravis de vous lire.</p><p style="margin:32px 0 0;">— Savar et Cedric<br/>Cofondateurs, Unify</p><p style="margin:24px 0 0;color:#666;">P.-S. Nous lisons chaque courriel.</p></div>`;

  const text = `${textOpener}

Merci de vous être joint à Unify.

Si vous avez des questions ou des commentaires, écrivez-nous à contact@unifysocial.ca — nous serons ravis de vous lire.

— Savar et Cedric
Cofondateurs, Unify

P.-S. Nous lisons chaque courriel.`;

  return {
    subject: 'Bienvenue sur Unify',
    html,
    text,
  };
};
