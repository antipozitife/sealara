import "./medical-notice.css";

export function MedicalNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`medical-notice${compact ? " medical-notice--compact" : ""}`} aria-label="Важно">
      <strong>Только справочная информация</strong>
      <span>
        Sealara — учебный демонстратор. Сервис не оказывает медицинские услуги, не устанавливает диагноз, не
        оценивает срочность состояния и не назначает лечение. Автоматический результат может быть неполным или
        ошибочным. По вопросам здоровья обратитесь к врачу.
      </span>
      <span>
        При резком ухудшении самочувствия или угрозе жизни не используйте сервис — звоните{" "}
        <a href="tel:112">112</a> или <a href="tel:103">103</a>.
      </span>
    </aside>
  );
}
