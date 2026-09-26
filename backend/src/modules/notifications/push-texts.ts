import type { Language } from '../../generated/prisma/client.js';

/**
 * Push texts. Like SMS, a push is shown by the phone's OS while the app may be closed,
 * so the backend writes it in the user's language. {order} is the order number,
 * {fee} a so'm amount, {days} a number of days.
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
  PAYMENT_CUSTOMER_PAID: {
    uz: 'Buyurtma #{order}: mijoz «To‘ladim»ni bosdi. Pulni olgan bo‘lsangiz, tasdiqlang',
    ru: 'Заказ #{order}: клиент нажал «Я оплатил». Если деньги у вас, подтвердите',
    en: 'Order #{order}: the customer tapped “I paid”. Confirm once you have the money',
    tg: 'Фармоиши #{order}: мизоҷ «Пардохт кардам»-ро пахш кард. Агар пулро гирифтед, тасдиқ кунед',
  },
  ORDER_PAID_FEE: {
    uz: 'Buyurtma #{order} yopildi. Xizmat haqi {fee} so‘m hisobingizdan yechildi',
    ru: 'Заказ #{order} закрыт. Комиссия сервиса {fee} сум списана с вашего баланса',
    en: 'Order #{order} is closed. The {fee} UZS service fee was taken from your balance',
    tg: 'Фармоиши #{order} пӯшида шуд. Ҳаққи хизмат {fee} сӯм аз ҳисобатон гирифта шуд',
  },
  ORDER_PAID: {
    uz: 'Buyurtma #{order} yopildi. Rahmat!',
    ru: 'Заказ #{order} закрыт. Спасибо!',
    en: 'Order #{order} is closed. Thank you!',
    tg: 'Фармоиши #{order} пӯшида шуд. Ташаккур!',
  },
  ORDER_DISPUTED: {
    uz: 'Buyurtma #{order} bo‘yicha nizo ochildi. Admin ko‘rib chiqadi',
    ru: 'По заказу #{order} открыт спор. Его рассмотрит администратор',
    en: 'A dispute was opened on order #{order}. An admin will review it',
    tg: 'Дар бораи фармоиши #{order} баҳс кушода шуд. Админ баррасӣ мекунад',
  },
  REMIND_CUSTOMER_PAY: {
    uz: 'Buyurtma #{order}: usta ishni tugatgan. To‘lagan bo‘lsangiz, «To‘ladim»ni bosing',
    ru: 'Заказ #{order}: мастер закончил работу. Если вы оплатили, нажмите «Я оплатил»',
    en: 'Order #{order}: the work is done. If you have paid, tap “I paid”',
    tg: 'Фармоиши #{order}: усто корро анҷом дод. Агар пардохт карда бошед, «Пардохт кардам»-ро пахш кунед',
  },
  REMIND_EXECUTOR_RECEIVED: {
    uz: 'Buyurtma #{order}: mijoz to‘laganini aytdi. «Pulni qabul qildim»ni bosing',
    ru: 'Заказ #{order}: клиент сообщил об оплате. Нажмите «Деньги получил»',
    en: 'Order #{order}: the customer says they paid. Tap “Money received”',
    tg: 'Фармоиши #{order}: мизоҷ гуфт, ки пардохт кард. «Пулро гирифтам»-ро пахш кунед',
  },
  FREE_PERIOD_ENDING: {
    uz: 'Bepul oyingiz tugashiga {days} kun qoldi. Keyin ish olish uchun soliq usuli kerak bo‘ladi',
    ru: 'До конца бесплатного месяца осталось {days} дн. Потом для заказов понадобится способ уплаты налога',
    en: 'Your free month ends in {days} days. After that you will need a tax method to take jobs',
    tg: 'То анҷоми моҳи ройгон {days} рӯз монд. Баъд барои гирифтани кор усули андоз лозим мешавад',
  },
  CHAT_MESSAGE: {
    uz: 'Buyurtma #{order}: yangi xabar',
    ru: 'Заказ #{order}: новое сообщение',
    en: 'Order #{order}: new message',
    tg: 'Фармоиши #{order}: паёми нав',
  },
} as const satisfies Record<string, Record<Language, string>>;

export type PushType = keyof typeof PUSH_TEXTS;

export type PushParams = Record<string, string | number>;

export function pushText(type: PushType, language: Language, params: PushParams): string {
  return PUSH_TEXTS[type][language].replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
