---
every_min: 15
paused: false
quiet:
  from: 00:00
  to: 09:00
max_open: 2
via: both
levels:
  top:
    via: both
    first_after: 15m
    first_times: 2
    second_after: 90m
    second_times: 2
    stop: true
    stop_text: true
  normal:
    via: desk
    first_after: 120m
    first_times: 2
    second_after: 1d
    second_times: 2
    stop: true
    stop_text: false
  low:
    via: desk
    first_after: 1d
    first_times: 2
    second_after: 1w
    second_times: 2
    stop: true
    stop_text: false
---

How Omnii behaves. Change a value here or on the Config page and Omnii follows it on its next look. Omnii never edits this file.

every_min: how often Omnii looks.
quiet: Omnii doesn't text between these hours. Nothing is nudged or filed until they end.
via: where questions may reach you at all: desk, phone or both.
max_open: how many questions may be out to you at once.
levels: for each priority, what happens when you don't answer.
  via: where that priority's questions go. It can narrow the overall via, never widen it.
  first_after / first_times: the quick nudges.
  second_after / second_times: the slower nudges that follow.
  stop: true files the question as unanswered after the slower nudges; false keeps nudging at the slower pace.
  stop_text: true also texts you that it was filed; false only writes it in the log.
