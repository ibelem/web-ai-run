-- Add organization and job_title fields to profiles
alter table public.profiles add column organization text;
alter table public.profiles add column job_title text;
