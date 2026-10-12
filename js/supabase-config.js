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

// Sem a biblioteca (offline e ainda sem cópia guardada pelo service worker),
// window.supabase não existe: em vez de quebrar aqui e deixar o app em
// branco, fica null e app.js mostra o aviso de "sem internet".
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

/** Chave em que o supabase-js guarda a sessão no localStorage (padrão dele:
    "sb-<ref do projeto>-auth-token"). Usada só pra seguir logada offline,
    quando o token venceu e não dá pra renovar sem rede (ver requireAuth). */
const SUPABASE_AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
