'use client';

import { useId, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Select from '@radix-ui/react-select';
import { DayPicker } from 'react-day-picker';
import { zhTW } from 'react-day-picker/locale/zh-TW';
import { CalendarDays, Check, ChevronDown, ChevronUp, Clock3 } from 'lucide-react';
import 'react-day-picker/style.css';
import styles from './HistoryTimePicker.module.css';

type Option = { value: string; label: string; disabled?: boolean };

function PickerSelect({ value, onChange, options, label, id, icon }: {
  value: string; onChange: (value: string) => void; options: Option[];
  label: string; id?: string; icon?: React.ReactNode;
}) {
  return <Select.Root value={value} onValueChange={onChange} disabled={!options.length}>
    <Select.Trigger id={id} type="button" className={styles.trigger} aria-label={label}>
      {icon}<Select.Value placeholder="尚無資料" /><Select.Icon className={styles.chevron}><ChevronDown size={14} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className={styles.options} position="popper" sideOffset={6} collisionPadding={12}>
        <Select.ScrollUpButton className={styles.scrollButton}><ChevronUp size={14} /></Select.ScrollUpButton>
        <Select.Viewport className={styles.viewport}>
          {options.map(option => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className={styles.option}>
            <Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator className={styles.check}><Check size={14} /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
        <Select.ScrollDownButton className={styles.scrollButton}><ChevronDown size={14} /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export default function HistoryTimePicker({ date, hour, dates, hours, onDateChange, onHourChange }: {
  date: string; hour: string; dates: string[]; hours: string[];
  onDateChange: (date: string) => void; onHourChange: (hour: string) => void;
}) {
  const dateId = useId();
  const hourId = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => date ? localDate(date) : new Date());
  const available = useMemo(() => new Set(dates), [dates]);
  const first = dates.length ? localDate(dates[0]) : undefined;
  const last = dates.length ? localDate(dates[dates.length - 1]) : undefined;
  const years = first && last ? Array.from({ length: last.getFullYear() - first.getFullYear() + 1 }, (_, index) => {
    const year = first.getFullYear() + index;
    return { value: String(year), label: `${year} 年` };
  }) : [];
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index), label: `${index + 1} 月`,
    disabled: !!first && !!last && (new Date(month.getFullYear(), index + 1, 0) < first || new Date(month.getFullYear(), index, 1) > last),
  }));
  function changeMonth(year: number, monthIndex: number) {
    let candidate = new Date(year, monthIndex, 1);
    if (first && candidate < new Date(first.getFullYear(), first.getMonth(), 1)) candidate = first;
    if (last && candidate > last) candidate = last;
    setMonth(candidate);
  }
  return <>
    <div className={styles.field}>
      <label htmlFor={dateId}>日期</label>
      <Popover.Root open={open} onOpenChange={next => {
        setOpen(next);
        if (next && date) setMonth(localDate(date));
      }}>
        <Popover.Trigger asChild>
          <button id={dateId} type="button" className={styles.trigger} disabled={!dates.length} aria-label="選擇歷史日期">
            <CalendarDays size={15} /><span>{date ? date.replaceAll('-', ' / ') : '選擇日期'}</span><ChevronDown size={14} className={styles.chevron} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className={styles.calendarPanel} align="start" sideOffset={8} collisionPadding={12} aria-label="歷史日期日曆">
            <div className={styles.monthControls}>
              <PickerSelect value={String(month.getFullYear())} options={years} label="年份" onChange={year => changeMonth(Number(year), month.getMonth())} />
              <PickerSelect value={String(month.getMonth())} options={months} label="月份" onChange={value => changeMonth(month.getFullYear(), Number(value))} />
            </div>
            <DayPicker mode="single" required selected={date ? localDate(date) : undefined}
              month={month} onMonthChange={setMonth} startMonth={first} endMonth={last}
              locale={zhTW} autoFocus hideNavigation showOutsideDays
              disabled={value => !available.has(dateKey(value))} className={styles.calendar}
              onSelect={value => { if (value) { onDateChange(dateKey(value)); setOpen(false); } }} />
            <p className={styles.calendarHint}>僅可選擇有歷史資料的日期</p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
    <div className={styles.field}>
      <label htmlFor={hourId}>時間</label>
      <PickerSelect id={hourId} value={hour} options={hours.map(value => ({ value, label: value }))}
        label="選擇歷史小時" onChange={onHourChange} icon={<Clock3 size={15} />} />
    </div>
  </>;
}
