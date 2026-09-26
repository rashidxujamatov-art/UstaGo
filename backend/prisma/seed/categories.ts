/**
 * Initial service categories (docs/01-biznes-qoidalar.md §13, 2026-09-26). The super admin
 * edits them later (categories.manage). Colors follow the canvas tiles on BY1 / BY2.
 */
export const categoriesSeed = [
  {
    slug: 'electric',
    icon: 'zap',
    color: '#E67A22',
    names: { uz: 'Elektrik', ru: 'Электрик', en: 'Electrician', tg: 'Барқчӣ' },
  },
  {
    slug: 'plumbing',
    icon: 'droplet',
    color: '#2F7BE0',
    names: { uz: 'Santexnik', ru: 'Сантехник', en: 'Plumber', tg: 'Сантехник' },
  },
  {
    slug: 'repair',
    icon: 'paint-roller',
    color: '#8457D6',
    names: { uz: 'Ta’mirlash', ru: 'Ремонт', en: 'Repair', tg: 'Таъмир' },
  },
  {
    slug: 'cleaning',
    icon: 'sparkles',
    color: '#2EA05B',
    names: { uz: 'Tozalash', ru: 'Уборка', en: 'Cleaning', tg: 'Тозакунӣ' },
  },
  {
    slug: 'furniture',
    icon: 'armchair',
    color: '#D64B86',
    names: { uz: 'Mebel', ru: 'Мебель', en: 'Furniture', tg: 'Мебел' },
  },
  {
    slug: 'air-conditioning',
    icon: 'snowflake',
    color: '#1C98AC',
    names: { uz: 'Konditsioner', ru: 'Кондиционеры', en: 'Air conditioning', tg: 'Кондитсионер' },
  },
  {
    slug: 'other',
    icon: 'wrench',
    color: '#6B7785',
    names: { uz: 'Boshqa', ru: 'Другое', en: 'Other', tg: 'Дигар' },
  },
] as const;
