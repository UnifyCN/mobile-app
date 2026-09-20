import {
  containerOpen,
  escapeHtml,
  logoImg,
  type WelcomeTemplate,
  type WelcomeTemplateOptions,
} from './common.ts';

export const hi = (opts: WelcomeTemplateOptions): WelcomeTemplate => {
  const safeFirstName = opts.firstName ? escapeHtml(opts.firstName) : null;
  const opener = safeFirstName ? `नमस्ते ${safeFirstName},` : 'नमस्ते,';
  const textOpener = opts.firstName ? `नमस्ते ${opts.firstName},` : 'नमस्ते,';

  const html = `${containerOpen('hi')}${logoImg()}<p style="margin:0 0 16px;">${opener}</p><p style="margin:0 0 16px;">Unify से जुड़ने के लिए धन्यवाद।</p><p style="margin:0 0 16px;">अगर आपके कोई सवाल या सुझाव हों, तो <a href="mailto:contact@unifysocial.ca" style="color:#1a1a1a;text-decoration:underline;">contact@unifysocial.ca</a> पर ईमेल भेजें — हमें आपसे सुनकर बहुत खुशी होगी।</p><p style="margin:32px 0 0;">— सवार और सेड्रिक<br/>सह-संस्थापक, Unify</p><p style="margin:24px 0 0;color:#666;">पुनश्च: हम हर एक ईमेल पढ़ते हैं।</p></div>`;

  const text = `${textOpener}

Unify से जुड़ने के लिए धन्यवाद।

अगर आपके कोई सवाल या सुझाव हों, तो contact@unifysocial.ca पर ईमेल भेजें — हमें आपसे सुनकर बहुत खुशी होगी।

— सवार और सेड्रिक
सह-संस्थापक, Unify

पुनश्च: हम हर एक ईमेल पढ़ते हैं।`;

  return {
    subject: 'Unify में आपका स्वागत है',
    html,
    text,
  };
};
