import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";

/**
 * Nome que assina as mensagens enviadas por uma pessoa.
 *
 * Existe como hook, e não como três linhas copiadas em cada tela, porque já
 * divergiu na prática: o Multiatendimento passou a usar o nome do perfil e o
 * chat flutuante continuou gravando o começo do e-mail. O resultado ficou
 * visível na mesma conversa, uma bolha embaixo da outra, com "deolisamantha" em
 * cima de "Samantha de Oliveira" e sem a foto.
 *
 * A foto do perfil só aparece na bolha quando o nome gravado bate com este
 * valor, então gravar diferente não erra só o texto: apaga o avatar junto.
 *
 * Ordem de precedência:
 *   1. nome do perfil (Configurações → Perfil), que é nome de pessoa
 *   2. começo do e-mail, que é identificador de login e serve só de emergência
 *   3. "Você", para não deixar bolha sem assinatura nenhuma
 */
export function useNomeAtendente(): string {
  const { profile } = useProfile();
  const { user } = useAuth();
  return (profile?.full_name ?? "").trim()
    || user?.email?.split("@")[0]
    || "Você";
}
