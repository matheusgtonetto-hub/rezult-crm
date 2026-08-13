// Ponte do frontend para a implementação canônica.
//
// O arquivo real mora em supabase/functions/_shared/ porque o Deno precisa
// alcançá-lo por caminho relativo no deploy das edge functions. O app importa
// daqui, por "@/lib/telefone", e ninguém precisa saber onde o arquivo dorme.
//
// Reexport puro, de propósito: no dia em que aparecer lógica só de frontend
// aqui dentro, volta a existir duas versões da mesma regra, que é exatamente o
// que este arquivo foi criado para acabar.
export type { TelefoneBruto } from "../../supabase/functions/_shared/telefone.ts";
export {
  somenteDigitos,
  normalizarTelefoneBr,
  telefonesIguais,
  variantesDeTelefone,
} from "../../supabase/functions/_shared/telefone.ts";
