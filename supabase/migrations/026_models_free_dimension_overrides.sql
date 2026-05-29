alter table public.models
  add column if not exists free_dimension_overrides jsonb;

comment on column public.models.free_dimension_overrides is
  'ONNX Runtime freeDimensionOverrides map, e.g. {"batch_size":1,"height":224,"width":224}';
