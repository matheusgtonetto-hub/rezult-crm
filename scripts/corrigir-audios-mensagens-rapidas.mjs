/**
 * Conserta as mensagens rápidas de áudio salvas com o formato errado.
 *
 * ─── O que aconteceu ────────────────────────────────────────────────────────
 *
 * Até 07/10/2026, todo áudio de mensagem rápida era salvo como
 * `audio-<timestamp>.ogg` com content-type `audio/ogg`, inclusive quando a
 * pessoa escolhia um mp3 do computador: o nome e o cabeçalho diziam ogg, os
 * bytes eram outra coisa. E a duração ia como zero, porque arquivo escolhido
 * não passa pelo cronômetro da gravação, então a lista mostrava 00:00 em todos.
 *
 * O envio já foi corrigido na aplicação (passa a URL para a Z-API em vez de
 * base64 truncado), e o salvamento também (guarda extensão, mime e duração
 * reais). Este script existe só para as linhas que já estavam gravadas.
 *
 * ─── O que ele faz ──────────────────────────────────────────────────────────
 *
 * 1. Baixa cada mensagem rápida de áudio pela URL pública.
 * 2. Descobre o formato real pela assinatura dos primeiros bytes.
 * 3. Mede a duração: exata em Ogg (granule da última página), por cabeçalho
 *    Xing ou bitrate em MP3.
 * 4. Quando o formato real difere do gravado, sobe uma cópia com a extensão e
 *    o content-type certos e aponta a linha para ela.
 * 5. Atualiza media_nome, media_mime e media_duracao.
 *
 * O arquivo antigo NÃO é apagado. Uma mensagem de áudio já enviada no chat
 * guarda no histórico a MESMA url da mensagem rápida (o envio reaproveita o
 * arquivo em vez de subir outro), e apagar o objeto deixaria aquele balão sem
 * áudio. O script conta quanto espaço ficou para trás e lista as urls órfãs
 * ao final, para serem apagadas à mão se valer a pena.
 *
 * ─── Como rodar ─────────────────────────────────────────────────────────────
 *
 *   export SUPABASE_URL=https://<ref>.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=<service role>
 *   node scripts/corrigir-audios-mensagens-rapidas.mjs            # só relata
 *   node scripts/corrigir-audios-mensagens-rapidas.mjs --aplicar  # grava
 *
 * Sem `--aplicar` ele não escreve nada: imprime o que faria, linha a linha.
 * A chave de service role é obrigatória porque o bucket só aceita escrita do
 * dono da pasta, e aqui estamos mexendo na pasta de outra pessoa.
 */

import { createClient } from "@supabase/supabase-js";

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APLICAR = process.argv.includes("--aplicar");

