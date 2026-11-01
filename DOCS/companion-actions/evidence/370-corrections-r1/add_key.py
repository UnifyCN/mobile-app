"""Adds savedDetails.reviewUnverified after savedDetails.reviewRemove in every locale (text insert, formatting kept)."""
import json, re, sys
T = {
  'en': 'The current text of this detail could not be confirmed, so nothing was saved. Open Saved details to see it.',
  'ar': 'تعذّر التأكد من النص الحالي لهذا التفصيل، لذلك لم يُحفظ أي شيء. افتح التفاصيل المحفوظة لرؤيته.',
  'es': 'No se pudo confirmar el texto actual de este dato, así que no se guardó nada. Abre Datos guardados para verlo.',
  'fr-CA': 'Le texte actuel de ce détail n’a pas pu être confirmé, donc rien n’a été enregistré. Ouvrez Détails enregistrés pour le voir.',
  'hi': 'इस जानकारी के मौजूदा पाठ की पुष्टि नहीं हो सकी, इसलिए कुछ भी सहेजा नहीं गया। इसे देखने के लिए सहेजी गई जानकारी खोलें।',
  'pa': 'ਇਸ ਜਾਣਕਾਰੀ ਦੀ ਮੌਜੂਦਾ ਲਿਖਤ ਦੀ ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੋ ਸਕੀ, ਇਸ ਲਈ ਕੁਝ ਵੀ ਨਹੀਂ ਸੰਭਾਲਿਆ ਗਿਆ। ਇਸਨੂੰ ਵੇਖਣ ਲਈ ਸੰਭਾਲੀ ਜਾਣਕਾਰੀ ਖੋਲ੍ਹੋ।',
  'vi': 'Không thể xác nhận nội dung hiện tại của thông tin này nên chưa có gì được lưu. Hãy mở Thông tin đã lưu để xem.',
}
root = sys.argv[1]
import os
langs = sorted(os.listdir(root))
assert set(langs) == set(T), langs
for lang in langs:
    p = f'{root}/{lang}/translation.json'
    s = open(p, encoding='utf-8').read()
    if '"reviewUnverified"' in s: continue
    m = list(re.finditer(r'^(\s*)"reviewRemove": .*,\n', s, re.M))
    assert len(m) == 1, (lang, len(m))
    ind = m[0].group(1)
    line = f'{ind}"reviewUnverified": {json.dumps(T[lang], ensure_ascii=False)},\n'
    s = s[:m[0].end()] + line + s[m[0].end():]
    d = json.loads(s)
    assert d['savedDetails']['reviewUnverified'] == T[lang]
    open(p, 'w', encoding='utf-8').write(s)
    print('added', lang)
