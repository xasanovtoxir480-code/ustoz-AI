export function MethodologySection() {
  const pillars = [
    {
      index: '01',
      title: "Qiyin so'zlarsiz, oddiy tilda tushuntirish",
      body: "Ko'p darsliklar qiyin atamalar bilan yozilgani uchun o'quvchi chalg'iydi. Ustoz AI esa har bir fikrni kundalik hayotdagi oddiy misollar bilan tushuntiradi.",
    },
    {
      index: '02',
      title: "Hech bir mayda qadamni tashlab ketmaslik",
      body: "Masalani yechishda yoki kod yozishda birinchi nimaga qarash, keyin qaysi amalni bajarish — barchasi kichik-kichik qadamlarga bo'lib beriladi.",
    },
    {
      index: '03',
      title: "Sinov testi orqali bo'shliqlarni yopish",
      body: "Dars tugagach, 5 ta oddiy savol orqali nimani tushunganingiz tekshiriladi. Xato chiqsa, Ustoz AI aynan o'sha joyini boshqacha usulda qayta o'rgatadi.",
    },
  ];

  return (
    <section
      id="methodology"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-[#1B2D5C]"
    >
      <div className="max-w-2xl mb-8">
        <p className="text-xs font-medium text-sky-400 mb-2">O&apos;qitish usuli</p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
          Ustoz AI sizga qanday qilib osonroq o&apos;rgatadi?
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pillars.map((pillar) => (
          <div
            key={pillar.index}
            className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6 flex flex-col justify-between"
          >
            <div>
              <span className="font-mono text-sm font-semibold text-sky-400 tabular-nums">
                {pillar.index}.
              </span>
              <h3 className="mt-2 font-display text-lg font-semibold text-white">
                {pillar.title}
              </h3>
              <p className="mt-2.5 text-sm text-slate-300 leading-relaxed">{pillar.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
