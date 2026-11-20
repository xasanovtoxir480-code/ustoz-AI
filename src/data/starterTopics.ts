import type { StarterTopic } from '../types/lesson';

export const STARTER_TOPICS: StarterTopic[] = [
  {
    id: 'math-quadratic',
    subject: 'Matematika',
    level: 'beginner',
    title: "Kvadrat tenglamani oddiy yo'l bilan yechish",
    question:
      "ax² + bx + c = 0 ko'rinishidagi tenglamani qanday qilib qadamma-qadam yechamiz va diskriminant (D = b² - 4ac) nima uchun kerak?",
    focusNote: "Har bir sonni joyiga qo'yish va nega manfiy son chiqsa yechim bo'lmasligi",
  },
  {
    id: 'code-recursion',
    subject: 'Dasturlash',
    level: 'intermediate',
    title: "Funksiya o'zini o'zi chaqirishi (Rekursiya) qanday ishlaydi?",
    question:
      "Dasturlashda o'zini o'zi chaqiradigan funksiyani qanday yozish kerak va to'xtatish sharti (base case) qo'yilmasa nima uchun dastur qotib qoladi?",
    focusNote: "Qadamlar ketma-ketligi va to'xtash nuqtasining vazifasi",
  },
  {
    id: 'physics-ohm',
    subject: 'Fizika',
    level: 'beginner',
    title: "Elektr zanjirida tok, kuchlanish va qarshilik",
    question:
      "Elektr zanjirida tok kuchini qanday hisoblaymiz va nima uchun kichkina chiroqcha (LED) oldiga qarshilik qo'yilmasa u kuyib ketadi?",
    focusNote: "Oddiy formula va chiroqchani himoya qilish sababi",
  },
  {
    id: 'english-tenses',
    subject: 'Ingliz tili',
    level: 'intermediate',
    title: "Past Simple va Present Perfect qachon ishlatiladi?",
    question:
      "Ingliz tilida qachon 'I lost my key' va qachon 'I have lost my key' deyish to'g'ri? Ularning ma'nosi nima uchun farq qiladi?",
    focusNote: "O'tgan vaqt va hozirgi natija o'rtasidagi farq",
  },
  {
    id: 'git-rebase-merge',
    subject: 'Dasturlash',
    level: 'deep',
    title: "Git Merge va Rebase farqi: qaysi birini tanlash kerak?",
    question:
      "Loyihada Git merge va Git rebase buyruqlari qanday ishlatiladi va nima uchun hamma ishlayotgan asosiy branchda rebase qilish xavfli?",
    focusNote: "O'zgarishlar tarixini birlashtirish va xato qilmaslik qoidasi",
  },
  {
    id: 'econ-compound',
    subject: 'Iqtisodiyot',
    level: 'intermediate',
    title: "Foiz ustiga foiz (Murakkab foiz) qanday ko'payadi?",
    question:
      "Pul jamg'arishda foiz ustiga foiz qo'shilishi qanday hisoblanadi va nima uchun uzoq vaqt o'tgan sari foyda keskin tezlashib ketadi?",
    focusNote: "Foydaning yana foyda keltirishi va vaqt ta'siri",
  },
];

export const SUBJECT_FILTERS = [
  'Barchasi',
  'Matematika',
  'Dasturlash',
  'Fizika',
  'Ingliz tili',
  'Iqtisodiyot',
];
