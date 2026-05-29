-- Per-book AI attribution budget (USD, estimated)
alter table books
  add column if not exists ai_budget_usd numeric(10, 2) default 500 not null,
  add column if not exists ai_spend_usd numeric(10, 4) default 0 not null;
