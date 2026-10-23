---
defaults:
  remind_after: 90m
  end_of_day: 21:00
medicine:
  priority: top
  time: 09:00
chores:
  priority: low
  days:
    - sat
  time: 11:00
islands:
  getting-my-room-setup: normal
  getting-music-students: normal
  sharing-my-music-online: top
---

Priorities are yours. The loop reads them and never changes them.
top: it asks, comes back once after remind_after, archives the question at end_of_day.
normal: it asks once, archives after a day of silence.
low: it asks once, quietly, and archives after a day.
