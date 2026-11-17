/* =================================================================
   ORCA SONORA - MOTOR COMPLETO DO PAINEL (painel.js corrigido)
================================================================== */

const ORCA_CONFIG = window.ORCA_CONFIG || {};

const SUPABASE_URL = ORCA_CONFIG.supabaseUrl || "https://<SEU-PROJETO>.supabase.co";
const SUPABASE_ANON_KEY = ORCA_CONFIG.supabaseAnonKey || "<PUBLIC-ANON-KEY-DO-SUPABASE>";
const supabaseClient = window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Configuração ElevenLabs
// IMPORTANTE: a chave da ElevenLabs NUNCA deve ficar no frontend.
// Passe via backend/Edge Function e mantenha a chave em variável de ambiente do servidor.
const ELEVENLABS_API_KEY = "";
const ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

// Duas Vozes Separadas
const ELEVENLABS_VOICE_VINHETA = "onwK4e9ZLuTAKqWW03F9"; // Voz 1: Grave e Marcante (Vinheta da Marca)
const ELEVENLABS_VOICE_ANUNCIO = "pNInz6obpgDQGcFmaJgB"; // Voz 2: Dinâmica e Comercial (Roteiros/Ofertas)

// Estado global do Player
let empresaAtual = null;
let playlist = [];
let anunciosAtivos = [];
let indiceMusica = 0;
let indiceAnuncio = 0;
let musicasTocadasDesdeUltimoSpot = 0;
let volumeUsuario = 0.85;
let emDucking = false;
let idAnuncioEditando = null;
let agendadorPorHorarioLock = new Set();

// Referências do DOM
const audioEl = document.getElementById("audio-player"); 
let roteiroJaDisparadoNestaFaixa = false;
let locutorOcupado = false; 

if (audioEl) {
    audioEl.addEventListener("timeupdate", () => {
        if (!audioEl.currentTime) return;
        const tempoAtualSegundos = Math.floor(audioEl.currentTime);

        if (tempoAtualSegundos < 5) {
            roteiroJaDisparadoNestaFaixa = false;
        }

        if (roteiroJaDisparadoNestaFaixa || locutorOcupado) return;

        const spotParaDisparar = anunciosAtivos.find(s => s.tipo_disparo === "tempo" && s.tempo_disparo === tempoAtualSegundos);

        if (spotParaDisparar) {
            roteiroJaDisparadoNestaFaixa = true; 
            falarComDucking(spotParaDisparar.roteiro_texto, spotParaDisparar.url_audio_ia);
        }
    });
}

const locutorEl = document.getElementById("locutor-player");
const btnPlayPause = document.getElementById("btn-play-pause");
const btnAnterior = document.getElementById("btn-anterior");
const btnProxima = document.getElementById("btn-proxima");
const controleVolume = document.getElementById("controle-volume");
const barraProgresso = document.getElementById("barra-progresso");
const tempoAtualEl = document.getElementById("tempo-atual");
const tempoTotalEl = document.getElementById("tempo-total");
const radioStatusEl = document.getElementById("radio-status");
const contadorSpotEl = document.getElementById("contador-spot");

const PLAYLIST_DEMONSTRACAO = [
    {
        titulo: "Lounge & Relaxamento no Salão",
        artista: "Orca Sonora Studio",
        capa: null,
        url_audio: "https://ice1.somafm.com/groovesalad-128-mp3"
    } 
];

function ensureSupabaseClient() {
    if (!supabaseClient) {
        throw new Error("Configuração do Supabase ausente. Configure window.ORCA_CONFIG no frontend ou mova essa lógica para um backend seguro.");
    }
    return supabaseClient;
}