if (!URL_BASE || !CHAVE) {
  console.error("Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

const BUCKET = "automation-media";
const supabase = createClient(URL_BASE, CHAVE, { auth: { persistSession: false } });

/* ── formato real, pela assinatura ────────────────────────────────────────── */

const texto = (b, i, n) => Buffer.from(b.subarray(i, i + n)).toString("latin1");

/** Devolve { mime, ext } do conteúdo, ou null quando não reconhece. */
function formatoReal(b) {
  if (b.length < 12) return null;
  if (texto(b, 0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (texto(b, 0, 4) === "fLaC") return { mime: "audio/flac", ext: "flac" };
  if (texto(b, 0, 4) === "RIFF" && texto(b, 8, 4) === "WAVE") return { mime: "audio/wav", ext: "wav" };
  if (texto(b, 4, 4) === "ftyp") return { mime: "audio/mp4", ext: "m4a" };
  if (texto(b, 0, 5) === "#!AMR") return { mime: "audio/amr", ext: "amr" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: "audio/webm", ext: "webm" };
  // ID3 é a etiqueta de metadados que quase todo mp3 carrega na frente; sem
  // ela, o arquivo começa direto no sync word do primeiro quadro (11 bits em 1).
  if (texto(b, 0, 3) === "ID3") return { mime: "audio/mpeg", ext: "mp3" };
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return { mime: "audio/mpeg", ext: "mp3" };
  return null;
}

/* ── duração ──────────────────────────────────────────────────────────────── */

/**
 * Duração de um Ogg, pela posição de granule da ÚLTIMA página.
 *
 * O granule de um fluxo Opus conta amostras a 48 kHz sempre, independente da
 * taxa original; em Vorbis ele conta na taxa do próprio fluxo, que vem no
 * cabeçalho de identificação da primeira página. É exato nos dois casos: é o
 * mesmo número que o tocador usa para saber onde termina.
 */
function duracaoOgg(b) {
  let ultima = -1;
  for (let i = b.length - 14; i >= 0; i--) {
    if (b[i] === 0x4f && b[i + 1] === 0x67 && b[i + 2] === 0x67 && b[i + 3] === 0x53) { ultima = i; break; }
  }
  if (ultima < 0) return 0;
  const granule = b.readBigUInt64LE(ultima + 6);
  if (granule <= 0n) return 0;

  const inicio = Buffer.from(b.subarray(0, Math.min(b.length, 4096))).toString("latin1");
  if (inicio.includes("OpusHead")) return Number(granule) / 48000;
  const v = inicio.indexOf("\x01vorbis");
  if (v >= 0 && b.length > v + 16) {
    const taxa = b.readUInt32LE(v + 12);
    if (taxa > 0) return Number(granule) / taxa;
  }
  return 0;
}

const TAXAS_MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const TAXAS_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const AMOSTRAGENS = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/**
 * Duração de um MP3.
 *
 * Primeiro procura o cabeçalho Xing/Info, que os codificadores de taxa
 * variável escrevem no primeiro quadro com a CONTAGEM de quadros: com ele a
 * conta é exata. Sem ele, assume taxa constante e divide o tamanho pelo
 * bitrate do primeiro quadro, que é o que todo tocador faz nesse caso.
 */
function duracaoMp3(b) {
  let i = 0;
  // Pula a etiqueta ID3v2: o tamanho vem em quatro bytes de 7 bits cada.
  if (texto(b, 0, 3) === "ID3" && b.length > 10) {
    i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  }
  for (; i < b.length - 4; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    const versao = (b[i + 1] >> 3) & 0x03;        // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const camada = (b[i + 1] >> 1) & 0x03;        // 1 = camada III
    const indiceTaxa = (b[i + 2] >> 4) & 0x0f;
    const indiceAmostragem = (b[i + 2] >> 2) & 0x03;
    if (camada !== 1 || indiceTaxa === 0 || indiceTaxa === 15 || indiceAmostragem === 3) continue;
    const amostragens = AMOSTRAGENS[versao];
    if (!amostragens) continue;
    const amostragem = amostragens[indiceAmostragem];
    const bitrate = (versao === 3 ? TAXAS_MPEG1 : TAXAS_MPEG2)[indiceTaxa] * 1000;
    if (!amostragem || !bitrate) continue;
    const amostrasPorQuadro = versao === 3 ? 1152 : 576;

    const trecho = Buffer.from(b.subarray(i, Math.min(b.length, i + 200))).toString("latin1");
    const xing = Math.max(trecho.indexOf("Xing"), trecho.indexOf("Info"));
    if (xing >= 0) {
      const base = i + xing;
      const flags = b.readUInt32BE(base + 4);
      if (flags & 0x01) {
        const quadros = b.readUInt32BE(base + 8);
        if (quadros > 0) return (quadros * amostrasPorQuadro) / amostragem;
      }
    }
    return ((b.length - i) * 8) / bitrate;
  }
  return 0;
}

function duracaoDe(b, mime) {
  try {
    if (mime === "audio/ogg") return duracaoOgg(b);
    if (mime === "audio/mpeg") return duracaoMp3(b);
  } catch (e) {
    console.warn(`  duração não lida: ${e.message}`);
  }
  return 0;
}

/* ── execução ─────────────────────────────────────────────────────────────── */

const caminhoNaUrl = url => {
  const marca = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  return i < 0 ? null : decodeURIComponent(url.slice(i + marca.length));
};

const { data: linhas, error } = await supabase
  .from("quick_messages")
  .select("id, title, owner_id, media_url, media_nome, media_mime, media_duracao")
  .eq("tipo", "audio")
  .order("created_at");
if (error) { console.error("Falha ao listar:", error.message); process.exit(1); }

console.log(`${linhas.length} mensagem(ns) rápida(s) de áudio.${APLICAR ? "" : "  [simulação: nada será gravado]"}\n`);

let corrigidas = 0, intactas = 0, falhas = 0, bytesOrfaos = 0;
const orfaos = [];

for (const linha of linhas) {
  const rotulo = `${linha.title} (${linha.id.slice(0, 8)})`;
  if (!linha.media_url) { console.log(`- ${rotulo}: sem arquivo, pulado`); falhas++; continue; }

  let bytes;
  try {
    const resposta = await fetch(linha.media_url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    bytes = Buffer.from(await resposta.arrayBuffer());
  } catch (e) {
    console.log(`- ${rotulo}: não baixou (${e.message})`);
    falhas++;
    continue;
  }

  const real = formatoReal(bytes);
  if (!real) { console.log(`- ${rotulo}: formato não reconhecido, deixado como está`); falhas++; continue; }

  const segundos = Math.round(duracaoDe(bytes, real.mime));
  const mimeErrado = real.mime !== linha.media_mime;
  const duracaoErrada = segundos > 0 && segundos !== linha.media_duracao;
  if (!mimeErrado && !duracaoErrada) { intactas++; continue; }

  const mudancas = [];
  if (mimeErrado) mudancas.push(`${linha.media_mime} -> ${real.mime}`);
  if (duracaoErrada) mudancas.push(`${linha.media_duracao}s -> ${segundos}s`);
  console.log(`- ${rotulo}: ${mudancas.join(", ")}`);

  const campos = { media_duracao: segundos > 0 ? segundos : linha.media_duracao };

  if (mimeErrado) {
    // Caminho novo em vez de sobrescrever o antigo: a extensão faz parte da
    // url, e deixar um mp3 servido em .ogg mantém o problema para qualquer
    // serviço que olhe o nome antes do conteúdo.
    const antigo = caminhoNaUrl(linha.media_url);
    const base = `audio-${Date.now()}-${linha.id.slice(0, 8)}.${real.ext}`;
    const novo = `${linha.owner_id}/mensagens-rapidas/${base}`;
    if (APLICAR) {
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET).upload(novo, bytes, { upsert: true, contentType: real.mime });
      if (erroUpload) { console.log(`  falha ao subir: ${erroUpload.message}`); falhas++; continue; }
    }
    campos.media_url = supabase.storage.from(BUCKET).getPublicUrl(novo).data.publicUrl;
    campos.media_nome = base;
    campos.media_mime = real.mime;
    if (antigo) { orfaos.push(antigo); bytesOrfaos += bytes.length; }
  }

  if (APLICAR) {
    const { error: erroUpdate } = await supabase.from("quick_messages").update(campos).eq("id", linha.id);
    if (erroUpdate) { console.log(`  falha ao atualizar: ${erroUpdate.message}`); falhas++; continue; }
  }
  corrigidas++;
}

console.log(`\n${corrigidas} corrigida(s), ${intactas} já estava(m) certa(s), ${falhas} não resolvida(s).`);
if (orfaos.length) {
  console.log(`\n${orfaos.length} arquivo(s) antigo(s) ficaram no bucket (${(bytesOrfaos / 1024 / 1024).toFixed(1)} MB).`);
  console.log("Só apague depois de conferir que nenhuma mensagem do histórico aponta para eles");
  console.log("(select id, media_url from whatsapp_messages where media_url like '%mensagens-rapidas%'):");
  for (const o of orfaos) console.log(`  ${o}`);
}
