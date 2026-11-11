import type { Language } from '@/lib/profile';

const rows: Record<Language, readonly [string, string]> = {
  sv: ['Bjud in från din vänlista', 'Skicka inbjudningar'], en: ['Invite friends', 'Send invitations'],
  no: ['Inviter venner', 'Send invitasjoner'], da: ['Inviter venner', 'Send invitationer'],
  fi: ['Kutsu ystäviä', 'Lähetä kutsut'], es: ['Invitar amigos', 'Enviar invitaciones'],
  fr: ['Inviter des amis', 'Envoyer les invitations'], it: ['Invita amici', 'Invia inviti'],
  de: ['Freunde einladen', 'Einladungen senden'], nl: ['Vrienden uitnodigen', 'Uitnodigingen versturen'],
  ca: ['Convida amics', 'Envia invitacions'], ro: ['Invită prieteni', 'Trimite invitațiile'],
  tr: ['Arkadaşlarını davet et', 'Davetleri gönder'], pl: ['Zaproś znajomych', 'Wyślij zaproszenia'],
  cs: ['Pozvat přátele', 'Odeslat pozvánky'], sk: ['Pozvať priateľov', 'Odoslať pozvánky'],
  sl: ['Povabi prijatelje', 'Pošlji povabila'], hr: ['Pozovi prijatelje', 'Pošalji pozivnice'],
  hu: ['Barátok meghívása', 'Meghívók küldése'], pt: ['Convidar amigos', 'Enviar convites'],
  'pt-BR': ['Convidar amigos', 'Enviar convites'], id: ['Undang teman', 'Kirim undangan'],
  ms: ['Jemput rakan', 'Hantar jemputan'], vi: ['Mời bạn bè', 'Gửi lời mời'],
  el: ['Πρόσκληση φίλων', 'Αποστολή προσκλήσεων'], ru: ['Пригласить друзей', 'Отправить приглашения'],
  uk: ['Запросити друзів', 'Надіслати запрошення'], ja: ['友達を招待', '招待を送信'],
  ko: ['친구 초대', '초대 보내기'], th: ['เชิญเพื่อน', 'ส่งคำเชิญ'],
  hi: ['दोस्तों को आमंत्रित करें', 'निमंत्रण भेजें'], bn: ['বন্ধুদের আমন্ত্রণ জানান', 'আমন্ত্রণ পাঠান'],
  gu: ['મિત્રોને આમંત્રિત કરો', 'આમંત્રણો મોકલો'], kn: ['ಸ್ನೇಹಿತರನ್ನು ಆಹ್ವಾನಿಸಿ', 'ಆಹ್ವಾನಗಳನ್ನು ಕಳುಹಿಸಿ'],
  ml: ['സുഹൃത്തുക്കളെ ക്ഷണിക്കുക', 'ക്ഷണങ്ങൾ അയയ്ക്കുക'], mr: ['मित्रांना आमंत्रित करा', 'आमंत्रणे पाठवा'],
  or: ['ବନ୍ଧୁମାନଙ୍କୁ ଆମନ୍ତ୍ରଣ କରନ୍ତୁ', 'ଆମନ୍ତ୍ରଣ ପଠାନ୍ତୁ'], pa: ['ਦੋਸਤਾਂ ਨੂੰ ਸੱਦਾ ਦਿਓ', 'ਸੱਦੇ ਭੇਜੋ'],
  ta: ['நண்பர்களை அழைக்கவும்', 'அழைப்புகளை அனுப்பவும்'], te: ['స్నేహితులను ఆహ్వానించండి', 'ఆహ్వానాలు పంపండి'],
};

export function lobbyInviteCopy(lang: Language) {
  const [invite, send] = rows[lang];
  return { invite, send };
}