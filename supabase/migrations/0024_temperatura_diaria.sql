-- Temperatura diaria por celda: lo que importa para detectar heladas y picos
-- de calor es el día a día de la campaña en curso, no el promedio histórico.
alter table clima_dia
  add column if not exists t_min numeric,
  add column if not exists t_med numeric,
  add column if not exists t_max numeric;
