alter table public.profiles
  add column if not exists account_type text not null default 'individual';

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check
  check (account_type in ('individual', 'teacher', 'student'));

create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  app_id text not null check (app_id in ('girih', 'bricks', 'muqarnas', 'mehraz')),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '',
  level text not null default 'Foundation' check (level in ('Foundation', 'Intermediate', 'Advanced')),
  estimated_minutes integer not null default 30 check (estimated_minutes between 5 and 600),
  lessons jsonb not null check (jsonb_typeof(lessons) = 'array'),
  assessment jsonb not null check (jsonb_typeof(assessment) = 'object'),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_students (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, student_id),
  check (teacher_id <> student_id)
);

create table if not exists public.training_assignments (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'submitted', 'completed', 'needs_revision')),
  completed_lessons jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_lessons) = 'array'),
  practical_submission jsonb,
  score integer check (score between 0 and 100),
  feedback text,
  due_at timestamptz,
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (module_id, teacher_id, student_id)
);

create index if not exists training_assignments_student_idx on public.training_assignments (student_id, updated_at desc);
create index if not exists training_assignments_teacher_idx on public.training_assignments (teacher_id, updated_at desc);

alter table public.training_modules enable row level security;
alter table public.teacher_students enable row level security;
alter table public.training_assignments enable row level security;
revoke all on public.training_modules, public.teacher_students, public.training_assignments from anon, authenticated;
grant select on public.training_modules to authenticated;
grant all on public.training_modules, public.teacher_students, public.training_assignments to service_role;

drop policy if exists "Authenticated users can read published training" on public.training_modules;
create policy "Authenticated users can read published training" on public.training_modules
  for select to authenticated using (is_published = true);

insert into public.training_modules (slug, app_id, title, description, level, estimated_minutes, lessons, assessment)
values
('girih-foundations', 'girih', 'Girih pattern foundations', 'Build a precise repeating pattern from historic geometric pieces.', 'Foundation', 45,
 '[{"title":"Meet the piece families","duration":6,"body":"Identify the available puzzle families and learn how their angles control compatible joins."},{"title":"Place and navigate","duration":8,"body":"Place a centre piece, orbit the stage, and use top view to inspect alignment."},{"title":"Snap a repeat","duration":12,"body":"Enable snapping and build one complete ring with matching edges."},{"title":"Refine and export","duration":9,"body":"Adjust colour, check the boundary, save the model, and make a preview export."}]'::jsonb,
 '{"title":"Build a complete rosette","brief":"Create a centred rosette with one complete repeated ring, at least two colours, and no visible gaps. Save the model in Girih App.","criteria":["Centred composition","Complete repeated ring","Clean snapped joins","Saved model reference"],"appUrl":"/app"}'::jsonb),
('bricks-foundations', 'bricks', 'Brick bond foundations', 'Create a repeatable wall bond with controlled colour and spacing.', 'Foundation', 40,
 '[{"title":"Choose a bond","duration":6,"body":"Compare common bond structures and select a suitable starting layout."},{"title":"Set the module","duration":8,"body":"Set brick dimensions, joint width, and the repeat boundary."},{"title":"Build the repeat","duration":12,"body":"Offset rows and verify that the repeat closes on every edge."},{"title":"Colour and save","duration":7,"body":"Apply a restrained palette, inspect the wall preview, and save the bond."}]'::jsonb,
 '{"title":"Build a repeatable wall panel","brief":"Create a minimum four-row bond with a valid horizontal repeat, consistent joints, and two material colours. Save the pattern in Bricks App.","criteria":["Four or more rows","Valid repeating boundary","Consistent joints","Saved pattern reference"],"appUrl":"https://bricks.girihstudio.com"}'::jsonb),
('muqarnas-foundations', 'muqarnas', 'Muqarnas assembly foundations', 'Understand cells and tiers by assembling a small spatial composition.', 'Foundation', 50,
 '[{"title":"Read a cell","duration":7,"body":"Identify cell faces, attachment edges, and vertical orientation."},{"title":"Start the first tier","duration":10,"body":"Place a stable base tier and check its radial spacing."},{"title":"Add a transition","duration":14,"body":"Add a second tier while maintaining clean connections between cells."},{"title":"Inspect in 3D","duration":8,"body":"Orbit around the assembly, check the underside, and save the design."}]'::jsonb,
 '{"title":"Assemble a two-tier bay","brief":"Build a balanced two-tier muqarnas bay with connected cells and a clear central transition. Save the assembly in Muqarnas App.","criteria":["Two distinct tiers","Connected cell edges","Balanced composition","Saved assembly reference"],"appUrl":"https://muqarnas.girihstudio.com"}'::jsonb),
('mehraz-foundations', 'mehraz', 'Mehraz spatial composition', 'Combine shared assets into a coherent architectural bay.', 'Foundation', 55,
 '[{"title":"Set the architectural frame","duration":8,"body":"Choose the bay proportions and establish the primary axes."},{"title":"Place shared assets","duration":12,"body":"Add version-pinned Girih, brick, or muqarnas assets from the shared library."},{"title":"Compose the elevation","duration":14,"body":"Align surfaces and control the hierarchy of the opening and ornament."},{"title":"Review the space","duration":9,"body":"Inspect the composition from elevation and perspective, then save it."}]'::jsonb,
 '{"title":"Compose an ornamental iwan bay","brief":"Create an iwan bay using at least two shared asset types, aligned to a clear architectural frame. Save the project in Mehraz App.","criteria":["Clear bay proportions","Two shared asset types","Aligned architectural surfaces","Saved project reference"],"appUrl":"https://mehraz.girihstudio.com"}'::jsonb)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description, lessons = excluded.lessons,
  assessment = excluded.assessment, estimated_minutes = excluded.estimated_minutes, updated_at = now();