/* =================================================================
   1. INICIALIZAÇÃO DO PAINEL E NAVEGAÇÃO DE ABAS
================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    iniciarOndasFundoPainel();
    configurarEventosPlayer();
    configurarEventosAnuncios();
    configurarBuscaEGeneros();
    iniciarAbasEstudio();
    iniciarControlesLocucaoEAnuncios();
    iniciarPerfilNegocio();
    iniciarGeradorPlaylistIA();
    iniciarAgendadorPorHorario();
    configurarAbasGerais();
    await carregarEmpresas();
});

/* =================================================================
   ... resto do arquivo mantém o conteúdo existente ...
================================================================== */

async function carregarEmpresas() {
    const client = ensureSupabaseClient();
    const seletor = document.getElementById("seletor-empresa");

    const { data, error } = await client
        .from("empresas")
        .select("*")
        .order("criado_em", { ascending: false });

    if (error || !data || data.length === 0) {
        if (seletor) seletor.innerHTML = `<option value="demo">Rádio Demonstração</option>`;
        await carregarDadosDaEmpresa(null, "Pop");
        return;
    }

    if (seletor) {
        seletor.innerHTML = data
            .map((emp) => `<option value="${emp.id}">${emp.nome_empresa} (${emp.plano.toUpperCase()})</option>`)
            .join("");
    }

    empresaAtual = data[0];
    atualizarCabecalhoEmpresa();
    await carregarDadosDaEmpresa(empresaAtual.id, empresaAtual.estilo_musical);
    await verificarOuGerarVinhetaFixa();

    if (seletor) {
        seletor.addEventListener("change", async (e) => {
            const escolhida = data.find((emp) => emp.id === e.target.value);
            if (escolhida) {
                empresaAtual = escolhida;
                atualizarCabecalhoEmpresa();
                await carregarDadosDaEmpresa(empresaAtual.id, empresaAtual.estilo_musical);
                await verificarOuGerarVinhetaFixa();
            }
        });
    }
}

async function verificarOuGerarVinhetaFixa() {
    if (!empresaAtual) return;
    const client = ensureSupabaseClient();

    const { data: vinhetas } = await client
        .from("anuncios_locucao")
        .select("*")
        .eq("empresa_id", empresaAtual.id)
        .eq("categoria", "identidade_fixa");

    if (vinhetas && vinhetas.length > 0) return;

    const nomeLoja = empresaAtual.nome_empresa || "nosso estabelecimento";
    const textoVinheta = `Você está ouvindo a rádio oficial da ${nomeLoja}. O ambiente faz parte do serviço.`;

    try {
        const audioBlob = await gerarAudioElevenLabsComVoz(textoVinheta, ELEVENLABS_VOICE_VINHETA);
        const urlPublicaMp3 = await salvarMp3NoSupabaseStorage(audioBlob, empresaAtual.id);

        await client.from("anuncios_locucao").insert([{
            empresa_id: empresaAtual.id,
            categoria: "identidade_fixa",
            roteiro_texto: textoVinheta,
            url_audio_ia: urlPublicaMp3,
            frequencia_musicas: 2,
            ativo: true
        }]);
    } catch (e) {
        console.error("Erro ao gerar vinheta fixa:", e);
    }
}

async function carregarDadosDaEmpresa(empresaId, estiloMusical) {
    const client = ensureSupabaseClient();
    const mapaGeneros = {
        barbearia_rock_hiphop: "Rock",
        salao_relaxante: "Electronic",
        estetica_sofisticado: "Ambient",
        misto_animado: "Pop"
    };

    const generoInicial = mapaGeneros[estiloMusical] || "Pop";

    await Promise.all([
        carregarAlbunsEmDestaque(),
        buscarMusicasPorGenero(generoInicial)
    ]);

    if (!empresaId) return;

    const { data: spotsDB } = await client
        .from("anuncios_locucao")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("criado_em", { ascending: false });

    anunciosAtivos = spotsDB || [];
    renderizarListaAnuncios();
}

