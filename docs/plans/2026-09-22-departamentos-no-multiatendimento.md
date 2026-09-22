# Departamentos no Multiatendimento

Data: 22/09/2026. Pedido do dono: dividir o Multiatendimento em departamentos,
com o número escolhendo o departamento e a conversa podendo ser transferida.

## O ponto de partida

O recurso existia pela metade e ninguém usava:

| Peça | Estado em 22/09 |
|---|---|
| Tabela `departments` | pronta, com tela de cadastro |
| `whatsapp_conversations.department_id` | coluna existia, **0 de 222** preenchidas |
| Transferir em massa | funcionava, escondido no menu da lista |
| Filtro por departamento | só dentro do painel avançado |
| Vincular número a departamento | não existia |
| Ação e condição de departamento nas automações | a tela oferecia, o motor ignorava |

Treze empresas, dois departamentos criados no total. O que manteve a tela vazia
foi pedir que cada um inventasse a própria divisão antes de ver para que serve.

## As três entregas

### Onda 1 — os chips

Cinco viraram quatro, e três deles descreviam o mesmo estado (conversa aberta)
em momentos diferentes. `Todos | Não lidas | Em aberto | Finalizadas`.

O corte passou a ser por LEITURA, e não por "já respondemos alguma vez":
`answered` é um dado que o atendente não vê no card, `read` é o pontinho que ele
já enxerga. O primeiro contato virou a etiqueta "1º contato", que aparece em
qualquer filtro -- inclusive depois de alguém abrir a conversa sem responder,
que é justamente quando ela sairia do radar.

### Onda 2 — o departamento visível

Seletor acima dos chips, transferência na conversa aberta e etiqueta colorida no
card. Tudo aparece só com DOIS ou mais departamentos: com um só não há escolha a
fazer, e seriam controles para quem não divide a operação ignorar.

As contagens dos chips passaram a contar dentro do departamento escolhido. Se
contassem a empresa inteira, o atendente do Suporte veria "Não lidas 12",
abriria e acharia 3 -- e é esse número que ele usa para decidir se tem trabalho.

### Onda 3 — os padrões e o roteamento

Três departamentos em toda conta: **Comercial, Suporte e Sucesso do Cliente**
(nasceram como "Time Comercial" e "Suporte Técnico" e foram renomeados no mesmo
dia). Criados por gatilho no cadastro da empresa, no molde de
`criar_tags_padrao`: idempotentes pelo nome e sem nunca derrubar o cadastro.

O número ganhou `department_id` e um dropdown no cartão da conexão. O roteamento
vive no BANCO, num gatilho antes do insert da conversa:

```
1. departamento do número que recebeu
2. senão, o padrão da empresa (Configurações)
3. senão, o primeiro departamento da lista
```

No banco porque conversa nasce por seis caminhos: três webhooks de WhatsApp, a
automação, o agente e a tela. Seis cópias da cascata divergem na primeira
correção, e cinco exigiriam deploy para mudar uma regra de negócio.

O passo 3 começou procurando o departamento chamado "Time Comercial" e a própria
renomeação mostrou o defeito: bastou querer outro nome para a regra apontar para
o vazio, e o cliente renomeia pela tela quando quiser.

As 222 conversas existentes foram para o Comercial.

## Departamento e responsável, lado a lado

O seletor de responsável saiu do painel da direita e foi para o cabeçalho, ao
lado do departamento: os dois respondem a mesma pergunta, quem cuida disto.

**Transferir de departamento não mexe no responsável.** O responsável é do
NEGÓCIO, não da conversa (`handleTransfer` grava em `leads.responsibles` e
espelha nas conversas daquele negócio). Limpar na transferência apagaria o dono
da venda no funil e no painel por responsável. Obrigar a escolher na hora trava
a transferência: quem transfere raramente sabe quem do outro time está livre.

Em vez disso, quando o responsável atual não pertence ao departamento, o botão
mostra um ponto âmbar. O sistema avisa em vez de decidir.

## Dois defeitos de vínculo por nome

**1. Departamento por `owner_id`.** A lista era filtrada pelo dono, e o insert
sempre gravou `company_id` também: quem tem duas empresas via as duas listas
somadas e podia vincular um número à divisão da outra. Há um caso desses na
base. Passou a filtrar por empresa.

**2. Atendente do departamento por NOME.** `departments.attendants` guarda
nomes, então quem se renomeia em Meu Perfil sai do departamento sem nada avisar.
Não era hipótese: o departamento "Marketing" da Geomar Junior apontava para
"Geomar", e o membro hoje se chama "Geomar Junior" -- quebrado em silêncio desde
a renomeação.

Corrigido com `attendant_ids`, no mesmo molde do `assigned_to_user_id` do
responsável: o id é o vínculo, o nome é o espelho que a tela lê. O gerenciador
grava os dois e, ao editar, marca quem está pelo id -- assim quem se renomeou
continua marcado e salvar conserta o nome sozinho.

### Correção de dado (22/09)

O backfill por nome exato não resolveu o caso do "Geomar", porque o nome não
existe mais. O dono pediu a correção pelo banco, por não ter acesso à conta.

A empresa tem UM membro, o próprio dono (`geomarjrr@gmail.com`), então não havia
a quem mais o registro pudesse se referir. Gravados o id e o nome atual.
Varredura posterior: nenhum outro departamento com nome sem id correspondente.

## Verificação

| O quê | Resultado |
|---|---|
| Departamentos | 13 empresas com Comercial, Suporte e Sucesso do Cliente |
| Conversas | 222 no Comercial, nenhuma cruzando empresa |
| Roteamento, número sem departamento | caiu no Comercial |
| Roteamento, número vinculado ao Suporte | nasceu no Suporte |
| Roteamento, conversa já com departamento | manteve o dela |
| Roteamento, empresa sem padrão | caiu no primeiro da lista |
| Órfãos | nenhuma conversa ou número apontando para departamento inexistente |
| Portas | typecheck limpo, 31 testes, lint sem erro novo |

Os ensaios criaram conversas e um vínculo de número temporários, todos desfeitos
em seguida.

## O que fica em aberto

**A visibilidade por atendente.** Está decidido que cada um veja só os seus
departamentos, e agora há vínculo por id para sustentar isso. Não entrou junto
porque ligar o isolamento antes de as conversas terem departamento esvaziaria a
tela de todo mundo -- hoje elas já têm, então o caminho está livre.

**As duas peças de automação.** "Transferir departamento da conversa" e
"Conversa em departamento" seguem oferecidas na tela e ignoradas pelo motor. O
gatilho "Departamento alterado" funciona.

**As chaves mortas.** "Manter atendente na conversa" e "Manter departamento na
conversa", em Configurações, gravam em `multiatendimento_settings` e nada as lê.
