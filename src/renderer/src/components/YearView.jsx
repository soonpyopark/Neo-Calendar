import { useMemo } from 'react';
import { getWeekdayCellClass, getWeekdayTextClass } from '../lib/colors.js';
import { cn } from '../lib/cn.js';
import { getOrderedWeekdays, getWeekNumber, getYearMonthWeeks, isSameDay, toDateKey } from '../lib/calendarUtils.js';
import { DEFAULT_VIEW_OPTIONS, HOLIDAYS_KR_CALENDAR_ID } from '../../shared/constants.js';
import { shouldShowWeekNumbers, getWeekStartsOn } from '../lib/viewOptions.js';

function MiniMonth({
  year,
  monthIndex,
  selectedDate,
  viewOptions,
  holidayKeys,
  onSelectMonth,
  onSelectDate,
  onDayQuickEdit,
  interactive = true,
}) {
  const weekStartsOn = getWeekStartsOn(viewOptions);
  const showWeekNumbers = shouldShowWeekNumbers(viewOptions);
  const weekdays = getOrderedWeekdays(weekStartsOn);
  const weeks = getYearMonthWeeks(year, monthIndex, weekStartsOn);
  const today = new Date();

  return (
    <section className={cn('year-month', !showWeekNumbers && 'hide-week-numbers')}>
      <button
        type="button"
        className="year-month-title"
        onClick={() => onSelectMonth(monthIndex)}
      >
        {monthIndex + 1}월
      </button>

      <div className="year-month-body">
        <div className="year-month-weekdays">
          {showWeekNumbers && <div className="year-week-number-header" />}
          {weekdays.map((label, index) => (
            <div key={label} className={cn('year-weekday', getWeekdayTextClass((weekStartsOn + index) % 7))}>
              {label}
            </div>
          ))}
        </div>

        {showWeekNumbers && <div className="year-week-number-track" aria-hidden />}

        {weeks.map((week, weekIndex) => {
          const weekStart = week[0].date;
          return (
            <div
              key={weekStart.toISOString()}
              className="year-month-week"
              style={{ gridRow: weekIndex + 2 }}
            >
              {showWeekNumbers && <div className="year-week-number">{getWeekNumber(weekStart)}</div>}
              {week.map(({ date, inMonth }) => {
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate);
                const weekdayClass = getWeekdayCellClass(date.getDay());
                const isKrHoliday = holidayKeys?.has(toDateKey(date));

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    disabled={!interactive}
                    className={cn(
                      'year-day',
                      weekdayClass,
                      isKrHoliday && 'holiday',
                      !inMonth && 'other-month',
                      isToday && 'today',
                      isSelected && !isToday && 'selected',
                      !interactive && 'year-day-readonly',
                    )}
                    onClick={interactive ? () => onSelectDate?.(date) : undefined}
                    onDoubleClick={interactive ? () => onDayQuickEdit?.(date) : undefined}
                    aria-label={`${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function YearView({
  viewDate,
  selectedDate,
  events = [],
  viewOptions = DEFAULT_VIEW_OPTIONS,
  onSelectMonth,
  onSelectDate,
  onDayQuickEdit,
  interactive = true,
}) {
  const year = viewDate.getFullYear();
  const holidayKeys = useMemo(() => {
    const keys = new Set();
    for (const event of events) {
      if (event?.calendarId !== HOLIDAYS_KR_CALENDAR_ID) continue;
      const start = event.occurrenceDate || event.startDate;
      const end = event.endDate || start;
      if (!start) continue;
      // Single-day holidays are the common case; still cover short multi-day spans.
      if (!end || end === start) {
        if (String(start).startsWith(String(year))) keys.add(start);
        continue;
      }
      const from = new Date(`${start}T00:00:00`);
      const to = new Date(`${end}T00:00:00`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        if (String(start).startsWith(String(year))) keys.add(start);
        continue;
      }
      for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
        if (cursor.getFullYear() === year) keys.add(toDateKey(cursor));
      }
    }
    return keys;
  }, [events, year]);

  return (
    <div className="year-view">
      <div className="year-grid">
        {Array.from({ length: 12 }, (_, monthIndex) => (
          <MiniMonth
            key={monthIndex}
            year={year}
            monthIndex={monthIndex}
            selectedDate={selectedDate}
            viewOptions={viewOptions}
            holidayKeys={holidayKeys}
            onSelectMonth={onSelectMonth}
            onSelectDate={onSelectDate}
            onDayQuickEdit={onDayQuickEdit}
            interactive={interactive}
          />
        ))}
      </div>
    </div>
  );
}