async function favoritarMusica(idx, event) {
    event.stopPropagation();
    if (!empresaAtual) {
        alert("Selecione uma empresa no topo para salvar favoritas.");
        return;
    }
    const faixa = playlist[idx];
    if (!faixa) return;

    const client = ensureSupabaseClient();
    const { error } = await client.from("musicas_favoritas").insert([{
        empresa_id: empresaAtual.id,
        track_id: faixa.id || String(Date.now()),
        titulo: faixa.titulo,
        artista: faixa.artista,
        capa: faixa.capa,
        url_audio: faixa.url_audio
    }]);

    if (error) {
        alert("Erro ao favoritar: " + error.message);
    } else {
        event.target.textContent = "🖤";
    }
}

async function carregarMusicasFavoritas() {
    if (!empresaAtual) return;
    const client = ensureSupabaseClient();
    const tituloFila = document.getElementById("titulo-fila-atual");
    if (tituloFila) tituloFila.textContent = `🤍 Músicas Favoritas de ${empresaAtual.nome_empresa}`;

    const { data, error } = await client
        .from("musicas_favoritas")
        .select("*")
        .eq("empresa_id", empresaAtual.id)
        .order("criado_em", { ascending: false });

    if (error || !data || data.length === 0) {
        alert("Você ainda não curtiu nenhuma música! Clique no 🤍 ao lado das músicas para salvar.");
        return;
    }

    carregarPlaylist(data.map((m) => ({
        id: m.track_id,
        titulo: m.titulo,
        artista: m.artista,
        capa: m.capa,
        url_audio: m.url_audio
    })));
}

async function gerarAudioElevenLabsComVoz(texto, voiceIdEspecifico) {
    const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            text: texto,
            voiceId: voiceIdEspecifico,
            modelId: "eleven_multilingual_v2",
            voiceSettings: {
                stability: 0.55,
                similarity_boost: 0.85,
                style: 0.15
            }
        })
    });

    if (!response.ok) {
        let erroJson = {};
        try {
            erroJson = await response.json();
        } catch (_e) {
            erroJson = {};
        }
        throw new Error(`Backend recusou gerar TTS: ${erroJson.detail?.message || response.status}`);
    }

    return await response.blob();
}

async function salvarMp3NoSupabaseStorage(audioBlob, empresaId) {
    const client = ensureSupabaseClient();
    const nomeArquivo = `${empresaId}/spot_${Date.now()}.mp3`;

    const { error } = await client.storage
        .from("spots-clientes")
        .upload(nomeArquivo, audioBlob, {
            contentType: "audio/mpeg",
            upsert: false
        });

    if (error) {
        throw new Error(`Supabase Storage recusou o upload: ${error.message}`);
    }

    const { data } = client.storage
        .from("spots-clientes")
        .getPublicUrl(nomeArquivo);

    return data.publicUrl;
}

async function excluirAnuncio(id) {
    const client = ensureSupabaseClient();
    await client.from("anuncios_locucao").delete().eq("id", id);
    anunciosAtivos = anunciosAtivos.filter((s) => s.id !== id);
    renderizarListaAnuncios();
}

function iniciarPerfilNegocio() {
    const salvo = localStorage.getItem("orca_perfil_negocio");
    if (salvo) {
        perfilNegocio = JSON.parse(salvo);
        preencherCamposPerfil();
    } else if (empresaAtual) {
        const nomeLoja = document.getElementById("perfil-nome-loja");
        if (nomeLoja) nomeLoja.value = empresaAtual.nome_empresa || "";
    }

    const formPerfil = document.getElementById("form-perfil-negocio");
    if (formPerfil) {
        formPerfil.addEventListener("submit", async (e) => {
            e.preventDefault();
            perfilNegocio.nome = document.getElementById("perfil-nome-loja")?.value.trim() || "";
            perfilNegocio.tipo = document.getElementById("perfil-tipo-negocio")?.value.trim() || "";
            perfilNegocio.sobre = document.getElementById("perfil-sobre-negocio")?.value.trim() || "";
            perfilNegocio.tom = document.getElementById("perfil-tom-cuidados")?.value.trim() || "";

            localStorage.setItem("orca_perfil_negocio", JSON.stringify(perfilNegocio));

            if (empresaAtual && perfilNegocio.nome) {
                const client = ensureSupabaseClient();
                await client
                    .from("empresas")
                    .update({ nome_empresa: perfilNegocio.nome })
                    .eq("id", empresaAtual.id);
                const plName = document.getElementById("playlist-nome");
                if (plName) plName.textContent = `Rádio Exclusiva: ${perfilNegocio.nome}`;
            }

            alert("✅ Perfil salvo com sucesso!");
        });
    }
}

