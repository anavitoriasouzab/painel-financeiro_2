/**
 * supabase-config.js
 * -----------------------------------------------------------------------
 * Configuração do cliente Supabase (só autenticação, por enquanto — os
 * dados financeiros continuam em localStorage via js/storage.js).
 *
 * A URL e a chave publicável abaixo NÃO são segredos: a publishable key
 * (sb_publishable_...) é feita para rodar no navegador, protegida pelas
 * políticas de RLS configuradas no banco (ver supabase/migrations/).
 */
const SUPABASE_URL = 'https://bgconighgmkibezllirw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_x0dfyhiRraOozLYxVHABrw_8p9CZen7';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
