---
every_min: 15
paused: true
quiet:
  from: 00:00
  to: 09:00
max_open: 2
ask:
  text: true
levels:
  top:
    remind_after: 90m
    end_of_day: 21:00
    text: true
  normal:
    file_after: 1d
    text: true
  low:
    file_after: 1d
    text: false
---

How Omnii behaves. Change a number here or on the "What Omnii does" page and Omnii follows it on its next look. Omnii never edits this file.

every_min: how often Omnii looks. quiet: Omnii doesn't text between these hours; questions wait for the morning.
max_open: how many questions Omnii may have out to you at once. ask.text: whether a new question is also texted.
levels: what happens when you don't answer, by priority. remind_after / end_of_day for top; file_after for the others; text = whether that level texts at all.