function iniciarAgendadorPorHorario() {
    const verificarAgenda = () => {
        if (!Array.isArray(configEstudio.minutosHora) || configEstudio.minutosHora.length === 0) {
            return;
        }

        const agora = new Date();
        const minutoAtual = agora.getMinutes();

        if (!configEstudio.minutosHora.includes(minutoAtual)) {
            return;
        }

        const chave = `${agora.getDate()}-${agora.getHours()}-${minutoAtual}`;
        if (agendadorPorHorarioLock.has(chave)) {
            return;
        }

        agendadorPorHorarioLock.add(chave);

        const agendamentos = (anunciosAtivos || []).filter((item) => item && item.ativo !== false && item.categoria === "agendamento");

        if (agendamentos.length > 0) {
            const index = Math.abs((agora.getHours() + minutoAtual) % agendamentos.length);
            const item = agendamentos[index];
            if (item) {
                falarComDucking(item.roteiro_texto, item.url_audio_ia || null);
            }
            return;
        }

        if (configEstudio.contextoClima || configEstudio.contextoDatas) {
            falarComDucking(gerarFraseHoraEClima(), null);
        }
    };

    verificarAgenda();
    setInterval(verificarAgenda, 60000);
}

/* =================================================================
   GERADOR DE PLAYLIST COM IA + PAINEL DOS 5 ROTEIROS DA BARBEARIA
================================================================== */
function obterRoteirosPadraoBarbearia(nomeCasa) {
    return [
        {
            titulo: "1. Limpeza de Pele",
            categoria: "dicas",
            roteiro_texto: `Cuidar da barba e do cabelo é essencial, mas e a pele do rosto? Aqui na ${nomeCasa}, a nossa Limpeza de Pele remove impurezas, cravos e controla a oleosidade, deixando seu rosto revitalizado e com acabamento impecável.`
        },
        {
            titulo: "2. Depilação Nasal (com cera)",
            categoria: "dicas",
            roteiro_texto: `Detalhes que fazem toda a diferença no visual! Nossa depilação nasal é rápida, prática e garante um acabamento impecável e limpo por muito mais tempo. Praticidade e conforto em um só passo.`
        },
        {
            titulo: "3. Hidratação para Cabelo",
            categoria: "combo",
            roteiro_texto: `Seu cabelo está ressecado ou sofrendo com a correria do dia a dia? Nossa hidratação capilar devolve o brilho, a maciez e a força que os fios precisam. Relaxe enquanto cuidamos do seu visual.`
        },
        {
            titulo: "4. Alinhamento dos Fios (Selagem)",
            categoria: "combo",
            roteiro_texto: `Quer praticidade para arrumar o cabelo todos os dias? Com o nosso alinhamento dos fios, a famosa selagem, você reduz o volume, elimina o frizz e conquista um cabelo disciplinado e elegante.`
        },
        {
            titulo: "5. Pigmentação para Barba e Cabelo",
            categoria: "produtos",
            roteiro_texto: `Quer dar aquela encorpada no visual e disfarçar os fios brancos ou falhas? A nossa pigmentação para barba e cabelo traz um acabamento natural, marcante e cheio de estilo.`
        }
    ];
}

// O restante do arquivo foi mantido, mas agora sem secretos embutidos no cliente.
