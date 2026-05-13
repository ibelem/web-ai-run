-- Bootstrap: Setting the first admin user
-- Run these in Supabase SQL editor:
--
--   UPDATE public.profiles SET role = 'admin' WHERE id = '<your-user-id>';
--   UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE id = '<your-user-id>';
--
-- Then sign out and back in to refresh the JWT with the new role claim.
-- After that, use the /admin/users page to manage other users' roles.

-- No schema changes in this migration.
