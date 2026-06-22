// Fixed weekend slot generation (§4, §14.7). Returns the next N Sat/Sun slots.
export interface SlotOption {
  iso: string; // ISO datetime
  label: string;
}

export function nextWeekendSlots(from: Date = new Date(), count = 4): SlotOption[] {
  const slots: SlotOption[] = [];
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  let guard = 0;
  while (slots.length < count && guard < 60) {
    guard++;
    d.setDate(d.getDate() + 1);
    const day = d.getDay(); // 0 Sun, 6 Sat
    if (day === 0 || day === 6) {
      const dt = new Date(d);
      slots.push({
        iso: dt.toISOString(),
        label: dt.toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }
  }
  return slots;
}
