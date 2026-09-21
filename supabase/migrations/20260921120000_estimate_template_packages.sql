-- Good / Better / Best packages on company estimate templates.
-- Same model as estimates: package_mode = 'gbb', selected_package, line.package.
-- Shared work stays on package = '' and is in every option.

alter table public.estimate_templates
  add column if not exists package_mode text not null default '';

alter table public.estimate_templates
  add column if not exists selected_package text not null default 'better';

alter table public.estimate_template_lines
  add column if not exists package text not null default '';

alter table public.estimate_templates drop constraint if exists estimate_templates_package_mode_check;
alter table public.estimate_templates
  add constraint estimate_templates_package_mode_check
  check (package_mode in ('', 'gbb'));

notify pgrst, 'reload schema';
