// Ponte do frontend, mesmo arranjo de src/lib/telefone.ts e src/lib/conversas.ts.
// O arquivo real mora em supabase/functions/_shared porque as edge functions
// precisam alcançá-lo por caminho relativo no deploy, e as duas telas de chat
// enviam mensagem direto do navegador.
export {
  extrairIdDaResposta,
  descreverResposta,
} from "../../supabase/functions/_shared/resposta-envio.ts";
