-- La 0002 ya se aplicó sin security_invoker; esto lo corrige sin recrear la vista.
alter view public.lotes_mapa set (security_invoker = true);
