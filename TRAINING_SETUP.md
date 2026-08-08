# Girih Studio Academy setup

The Academy UI is available at `/training` after deployment.

## Database

Apply `supabase/migrations/202608060001_training_academy.sql` to the same Supabase project used by all Girih Studio apps. The migration:

- adds the independent `individual`, `teacher`, and `student` account types;
- creates the teacher roster, training module, and assignment tables;
- publishes starter modules for Girih, Bricks, Muqarnas, and Mehraz;
- enables row-level security and reserves roster/progress writes for the server API.

The deployment must provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the server functions. Student invitation emails use the Supabase Auth email template and configured site URL.

## First teacher

Sign in with an existing account, open `/training`, and choose **Continue as teacher**. Teachers can then invite students by name and email. Invited students receive the standard Supabase account invitation and enter Academy in student mode after signing in.

Subscription roles remain unchanged. A teacher or student can still independently have free or paid app access.
