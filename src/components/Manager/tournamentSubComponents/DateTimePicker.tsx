import React, { useState } from "react";

interface Props {
  value: string; // "YYYY-MM-DDTHH:MM" or ""
  onChange: (value: string) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function parseValue(value: string) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart) return null;
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart ? timePart.split(":").map(Number) : [9, 0];
  return { year: y, month: mo - 1, day: d, hour: h, minute: mi }; // month 0-indexed internally
}

function formatDisplay(value: string): string {
  const p = parseValue(value);
  if (!p) return "";
  return `${MONTHS[p.month]} ${p.day}, ${p.year} at ${pad(p.hour)}:${pad(p.minute)}`;
}

const DateTimePicker: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const now = new Date();

  // committed draft (set/confirmed)
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [day, setDay] = useState(now.getDate());
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  // the month currently being viewed in the calendar (may differ from selected)
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const openModal = () => {
    const p = parseValue(value);
    const init = p ?? {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: 9,
      minute: 0,
    };
    setYear(init.year);
    setMonth(init.month);
    setDay(init.day);
    setHour(init.hour);
    setMinute(init.minute);
    setViewYear(init.year);
    setViewMonth(init.month);
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(`${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`);
    setOpen(false);
  };

  const handleCancel = () => setOpen(false);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const selectDay = (d: number) => {
    setDay(d);
    setYear(viewYear);
    setMonth(viewMonth);
  };

  const stepHour = (delta: number) => setHour((h) => (h + delta + 24) % 24);
  const stepMinute = (delta: number) => setMinute((m) => (m + delta + 60) % 60);

  // build calendar cells
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const isSelected = (d: number) =>
    d === day && viewMonth === month && viewYear === year;
  const isToday = (d: number) =>
    d === now.getDate() &&
    viewMonth === now.getMonth() &&
    viewYear === now.getFullYear();

  return (
    <>
      <style>{`
        .dtp-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .dtp-modal {
          background: #fff; color: #1f2937; border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.25);
          padding: 18px; width: fit-content; font-family: inherit;
        }
        .dtp-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px;
        }
        .dtp-header-title { font-weight: 600; font-size: 15px; }
        .dtp-nav {
          border: none; background: transparent; cursor: pointer;
          font-size: 18px; line-height: 1; padding: 4px 10px; border-radius: 8px;
          color: #374151; transition: background 0.15s;
        }
        .dtp-nav:hover { background: #f3f4f6; }
        .dtp-grid {
          display: grid; grid-template-columns: repeat(7, 36px); gap: 2px;
        }
        .dtp-weekday {
          text-align: center; font-size: 11px; color: #9ca3af;
          padding: 4px 0; font-weight: 600;
        }
        .dtp-day {
          width: 36px; height: 36px; border: none; background: transparent; cursor: pointer;
          border-radius: 50%; font-size: 13px; color: #374151;
          transition: background 0.12s, color 0.12s;
          display: flex; align-items: center; justify-content: center;
        }
        .dtp-day:hover { background: #eef2ff; }
        .dtp-day.is-today { font-weight: 700; color: #3b82f6; }
        .dtp-day.is-selected {
          background: #3b82f6; color: #fff; font-weight: 600;
        }
        .dtp-day.is-selected:hover { background: #2563eb; }
        .dtp-day.empty { cursor: default; }
        .dtp-time {
          display: flex; align-items: center; justify-content: center;
          gap: 6px; margin: 16px 0 4px;
        }
        .dtp-stepper { display: flex; flex-direction: column; }
        .dtp-step-btn {
          border: 1px solid #e5e7eb; background: #fff; cursor: pointer;
          width: 32px; height: 18px; line-height: 1; font-size: 10px;
          color: #6b7280; transition: background 0.12s;
        }
        .dtp-step-btn:first-child { border-radius: 6px 6px 0 0; }
        .dtp-step-btn:last-child { border-radius: 0 0 6px 6px; border-top: none; }
        .dtp-step-btn:hover { background: #f3f4f6; }
        .dtp-time-val {
          font-size: 22px; font-variant-numeric: tabular-nums;
          font-weight: 600; min-width: 34px; text-align: center;
        }
        .dtp-time-colon { font-size: 22px; font-weight: 600; }
        .dtp-actions {
          display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;
        }
        .dtp-btn {
          border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer;
          font-size: 13px; font-weight: 600; transition: background 0.15s;
        }
        .dtp-btn-cancel { background: #f3f4f6; color: #374151; }
        .dtp-btn-cancel:hover { background: #e5e7eb; }
        .dtp-btn-confirm { background: #3b82f6; color: #fff; }
        .dtp-btn-confirm:hover { background: #2563eb; }
        .dtp-trigger {
          cursor: pointer; padding: 6px 12px; text-align: left;
        }
      `}</style>

      <button type="button" className="dtp-trigger datetime-trigger" onClick={openModal}>
        {value ? formatDisplay(value) : "Select date & time…"}
      </button>

      {open && (
        <div className="dtp-overlay" onClick={handleCancel}>
          <div className="dtp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dtp-header">
              <button type="button" className="dtp-nav" onClick={prevMonth} aria-label="Previous month">‹</button>
              <span className="dtp-header-title">{MONTHS[viewMonth]} {viewYear}</span>
              <button type="button" className="dtp-nav" onClick={nextMonth} aria-label="Next month">›</button>
            </div>

            <div className="dtp-grid">
              {WEEKDAYS.map((w) => (
                <div key={w} className="dtp-weekday">{w}</div>
              ))}
              {cells.map((d, i) =>
                d === null ? (
                  <span key={`e-${i}`} className="dtp-day empty" />
                ) : (
                  <button
                    type="button"
                    key={d}
                    className={
                      "dtp-day" +
                      (isSelected(d) ? " is-selected" : "") +
                      (isToday(d) && !isSelected(d) ? " is-today" : "")
                    }
                    onClick={() => selectDay(d)}
                  >
                    {d}
                  </button>
                )
              )}
            </div>

            <div className="dtp-time">
              <div className="dtp-stepper">
                <button type="button" className="dtp-step-btn" onClick={() => stepHour(1)}>▲</button>
                <button type="button" className="dtp-step-btn" onClick={() => stepHour(-1)}>▼</button>
              </div>
              <span className="dtp-time-val">{pad(hour)}</span>
              <span className="dtp-time-colon">:</span>
              <span className="dtp-time-val">{pad(minute)}</span>
              <div className="dtp-stepper">
                <button type="button" className="dtp-step-btn" onClick={() => stepMinute(5)}>▲</button>
                <button type="button" className="dtp-step-btn" onClick={() => stepMinute(-5)}>▼</button>
              </div>
            </div>

            <div className="dtp-actions">
              <button type="button" className="dtp-btn dtp-btn-cancel" onClick={handleCancel}>Cancel</button>
              <button type="button" className="dtp-btn dtp-btn-confirm" onClick={handleConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DateTimePicker;