'use client';

const weekdays = [
  { value: 1, short: 'Pzt', label: 'Pazartesi' },
  { value: 2, short: 'Sal', label: 'Salı' },
  { value: 3, short: 'Çar', label: 'Çarşamba' },
  { value: 4, short: 'Per', label: 'Perşembe' },
  { value: 5, short: 'Cum', label: 'Cuma' },
  { value: 6, short: 'Cmt', label: 'Cumartesi' },
  { value: 7, short: 'Paz', label: 'Pazar' },
] as const;

export const allPracticeWeekdays = weekdays.map((day) => day.value);

export function formatPracticeWeekdays(active: readonly number[]) {
  return weekdays
    .filter((day) => active.includes(day.value))
    .map((day) => day.label)
    .join(', ');
}

export function PracticeWeekdaySelector({
  value,
  onChange,
  disabled = false,
}: {
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
}) {
  function toggle(day: number) {
    const next = value.includes(day)
      ? value.filter((current) => current !== day)
      : [...value, day].sort((left, right) => left - right);
    if (next.length) onChange(next);
  }

  return (
    <fieldset className="practice-weekday-field" disabled={disabled}>
      <legend>Pratik günleri</legend>
      <div className="practice-weekday-heading">
        <span>Aktif günler</span>
        <div>
          <button type="button" onClick={() => onChange([...allPracticeWeekdays])}>
            Her gün
          </button>
          <button type="button" onClick={() => onChange([1, 2, 3, 4, 5])}>
            Hafta içi
          </button>
        </div>
      </div>
      <div className="practice-weekday-options">
        {weekdays.map((day) => (
          <label key={day.value} title={day.label}>
            <input
              type="checkbox"
              checked={value.includes(day.value)}
              onChange={() => toggle(day.value)}
            />
            <span>{day.short}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
