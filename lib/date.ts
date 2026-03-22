const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayKey(timestamp: string): string {
  return timestamp.slice(0, 10);
}

export function hourKey(timestamp: string): number {
  return Number(timestamp.slice(11, 13));
}

export function timeKey(timestamp: string): string {
  return timestamp.slice(11, 19);
}

export function weekdayIndex(dateValue: string): number {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekdayLabel(index: number): string {
  return WEEKDAY_LABELS[index];
}

export function enumerateDates(from: string, to: string): string[] {
  const [startYear, startMonth, startDay] = from.split("-").map(Number);
  const [endYear, endMonth, endDay] = to.split("-").map(Number);
  const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const output: string[] = [];

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    output.push(cursor.toISOString().slice(0, 10));
  }

  return output;
}

export function formatDateLabel(dateValue: string): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatIsoTimestamp(timestamp: string): string {
  const [dateValue, timeValue] = timestamp.split("T");
  const [year, month, day] = dateValue.split("-").map(Number);
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))} ${timeValue.slice(0, 5)}`;
}

export function formatCoverageRange(start: string, end: string): string {
  return `${formatIsoTimestamp(start)} to ${formatIsoTimestamp(end)}`;
}

export function timeToDecimal(timeValue: string | null): number | null {
  if (!timeValue) {
    return null;
  }

  const [hours, minutes] = timeValue.slice(11, 16).split(":").map(Number);
  return Number((hours + minutes / 60).toFixed(2));
}

export function formatHourValue(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
