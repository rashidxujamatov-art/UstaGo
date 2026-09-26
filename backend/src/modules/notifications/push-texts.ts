import type { Language } from '../../generated/prisma/client.js';

/**
 * Push texts. Like SMS, a push is shown by the phone's OS while the app may be closed,
 * so the backend writes it in the user's language. {order} is the order number.
 */
export const PUSH_TEXTS = {
  ORDER_ACCEPTED: {
    uz: 'Buyurtma #{order}: usta ishni qabul qildi',
    ru: 'Заказ #{order}: мастер принял заказ',
    en: 'Order #{order}: a pro accepted your job',
    tg: 'Фармоиши #{order}: усто корро қабул кард',
  },
  ORDER_EN_ROUTE: {
    uz: 'Buyurtma #{order}: usta yo‘lga chiqdi',
    ru: 'Заказ #{order}: мастер выехал',
    en: 'Order #{order}: the pro is on the way',
    tg: 'Фармоиши #{order}: усто ба роҳ баромад',
  },
  ORDER_ARRIVED: {
    uz: 'Buyurtma #{order}: usta yetib keldi',
    ru: 'Заказ #{order}: мастер на месте',
    en: 'Order #{order}: the pro has arrived',
    tg: 'Фармоиши #{order}: усто расид',
  },
  ORDER_STARTED: {
    uz: 'Buyurtma #{order}: usta ishni boshladi',
    ru: 'Заказ #{order}: мастер начал работу',
    en: 'Order #{order}: the pro started the work',
    tg: 'Фармоиши #{order}: усто корро оғоз кард',
  },
  ORDER_FINISHED: {
    uz: 'Buyurtma #{order}: usta ishni yakunladi. Tekshirib, qabul qiling',
    ru: 'Заказ #{order}: мастер закончил работу. Проверьте и примите',
    en: 'Order #{order}: the work is done. Please check and accept it',
    tg: 'Фармоиши #{order}: усто корро анҷом дод. Санҷед ва қабул кунед',
  },
  ORDER_DECLINED: {
    uz: 'Buyurtma #{order}: usta voz kechdi, buyurtma qayta ustalarga ko‘rsatilmoqda',
    ru: 'Заказ #{order}: мастер отказался, заказ снова виден мастерам',
    en: 'Order #{order}: the pro withdrew, the job is open to others again',
    tg: 'Фармоиши #{order}: усто рад кард, фармоиш боз ба устоҳо намоён аст',
  },
  ORDER_CANCELLED: {
    uz: 'Buyurtma #{order} bekor qilindi',
    ru: 'Заказ #{order} отменён',
    en: 'Order #{order} was cancelled',
    tg: 'Фармоиши #{order} бекор карда шуд',
  },
  ORDER_EXPIRED: {
    uz: 'Buyurtma #{order}: vaqti o‘tdi va hech kim olmadi, bekor qilindi. Qayta joylashingiz mumkin',
    ru: 'Заказ #{order}: время истекло, никто не взял — заказ отменён. Можно разместить снова',
    en: 'Order #{order}: nobody took it in time, so it was cancelled. You can post it again',
    tg: 'Фармоиши #{order}: вақташ гузашт ва касе нагирифт, бекор шуд. Метавонед аз нав гузоред',
  },
  CHAT_MESSAGE: {
    uz: 'Buyurtma #{order}: yangi xabar',
    ru: 'Заказ #{order}: новое сообщение',
    en: 'Order #{order}: new message',
    tg: 'Фармоиши #{order}: паёми нав',
  },
} as const satisfies Record<string, Record<Language, string>>;

export type PushType = keyof typeof PUSH_TEXTS;

export function pushText(type: PushType, language: Language, params: { order: number }): string {
  return PUSH_TEXTS[type][language].replace('{order}', String(params.order));
}
