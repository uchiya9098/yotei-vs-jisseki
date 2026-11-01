"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-1", className)}
      classNames={{
        months: "flex flex-col",
        month: "space-y-3",
        caption: "flex justify-center items-center relative px-8",
        caption_label: "text-sm font-semibold text-ink",
        nav: "flex items-center gap-1",
        nav_button:
          "h-6 w-6 flex items-center justify-center rounded-full text-ink/50 hover:bg-paper transition absolute",
        nav_button_previous: "left-0",
        nav_button_next: "right-0",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "text-ink/40 w-8 font-normal text-[11px]",
        row: "flex w-full mt-1",
        cell: "text-center text-sm relative p-0",
        day: "h-8 w-8 rounded-full text-sm font-normal text-ink hover:bg-paper transition",
        day_selected: "bg-plan text-white hover:bg-plan hover:text-white",
        day_today: "border border-plan/60 font-semibold",
        day_outside: "text-ink/25",
        day_disabled: "text-ink/20",
        ...classNames
      }}
      components={{
        IconLeft: () => <ChevronLeft size={14} />,
        IconRight: () => <ChevronRight size={14} />
      }}
      {...props}
    />
  );
}

export { Calendar };
