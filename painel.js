/* =================================================================
   ORCA SONORA - MOTOR COMPLETO DO PAINEL (painel.js corrigido)
================================================================== */

const ORCA_CONFIG = window.ORCA_CONFIG || {};

const SUPABASE_URL = ORCA_CONFIG.supabaseUrl || "https://hffnxblzvathjtedoyoz.supabase.co";
const SUPABASE_ANON_KEY = ORCA_CONFIG.supabaseAnonKey || "sb_publishable_PETXg6auyEFgcWYd1rR4rA_F1G5EHwA";
const supabaseClient = window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("<SEU-PROJETO>")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Configuração ElevenLabs
// IMPORTANTE: a chave da ElevenLabs NUNCA deve ficar no frontend.
// Passe via backend/Edge Function e mantenha a chave em variável de ambiente do servidor.
const ELEVENLABS_API_KEY = "";
const ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

// Duas Vozes Separadas
const ELEVENLABS_VOICE_VINHETA = "onwK4e9ZLuTAKqWW03F9";
const ELEVENLABS_VOICE_ANUNCIO = "pNInz6obpgDQGcFmaJgB";

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

// Tempos fixos em segundos para entrar no meio das músicas: 1:12 (72s), 0:45 (45s), 2:06 (126s)
const TEMPOS_ENTRADA_MUSICA = [72, 45, 126];
let indiceTempoMusica = 0;
let indiceRoteiroMeioMusica = 0;

if (audioEl) {
    audioEl.addEventListener("timeupdate", () => {
        if (!audioEl.currentTime || emDucking) return;
        const tempoAtualSegundos = Math.floor(audioEl.currentTime);

        if (tempoAtualSegundos < 5) {
            roteiroJaDisparadoNestaFaixa = false;
        }

        if (roteiroJaDisparadoNestaFaixa || locutorOcupado) return;

        // Define o segundo alvo desta música (alternando entre 1:12, 0:45 e 2:06)
        const segundoAlvoAtual = TEMPOS_ENTRADA_MUSICA[indiceTempoMusica % TEMPOS_ENTRADA_MUSICA.length];

        // Filtra os roteiros ativos (excluindo apenas a vinheta fixa de abertura, se desejar)
        const roteirosDisponiveis = anunciosAtivos.filter(s => s.ativo !== false && s.categoria !== "identidade_fixa");

        if (roteirosDisponiveis.length > 0 && tempoAtualSegundos >= segundoAlvoAtual && tempoAtualSegundos <= segundoAlvoAtual + 2) {
            roteiroJaDisparadoNestaFaixa = true;
            locutorOcupado = true;

            const spotEscolhido = roteirosDisponiveis[indiceRoteiroMeioMusica % roteirosDisponiveis.length];
            
            // Avança os ponteiros para a próxima música usar o próximo tempo e o próximo roteiro
            indiceTempoMusica++;
            indiceRoteiroMeioMusica++;

            // Garante que o nome da barbearia atual do assinante seja falado caso o texto use placeholder
            const nomeAtual = perfilNegocio.nome || empresaAtual?.nome_empresa || "nossa barbearia";
            const textoFinal = spotEscolhido.roteiro_texto.replace(/\{nome_empresa\}/gi, nomeAtual);

            falarComDucking(textoFinal, spotEscolhido.url_audio_ia).finally(() => {
                locutorOcupado = false;
            });
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
        console.warn("Supabase não configurado. Modo demo habilitado.");
        return null;
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

function configurarAbasGerais() {
    const botoesAbas = document.querySelectorAll("[data-aba], .tab-btn, nav button, aside button, .studio-tab-btn");
    const conteudosAbas = document.querySelectorAll(".conteudo-aba, .tab-pane, section[id^='aba-'], .studio-tab-pane");

    if (botoesAbas.length === 0) return;

    botoesAbas.forEach((botao) => {
        botao.addEventListener("click", (e) => {
            e.preventDefault();

            const alvo = botao.getAttribute("data-aba") ||
                botao.getAttribute("data-tab") ||
                botao.textContent.trim().toLowerCase();

            botoesAbas.forEach((b) => b.classList.remove("active", "bg-gray-700", "text-white"));
            botao.classList.add("active", "bg-gray-700", "text-white");

            conteudosAbas.forEach((conteudo) => {
                const idConteudo = conteudo.id ? conteudo.id.toLowerCase() : "";
                const dataAba = (conteudo.getAttribute("data-aba") || "").toLowerCase();

                if (idConteudo.includes(alvo) || dataAba === alvo || conteudo.id === botao.getAttribute("data-tab")) {
                    conteudo.style.display = "block";
                    conteudo.classList.add("active");
                } else {
                    conteudo.style.display = "none";
                    conteudo.classList.remove("active");
                }
            });
        });
    });
}

function iniciarOndasFundoPainel() {
    const canvas = document.getElementById("ocean-bg-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let width, height;
    let fase = 0;

    function redimensionar() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    window.addEventListener("resize", redimensionar);
    redimensionar();

    const ondas = [
        { amplitude: 26, frequencia: 0.003, velocidade: 0.012, yOffset: 0.65, cor: "rgba(255, 255, 255, 0.03)" },
        { amplitude: 20, frequencia: 0.005, velocidade: -0.016, yOffset: 0.76, cor: "rgba(255, 255, 255, 0.05)" },
        { amplitude: 16, frequencia: 0.007, velocidade: 0.02, yOffset: 0.88, cor: "rgba(255, 255, 255, 0.08)" }
    ];

    function animar() {
        ctx.clearRect(0, 0, width, height);
        fase += 1;

        ondas.forEach((onda) => {
            ctx.beginPath();
            ctx.moveTo(0, height);

            for (let x = 0; x <= width; x += 8) {
                const y = height * onda.yOffset +
                    Math.sin(x * onda.frequencia + fase * onda.velocidade) * onda.amplitude;
                ctx.lineTo(x, y);
            }

            ctx.lineTo(width, height);
            ctx.closePath();
            ctx.fillStyle = onda.cor;
            ctx.fill();
        });

        requestAnimationFrame(animar);
    }

    animar();
}

function configurarEventosPlayer() {
    if (!audioEl || !btnPlayPause) return;

    btnPlayPause.addEventListener("click", () => {
        if (playlist.length === 0) return;

        if (audioEl.paused) {
            if (!audioEl.src) {
                prepararFaixa(indiceMusica, true);
            } else {
                audioEl.play().catch((err) => console.error("Erro ao iniciar:", err));
                atualizarStatusUI("playing", "Música no Ar");
                btnPlayPause.textContent = "⏸ Pausar Rádio";
            }
        } else {
            audioEl.pause();
            atualizarStatusUI("paused", "Rádio Pausada");
            btnPlayPause.textContent = "▶ Continuar Rádio";
        }
    });

    if (btnAnterior) {
        btnAnterior.addEventListener("click", () => {
            if (playlist.length === 0) return;
            const anterior = (indiceMusica - 1 + playlist.length) % playlist.length;
            prepararFaixa(anterior, true);
        });
    }

    if (btnProxima) {
        btnProxima.addEventListener("click", () => {
            if (playlist.length === 0) return;
            avancarFaixaComSpot();
        });
    }

    if (controleVolume) {
        controleVolume.addEventListener("input", (e) => {
            volumeUsuario = parseFloat(e.target.value);
            if (!emDucking) {
                audioEl.volume = volumeUsuario;
            }
        });
    }

    audioEl.addEventListener("timeupdate", () => {
        if (!audioEl.duration || Number.isNaN(audioEl.duration)) return;
        const pct = (audioEl.currentTime / audioEl.duration) * 100;
        if (barraProgresso) barraProgresso.style.width = `${pct}%`;
        if (tempoAtualEl) tempoAtualEl.textContent = formatarSegundos(audioEl.currentTime);
        if (tempoTotalEl) tempoTotalEl.textContent = formatarSegundos(audioEl.duration);
    });

    audioEl.addEventListener("ended", () => {
        avancarFaixaComSpot();
    });
}

let musicasTocadasDesdeUltimoClima = 0;

function gerarFraseHoraEClima() {
    const agora = new Date();
    const horas = agora.getHours();
    const minutos = agora.getMinutes();
    const textoMinutos = minutos === 0 ? "em ponto" : `e ${minutos}`;
    const clima = window.orcaClimaAtual || { cidade: "sua região", temp: null, desc: "" };
    const nomeCasa = empresaAtual?.nome_empresa || "nossa casa";

    let frase = `Agora são ${horas} horas ${textoMinutos}. `;
    if (clima.temp !== null) {
        frase += `Em ${clima.cidade}, temperatura de ${clima.temp} graus, com ${clima.desc}. Você está na ${nomeCasa}.`;
    } else {
        frase += `Você está na sintonia da ${nomeCasa}.`;
    }
    return frase;
}

function avancarFaixaComSpot() {
    if (playlist.length === 0) return;

    musicasTocadasDesdeUltimoSpot++;
    musicasTocadasDesdeUltimoClima++;

    const proxima = (indiceMusica + 1) % playlist.length;
    prepararFaixa(proxima, true);

    const selectClima = document.getElementById("config-clima-automatico");
    const freqClima = selectClima ? parseInt(selectClima.value) : 3;

    if (freqClima > 0 && musicasTocadasDesdeUltimoClima >= freqClima) {
        musicasTocadasDesdeUltimoClima = 0;

        if (contadorSpotEl) {
            contadorSpotEl.textContent = "Locutor entrando com Hora Certa e Clima...";
        }

        setTimeout(() => {
            falarComDucking(gerarFraseHoraEClima(), null);
        }, 1800);
        return;
    }

    if (anunciosAtivos.length > 0) {
        const spotsPorMusica = anunciosAtivos.filter(s => s.tipo_disparo !== "tempo");
        if (spotsPorMusica.length > 0) {
            const spotAtual = spotsPorMusica[indiceAnuncio % spotsPorMusica.length];
            const freq = spotAtual.frequencia_musicas || 3;
            const faltam = Math.max(0, freq - musicasTocadasDesdeUltimoSpot);

            if (contadorSpotEl) {
                contadorSpotEl.textContent = faltam === 0
                    ? "Locutor entrando no ar..."
                    : `Próximo anúncio em ${faltam} música(s)`;
            }

            if (musicasTocadasDesdeUltimoSpot >= freq) {
                musicasTocadasDesdeUltimoSpot = 0;
                indiceAnuncio = (indiceAnuncio + 1) % spotsPorMusica.length;
                setTimeout(() => {
                    falarComDucking(spotAtual.roteiro_texto, spotAtual.url_audio_ia);
                }, 1800);
            }
        }
    }
}

async function carregarEmpresas() {
    const client = ensureSupabaseClient();
    const seletor = document.getElementById("seletor-empresa");

    if (!client) {
        if (seletor) seletor.innerHTML = '<option value="demo">Rádio Demonstração</option>';
        await carregarDadosDaEmpresa(null, "Pop");
        return;
    }

    const { data, error } = await client
        .from("empresas")
        .select("*")
        .order("criado_em", { ascending: false });

    if (error || !data || data.length === 0) {
        if (seletor) seletor.innerHTML = '<option value="demo">Rádio Demonstração</option>';
        await carregarDadosDaEmpresa(null, "Pop");
        return;
    }

    if (seletor) {
        seletor.innerHTML = data
            .map((emp) => `<option value="${emp.id}">${emp.nome_empresa} (${emp.plano ? emp.plano.toUpperCase() : "PLANO"})</option>`)
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

function atualizarCabecalhoEmpresa() {
    if (!empresaAtual) return;
    const badge = document.getElementById("badge-plano");
    const nomePl = document.getElementById("playlist-nome");
    if (badge) badge.textContent = `Plano ${empresaAtual.plano ? empresaAtual.plano.toUpperCase() : "PLANO"} • ${empresaAtual.creditos_ia || 2992} créditos`;
    if (nomePl) nomePl.textContent = `Rádio Exclusiva: ${empresaAtual.nome_empresa}`;
}

async function verificarOuGerarVinhetaFixa() {
    if (!empresaAtual) return;
    const client = ensureSupabaseClient();
    if (!client) return;

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

const AUDIUS_API_BASE = "https://api.audius.co/v1";
let offsetAtual = 0;
let modoBuscaAtual = { tipo: "genre", valor: "Pop" };

async function carregarDadosDaEmpresa(empresaId, estiloMusical) {
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

    const client = ensureSupabaseClient();
    if (!client) return;

    const { data: spotsDB } = await client
        .from("anuncios_locucao")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("criado_em", { ascending: false });

    anunciosAtivos = spotsDB || [];
    renderizarListaAnuncios();
}

async function carregarAlbunsEmDestaque() {
    const grid = document.getElementById("grid-albuns");
    if (!grid) return;

    grid.innerHTML = '<p style="color:#a3a3a3; font-size:0.85rem;">Carregando álbuns...</p>';

    try {
        const res = await fetch(`${AUDIUS_API_BASE}/playlists/trending?limit=8&app_name=OrcaSonora`);
        const json = await res.json();
        const albuns = json.data || [];

        if (albuns.length === 0) {
            grid.innerHTML = "";
            return;
        }

        grid.innerHTML = albuns
            .map((alb) => {
                const capa = alb.artwork ? (alb.artwork["480x480"] || alb.artwork["150x150"]) : "";
                const nomeSeguro = (alb.playlist_name || "Playlist").replace(/'/g, "\\'");
                return `
                    <div class="album-card" onclick="abrirAlbumPlaylist('${alb.id}', '${nomeSeguro}')">
                        <div class="album-cover-wrap">
                            ${capa ? `<img src="${capa}" alt="${alb.playlist_name}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">🎵</div>`}
                            <div class="album-play-badge">▶</div>
                        </div>
                        <div class="album-title">${alb.playlist_name}</div>
                        <div class="album-artist">${alb.user?.name || "Orca Curadoria"} • ${alb.track_count || 0} faixas</div>
                    </div>
                `;
            })
            .join("");
    } catch (e) {
        console.error("Erro ao carregar álbuns:", e);
        grid.innerHTML = "";
    }
}

async function abrirAlbumPlaylist(playlistId, nomeAlbum) {
    const totalEl = document.getElementById("total-faixas");
    const tituloFila = document.getElementById("titulo-fila-atual");
    if (totalEl) totalEl.textContent = "Abrindo álbum...";
    if (tituloFila) tituloFila.textContent = `💿 Álbum: ${nomeAlbum}`;

    try {
        const res = await fetch(`${AUDIUS_API_BASE}/playlists/${playlistId}/tracks?app_name=OrcaSonora`);
        const json = await res.json();
        const faixas = formatarFaixasAPI(json.data || []);

        if (faixas.length === 0) {
            alert("Este álbum não possui faixas disponíveis no momento.");
            return;
        }

        carregarPlaylist(faixas);
        prepararFaixa(0, true);
    } catch (e) {
        console.error("Erro ao abrir álbum:", e);
    }
}

async function buscarMusicasPorGenero(genero, carregarMais = false) {
    if (!carregarMais) {
        offsetAtual = 0;
        modoBuscaAtual = { tipo: "genre", valor: genero };
        const tituloFila = document.getElementById("titulo-fila-atual");
        if (tituloFila) tituloFila.textContent = `🎵 Top ${genero}`;
    } else {
        offsetAtual += 50;
    }

    const totalEl = document.getElementById("total-faixas");
    if (totalEl) totalEl.textContent = "Carregando músicas...";

    try {
        const res = await fetch(
            `${AUDIUS_API_BASE}/tracks/trending?genre=${encodeURIComponent(genero)}&limit=50&offset=${offsetAtual}&app_name=OrcaSonora`
        );
        const json = await res.json();
        const novasFaixas = formatarFaixasAPI(json.data || []);

        if (carregarMais) {
            playlist = [...playlist, ...novasFaixas];
            if (totalEl) totalEl.textContent = `${playlist.length} faixas na fila`;
            renderizarFilaMusicas();
        } else {
            carregarPlaylist(novasFaixas);
        }
    } catch (e) {
        console.error("Erro ao carregar gênero:", e);
        if (!carregarMais) carregarPlaylist(PLAYLIST_DEMONSTRACAO);
    }
}

async function pesquisarMusicasNaAPI(termo, carregarMais = false) {
    const texto = (termo || "").trim();
    if (!texto) return;

    if (!carregarMais) {
        offsetAtual = 0;
        modoBuscaAtual = { tipo: "search", valor: texto };
        const tituloFila = document.getElementById("titulo-fila-atual");
        if (tituloFila) tituloFila.textContent = `🔍 Resultados para "${texto}"`;
    } else {
        offsetAtual += 50;
    }

    const totalEl = document.getElementById("total-faixas");
    if (totalEl) totalEl.textContent = `Buscando "${texto}"...`;

    try {
        const [resTracks, resPlaylists] = await Promise.all([
            fetch(`${AUDIUS_API_BASE}/tracks/search?query=${encodeURIComponent(texto)}&limit=50&offset=${offsetAtual}&app_name=OrcaSonora`),
            !carregarMais ? fetch(`${AUDIUS_API_BASE}/playlists/search?query=${encodeURIComponent(texto)}&limit=8&app_name=OrcaSonora`) : Promise.resolve(null)
        ]);

        const jsonTracks = await resTracks.json();
        const novasFaixas = formatarFaixasAPI(jsonTracks.data || []);

        if (resPlaylists) {
            const jsonPlaylists = await resPlaylists.json();
            const albunsEncontrados = jsonPlaylists.data || [];
            const grid = document.getElementById("grid-albuns");
            if (grid && albunsEncontrados.length > 0) {
                grid.innerHTML = albunsEncontrados
                    .map((alb) => {
                        const capa = alb.artwork ? (alb.artwork["480x480"] || alb.artwork["150x150"]) : "";
                        const nomeSeguro = (alb.playlist_name || "Playlist").replace(/'/g, "\\'");
                        return `
                            <div class="album-card" onclick="abrirAlbumPlaylist('${alb.id}', '${nomeSeguro}')">
                                <div class="album-cover-wrap">
                                    ${capa ? `<img src="${capa}" alt="${alb.playlist_name}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">🎵</div>`}
                                    <div class="album-play-badge">▶</div>
                                </div>
                                <div class="album-title">${alb.playlist_name}</div>
                                <div class="album-artist">${alb.user?.name || "Artista"}</div>
                            </div>
                        `;
                    })
                    .join("");
            }
        }

        if (novasFaixas.length === 0 && !carregarMais) {
            alert("Nenhuma música encontrada com esse termo.");
            return;
        }

        if (carregarMais) {
            playlist = [...playlist, ...novasFaixas];
            if (totalEl) totalEl.textContent = `${playlist.length} faixas na fila`;
            renderizarFilaMusicas();
        } else {
            carregarPlaylist(novasFaixas);
        }
    } catch (e) {
        console.error("Erro na busca:", e);
    }
}

function carregarMaisMusicas() {
    if (modoBuscaAtual.tipo === "genre") {
        buscarMusicasPorGenero(modoBuscaAtual.valor, true);
    } else {
        pesquisarMusicasNaAPI(modoBuscaAtual.valor, true);
    }
}

function formatarFaixasAPI(listaBruta) {
    return listaBruta.map((track) => ({
        id: track.id,
        titulo: track.title,
        artista: track.user?.name || "Artista",
        capa: track.artwork ? (track.artwork["480x480"] || track.artwork["150x150"]) : null,
        url_audio: `${AUDIUS_API_BASE}/tracks/${track.id}/stream?app_name=OrcaSonora`
    }));
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
    if (!client) {
        alert("A funcionalidade de favoritos exige configuração do Supabase.");
        return;
    }

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
        if (event.target) event.target.textContent = "🖤";
    }
}

async function carregarMusicasFavoritas() {
    if (!empresaAtual) return;
    const client = ensureSupabaseClient();
    if (!client) {
        alert("As músicas favoritas exigem o Supabase configurado.");
        return;
    }

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

function configurarBuscaEGeneros() {
    const inputBusca = document.getElementById("input-busca-musica");
    const btnBusca = document.getElementById("btn-buscar-musica");

    if (btnBusca && inputBusca) {
        btnBusca.onclick = () => pesquisarMusicasNaAPI(inputBusca.value);
        inputBusca.onkeypress = (e) => {
            if (e.key === "Enter") pesquisarMusicasNaAPI(inputBusca.value);
        };
    }

    document.querySelectorAll(".genre-btn[data-genre]").forEach((btn) => {
        btn.onclick = () => {
            document.querySelectorAll(".genre-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            buscarMusicasPorGenero(btn.getAttribute("data-genre"));
        };
    });

    const btnFavoritas = document.getElementById("btn-ver-favoritas");
    if (btnFavoritas) {
        btnFavoritas.onclick = () => {
            document.querySelectorAll(".genre-btn").forEach((b) => b.classList.remove("active"));
            btnFavoritas.classList.add("active");
            carregarMusicasFavoritas();
        };
    }
}

function carregarPlaylist(lista) {
    playlist = Array.isArray(lista) ? lista : [];
    indiceMusica = 0;
    const totalEl = document.getElementById("total-faixas");
    if (totalEl) totalEl.textContent = `${playlist.length} faixas na fila`;
    renderizarFilaMusicas();
    prepararFaixa(0, false);
}

function renderizarFilaMusicas() {
    const ul = document.getElementById("lista-musicas");
    if (!ul) return;

    ul.innerHTML = playlist
        .map((m, idx) => `
            <li class="track-item ${idx === indiceMusica ? "active" : ""}" onclick="prepararFaixa(${idx}, true)">
                <div class="track-left">
                    ${m.capa ? `<img src="${m.capa}" class="track-thumb" alt="Capa">` : `<div class="track-thumb" style="display:flex;align-items:center;justify-content:center;">🎵</div>`}
                    <div>
                        <div style="font-weight:600; color:#ffffff;">${m.titulo}</div>
                        <small style="color:#a3a3a3;">${m.artista}</small>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <button type="button" onclick="favoritarMusica(${idx}, event)" title="Salvar nas Favoritas" style="background:none; border:none; cursor:pointer; font-size:1rem;">🤍</button>
                    <span>${idx === indiceMusica ? "🔊" : "▶"}</span>
                </div>
            </li>
        `)
        .join("");
}

function prepararFaixa(indice, autoPlay = true) {
    if (!playlist || playlist.length === 0 || !audioEl) return;

    indiceMusica = indice >= playlist.length ? 0 : indice;
    const faixa = playlist[indiceMusica];
    if (!faixa) return;

    roteiroJaDisparadoNestaFaixa = false;

    audioEl.src = faixa.url_audio;
    audioEl.volume = emDucking ? 0.15 : volumeUsuario;

    audioEl.onerror = () => {
        console.warn("Faixa indisponível, pulando automaticamente para a próxima...");
        setTimeout(() => {
            const proxima = (indiceMusica + 1) % playlist.length;
            prepararFaixa(proxima, true);
        }, 1000);
    };

    const tituloEl = document.getElementById("musica-titulo");
    const artistaEl = document.getElementById("musica-artista");
    if (tituloEl) tituloEl.textContent = faixa.titulo;
    if (artistaEl) artistaEl.textContent = faixa.artista;

    const coverBox = document.getElementById("cover-box");
    if (coverBox) {
        if (faixa.capa) {
            coverBox.innerHTML = `<img src="${faixa.capa}" style="width:100%; height:100%; object-fit:cover;" alt="Capa">`;
        } else {
            coverBox.innerHTML = '<span id="cover-icon">🐋</span>';
        }
    }

    renderizarFilaMusicas();

    if (autoPlay) {
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    atualizarStatusUI("playing", "Música no Ar");
                    if (btnPlayPause) btnPlayPause.textContent = "⏸ Pausar Rádio";
                })
                .catch((err) => {
                    console.warn("Autoplay aguardando interação ou tentando próxima faixa:", err);
                });
        }
    }
}

async function gerarAudioElevenLabsComVoz(texto, voiceIdEspecifico) {
    const client = ensureSupabaseClient();
    let token = "";

    // Tenta pegar a sessão logada no Supabase (se houver)
    if (client) {
        const { data } = await client.auth.getSession();
        if (data?.session?.access_token) {
            token = data.session.access_token;
        }
    }

    const baseUrl = (window.ORCA_CONFIG && window.ORCA_CONFIG.apiBaseUrl)
        ? window.ORCA_CONFIG.apiBaseUrl.replace(/\/$/, "")
        : "";

    const headers = { "Content-Type": "application/json" };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}/api/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            text: texto,
            voiceId: voiceIdEspecifico
        })
    });

    if (!response.ok) {
        const erroJson = await response.json().catch(() => ({}));
        throw new Error(erroJson.error || `Servidor recusou gerar TTS: ${response.status}`);
    }

    return await response.blob();

} 

async function gerarAudioElevenLabs(texto) {
    const seletorLocucao = document.getElementById("locucao-voz-padrao");
    const seletorVivo = document.getElementById("seletor-voz-ia");

    const voiceIdEscolhida = (seletorLocucao && seletorLocucao.value)
        ? seletorLocucao.value
        : (seletorVivo ? seletorVivo.value : ELEVENLABS_VOICE_ANUNCIO);

    return await gerarAudioElevenLabsComVoz(texto, voiceIdEscolhida);
}

async function salvarMp3NoSupabaseStorage(audioBlob, empresaId) {
    const client = ensureSupabaseClient();
    if (!client) {
        return URL.createObjectURL(audioBlob);
    }

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

async function falarComDucking(texto, urlAudioSalvo = null) {
    if (!locutorEl) return;

    const coverBox = document.getElementById("cover-box");
    const conteudoOriginalCover = coverBox ? coverBox.innerHTML : "";

    try {
        emDucking = true;
        atualizarStatusUI("ducking", "⏳ Gerando voz na ElevenLabs...");
        if (coverBox) coverBox.innerHTML = '<span id="cover-icon">🎙️</span>';

        locutorEl.play().catch(() => {});

        let audioSrc = urlAudioSalvo;

        if (!audioSrc || audioSrc === "null" || audioSrc === "") {
            const blob = await gerarAudioElevenLabs(texto);
            audioSrc = URL.createObjectURL(blob);
        }

        transicaoVolume(audioEl ? audioEl.volume : 0.85, Math.min(volumeUsuario * 0.18, 0.18), 400);
        atualizarStatusUI("ducking", "🎙️ Locutor Neural no Ar");

        locutorEl.src = audioSrc;
        locutorEl.volume = 1.0;
        await locutorEl.play();

        locutorEl.onended = () => {
            emDucking = false;
            transicaoVolume(audioEl ? audioEl.volume : 0.85, volumeUsuario, 600);
            if (coverBox) coverBox.innerHTML = conteudoOriginalCover;
            atualizarStatusUI(
                audioEl && !audioEl.paused ? "playing" : "paused",
                audioEl && !audioEl.paused ? "Música no Ar" : "Pronta para tocar"
            );
        };
    } catch (erro) {
        console.error("Erro no Locutor:", erro);
        emDucking = false;
        if (audioEl) transicaoVolume(audioEl.volume, volumeUsuario, 400);
        if (coverBox) coverBox.innerHTML = conteudoOriginalCover;
        atualizarStatusUI(audioEl && !audioEl.paused ? "playing" : "paused", "Pronta para tocar");
        alert(erro.message);
    }
}

function transicaoVolume(de, para, duracaoMs) {
    if (!audioEl) return;

    const passos = 15;
    const intervalo = duracaoMs / passos;
    const diferenca = (para - de) / passos;
    let contador = 0;

    const timer = setInterval(() => {
        contador++;
        audioEl.volume = Math.max(0, Math.min(1, audioEl.volume + diferenca));
        if (contador >= passos) {
            audioEl.volume = para;
            clearInterval(timer);
        }
    }, intervalo);
}

/* =================================================================
   5. ANÚNCIOS E FORMULÁRIOS
================================================================== */
function configurarEventosAnuncios() {
    const btnFalar = document.getElementById("btn-falar-agora");
    if (btnFalar) {
        btnFalar.addEventListener("click", () => {
            const input = document.getElementById("texto-aviso-vivo");
            if (!input || !input.value.trim()) {
                alert("Digite uma frase para o locutor falar!");
                return;
            }
            falarComDucking(input.value.trim(), null);
        });
    }

    document.querySelectorAll(".quick-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const msg = btn.getAttribute("data-msg");
            const inputVivo = document.getElementById("texto-aviso-vivo");
            if (inputVivo) inputVivo.value = msg;
            falarComDucking(msg, null);
        });
    });

    const btnTestarVoz = document.getElementById("btn-testar-voz");
    if (btnTestarVoz) {
        btnTestarVoz.addEventListener("click", () => {
            const texto = document.getElementById("spot-texto")?.value.trim();
            if (!texto) {
                alert("Digite o texto do anúncio primeiro.");
                return;
            }
            falarComDucking(texto, null);
        });
    }

    const formAnuncio = document.getElementById("form-novo-anuncio");
    if (formAnuncio) {
        formAnuncio.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!empresaAtual) {
                alert("Nenhuma empresa selecionada no topo.");
                return;
            }

            const btnSubmit = e.target.querySelector("button[type='submit']");
            const textoOriginalBtn = btnSubmit ? btnSubmit.textContent : "💾 Salvar";
            const roteiro = document.getElementById("spot-texto").value.trim();
            const categoria = document.getElementById("spot-categoria").value;
            const tipoDisparo = document.getElementById("tipo-disparo") ? document.getElementById("tipo-disparo").value : "musicas";

            let frequenciaMusicas = 3;
            let tempoDisparoSegundos = null;

            if (tipoDisparo === "tempo") {
                const min = parseInt(document.getElementById("spot-minuto")?.value) || 0;
                const seg = parseInt(document.getElementById("spot-segundo")?.value) || 0;
                tempoDisparoSegundos = (min * 60) + seg;
            } else {
                frequenciaMusicas = parseInt(document.getElementById("spot-frequencia")?.value) || 3;
            }

            try {
                if (btnSubmit) {
                    btnSubmit.disabled = true;
                    btnSubmit.textContent = idAnuncioEditando ? "⏳ Atualizando áudio..." : "⏳ Gerando voz e salvando...";
                }

                const client = ensureSupabaseClient();
                if (!client) {
                    throw new Error("Supabase ausente. Configure as credenciais para salvar roteiros.");
                }

                const audioBlob = await gerarAudioElevenLabs(roteiro);
                const urlPublicaMp3 = await salvarMp3NoSupabaseStorage(audioBlob, empresaAtual.id);

                const dadosSpot = {
                    empresa_id: empresaAtual.id,
                    categoria: categoria,
                    roteiro_texto: roteiro,
                    url_audio_ia: urlPublicaMp3,
                    frequencia_musicas: frequenciaMusicas,
                    tipo_disparo: tipoDisparo,
                    tempo_disparo: tempoDisparoSegundos,
                    ativo: true
                };

                if (idAnuncioEditando) {
                    const { error } = await client
                        .from("anuncios_locucao")
                        .update(dadosSpot)
                        .eq("id", idAnuncioEditando);

                    if (error) throw error;

                    const index = anunciosAtivos.findIndex(s => s.id === idAnuncioEditando);
                    if (index !== -1) {
                        anunciosAtivos[index] = { ...anunciosAtivos[index], ...dadosSpot };
                    }

                    idAnuncioEditando = null;
                } else {
                    const { data, error } = await client
                        .from("anuncios_locucao")
                        .insert([dadosSpot])
                        .select();

                    if (error) throw error;

                    if (data && data[0]) {
                        anunciosAtivos.unshift(data[0]);
                    }
                }

                formAnuncio.reset();
                renderizarListaAnuncios();
                alert("✅ Roteiro salvo com sucesso!");
            } catch (err) {
                alert("Erro ao salvar roteiro: " + err.message);
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = textoOriginalBtn;
                }
            }
        });
    }
}

function renderizarListaAnuncios() {
    const container = document.getElementById("lista-anuncios");
    if (!container) return;

    if (anunciosAtivos.length === 0) {
        container.innerHTML = '<p class="empty-msg">Nenhum anúncio ou pílula cadastrado ainda.</p>';
        return;
    }

    container.innerHTML = anunciosAtivos
        .map((spot) => {
            let regraTexto = "";
            if (spot.tipo_disparo === "tempo" && spot.tempo_disparo) {
                const min = Math.floor(spot.tempo_disparo / 60);
                const seg = spot.tempo_disparo % 60;
                regraTexto = `Dispara aos ${min}:${seg < 10 ? '0' : ''}${seg} da música`;
            } else {
                regraTexto = `Fala a cada ${spot.frequencia_musicas || 3} músicas`;
            }

            const rotulosCategorias = {
                identidade: "🏛️ Identidade",
                identidade_fixa: "🎙️ Vinheta Fixa",
                dicas: "💡 Dica",
                combo: "✂️ Promoção",
                agendamento: "📅 Agendamento",
                produtos: "🛍️ Produtos"
            };
            const nomeCategoria = rotulosCategorias[spot.categoria] || spot.categoria;

            return `
                <div class="spot-item" id="spot-card-${spot.id}">
                    <div class="spot-item-header">
                        <span class="spot-badge">${nomeCategoria}</span>
                        <small style="color:#a3a3a3;">${regraTexto}</small>
                    </div>
                    <p style="margin-bottom: 10px;">“${spot.roteiro_texto}”</p>
                    <div class="spot-item-actions">
                        <button class="btn-mini" onclick="prepararEdicaoAnuncio('${spot.id}')">✏️ Editar</button>
                        <button class="btn-mini" onclick="excluirAnuncio('${spot.id}')" style="background: rgba(239, 68, 68, 0.1); color: #f87171;">🗑 Excluir</button>
                    </div>
                </div>
            `;
        })
        .join("");
}

function prepararEdicaoAnuncio(id) {
    const spot = anunciosAtivos.find(s => s.id === id);
    if (!spot) return;

    document.getElementById("spot-categoria").value = spot.categoria || "identidade";
    document.getElementById("spot-texto").value = spot.roteiro_texto || "";

    const tipoDisparoSelect = document.getElementById("tipo-disparo");
    if (tipoDisparoSelect) {
        tipoDisparoSelect.value = spot.tipo_disparo || "musicas";
    }

    if (spot.tipo_disparo === "tempo" && spot.tempo_disparo) {
        const inputMin = document.getElementById("spot-minuto");
        const inputSeg = document.getElementById("spot-segundo");
        if (inputMin) inputMin.value = Math.floor(spot.tempo_disparo / 60);
        if (inputSeg) inputSeg.value = spot.tempo_disparo % 60;
    } else {
        const inputFreq = document.getElementById("spot-frequencia");
        if (inputFreq) inputFreq.value = spot.frequencia_musicas || 3;
    }

    idAnuncioEditando = id;

    const btnSubmit = document.querySelector("#form-novo-anuncio button[type='submit']");
    if (btnSubmit) btnSubmit.textContent = "💾 Atualizar Roteiro";

    const formEl = document.getElementById("form-novo-anuncio");
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
}

async function excluirAnuncio(id) {
    const client = ensureSupabaseClient();
    if (!client) return;
    await client.from("anuncios_locucao").delete().eq("id", id);
    anunciosAtivos = anunciosAtivos.filter((s) => s.id !== id);
    renderizarListaAnuncios();
}

function atualizarStatusUI(classe, texto) {
    if (!radioStatusEl) return;
    radioStatusEl.className = `status-indicator ${classe}`;
    radioStatusEl.innerHTML = `<span class="dot"></span> ${texto}`;
}

function formatarSegundos(seg) {
    const m = Math.floor(seg / 60);
    const s = Math.floor(seg % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/* =================================================================
   6. ESTÚDIO E PERFIL DO NEGÓCIO
================================================================== */
let configEstudio = {
    falarCadaMusicas: 3,
    duracaoLocucao: 15,
    contextoClima: true,
    contextoDatas: true,
    modoIntervalo: "musicas",
    minutosHora: [0, 30]
};

let perfilNegocio = {
    nome: "",
    tipo: "",
    sobre: "",
    tom: "",
    logoBase64: ""
};

function iniciarAbasEstudio() {
    const botoes = document.querySelectorAll(".studio-tab-btn");
    const paineis = document.querySelectorAll(".studio-tab-pane");

    botoes.forEach((btn) => {
        btn.addEventListener("click", () => {
            botoes.forEach((b) => b.classList.remove("active"));
            paineis.forEach((p) => p.classList.remove("active"));

            btn.classList.add("active");
            const alvo = document.getElementById(btn.getAttribute("data-tab"));
            if (alvo) alvo.classList.add("active");
        });
    });
}

function iniciarControlesLocucaoEAnuncios() {
    vincularSlider("range-falar-cada", "val-falar-cada", (v) => `${v} músicas`, (v) => configEstudio.falarCadaMusicas = parseInt(v));
    vincularSlider("range-duracao-locucao", "val-duracao-locucao", (v) => `${v} s`, (v) => configEstudio.duracaoLocucao = parseInt(v));
}

function vincularSlider(idRange, idLabel, formatador, callback) {
    const range = document.getElementById(idRange);
    const label = document.getElementById(idLabel);
    if (!range || !label) return;
    range.addEventListener("input", () => {
        label.textContent = formatador(range.value);
        if (callback) callback(range.value);
    });
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
            const novoNome = document.getElementById("perfil-nome-loja")?.value.trim() || "";
            perfilNegocio.nome = novoNome;
            perfilNegocio.tipo = document.getElementById("perfil-tipo-negocio")?.value.trim() || "";
            perfilNegocio.sobre = document.getElementById("perfil-sobre-negocio")?.value.trim() || "";
            perfilNegocio.tom = document.getElementById("perfil-tom-cuidados")?.value.trim() || "";

            localStorage.setItem("orca_perfil_negocio", JSON.stringify(perfilNegocio));

            if (empresaAtual && novoNome) {
                empresaAtual.nome_empresa = novoNome;
                const client = ensureSupabaseClient();
                if (client) {
                    await client
                        .from("empresas")
                        .update({ nome_empresa: novoNome })
                        .eq("id", empresaAtual.id);

                    await client
                        .from("anuncios_locucao")
                        .delete()
                        .eq("empresa_id", empresaAtual.id)
                        .eq("categoria", "identidade_fixa");

                    await verificarOuGerarVinhetaFixa();
                }

                const plName = document.getElementById("playlist-nome");
                if (plName) plName.textContent = `Rádio Exclusiva: ${novoNome}`;
            }

            alert(`✅ Perfil atualizado! O locutor agora falará "${novoNome}".`);
        });
    }
}

function preencherCamposPerfil() {
    const nomeLoja = document.getElementById("perfil-nome-loja");
    const tipoNegocio = document.getElementById("perfil-tipo-negocio");
    const sobre = document.getElementById("perfil-sobre-negocio");
    const tom = document.getElementById("perfil-tom-cuidados");

    if (nomeLoja) nomeLoja.value = perfilNegocio.nome || "";
    if (tipoNegocio) tipoNegocio.value = perfilNegocio.tipo || "";
    if (sobre) sobre.value = perfilNegocio.sobre || "";
    if (tom) tom.value = perfilNegocio.tom || "";
}

function iniciarAgendadorPorHorario() {
    const verificarAgenda = () => {
        if (!Array.isArray(configEstudio.minutosHora) || configEstudio.minutosHora.length === 0) return;

        const agora = new Date();
        const minutoAtual = agora.getMinutes();

        if (!configEstudio.minutosHora.includes(minutoAtual)) return;

        const chave = `${agora.getDate()}-${agora.getHours()}-${minutoAtual}`;
        if (agendadorPorHorarioLock.has(chave)) return;

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
            roteiro_texto: `Cuidar da barba e do cabelo é essencial, mas e a pele do rosto? Aqui na ${nomeCasa}, a nossa Limpeza de Pele remove impurezas, cravos e controla a oleosidade, deixando seu visual mais saudável, fresco e impecável.`
        },
        {
            titulo: "2. Depilação Nasal (com cera)",
            categoria: "dicas",
            roteiro_texto: `Detalhes que fazem toda a diferença no visual! Nossa depilação nasal é rápida, prática e garante um acabamento impecável e limpo por muito mais tempo. Praticidade e conforto em um só serviço.`
        },
        {
            titulo: "3. Hidratação para Cabelo",
            categoria: "combo",
            roteiro_texto: `Seu cabelo está ressecado ou sofrendo com a correria do dia a dia? Nossa hidratação capilar devolve o brilho, a maciez e a força que os fios precisam. Relaxe enquanto seu cabelo recebe o cuidado que merece.`
        },
        {
            titulo: "4. Alinhamento dos Fios (Selagem)",
            categoria: "combo",
            roteiro_texto: `Quer praticidade para arrumar o cabelo todos os dias? Com o nosso alinhamento dos fios, a famosa selagem, você reduz o volume, elimina o frizz e conquista um cabelo disciplinado, brilhante e sofisticado.`
        },
        {
            titulo: "5. Pigmentação para Barba e Cabelo",
            categoria: "produtos",
            roteiro_texto: `Quer dar aquela encorpada no visual e disfarçar os fios brancos ou falhas? A nossa pigmentação para barba e cabelo traz um acabamento natural, marcante e cheio de estilo, elevando sua aparência de forma inteligente.`
        }
    ];
}

function renderizarPainelRoteirosIA(listaItens) {
    const container = document.getElementById("lista-cards-roteiros-ia");
    if (!container) return;

    container.innerHTML = listaItens.map((item, index) => `
        <div style="background: #141418; border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                <strong style="font-size: 0.85rem; color: #ffffff;">${item.titulo || `Roteiro IA #${index + 1}`}</strong>
                <span style="font-size: 0.75rem; background: rgba(96, 165, 250, 0.15); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.3); padding: 2px 8px; border-radius: 6px; font-weight: 700;">
                    ⏱️ Entra a cada ${item.frequencia_musicas} música(s)
                </span>
            </div>
            <p style="font-size: 0.82rem; color: #d4d4d8; line-height: 1.45; margin-bottom: 8px; font-style: italic;">
                “${item.roteiro_texto}”
            </p>
            <div style="display: flex; justify-content: flex-end;">
                <button type="button" onclick="falarComDucking('${item.roteiro_texto.replace(/'/g, "\\'")}', ${item.url_audio_ia ? `'${item.url_audio_ia}'` : 'null'})" 
                        style="background: #ffffff; color: #050505; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                    🎙️ Testar no Ar Agora
                </button>
            </div>
        </div>
    `).join("");
}

function iniciarGeradorPlaylistIA() {
    const exibirCardsNaTela = () => {
        const nomeCasa = perfilNegocio.nome || empresaAtual?.nome_empresa || "barbearia";
        const previewInicial = obterRoteirosPadraoBarbearia(nomeCasa).map((r) => ({
            ...r,
            frequencia_musicas: Math.floor(Math.random() * 4) + 1,
            url_audio_ia: null
        }));
        renderizarPainelRoteirosIA(previewInicial);
    };

    exibirCardsNaTela();
    setTimeout(exibirCardsNaTela, 800);

    const btnGerarIA = document.getElementById("btn-gerar-playlist-ia");
    if (!btnGerarIA) return;

    btnGerarIA.onclick = async () => {
        const promptTexto = document.getElementById("prompt-playlist-ia")?.value.trim() || "estilo barbearia moderno";
        const nomeCasa = perfilNegocio.nome || empresaAtual?.nome_empresa || "barbearia";

        btnGerarIA.disabled = true;
        btnGerarIA.textContent = "⏳ Gerando trilha, vozes e sincronizando rádio...";

        try {
            let termoBusca = "Acoustic Rock";
            const textoAnalise = promptTexto.toLowerCase();
            if (textoAnalise.includes("rock")) termoBusca = "Rock";
            else if (textoAnalise.includes("eletrônica") || textoAnalise.includes("lounge")) termoBusca = "Electronic";
            else if (textoAnalise.includes("jazz") || textoAnalise.includes("calmo")) termoBusca = "Ambient";
            else if (textoAnalise.includes("pop")) termoBusca = "Pop";

            await pesquisarMusicasNaAPI(termoBusca);

            const roteirosParaGerar = obterRoteirosPadraoBarbearia(nomeCasa);
            const itensSincronizados = [];

            for (const rot of roteirosParaGerar) {
                const freqAleatoria = Math.floor(Math.random() * 4) + 1;
                let urlAudioSalvo = null;

                try {
                    const audioBlob = await gerarAudioElevenLabsComVoz(rot.roteiro_texto, ELEVENLABS_VOICE_ANUNCIO);
                    if (empresaAtual) {
                        urlAudioSalvo = await salvarMp3NoSupabaseStorage(audioBlob, empresaAtual.id);
                    } else {
                        urlAudioSalvo = URL.createObjectURL(audioBlob);
                    }
                } catch (errVoz) {
                    console.warn("Aviso ao gerar MP3 antecipado, o locutor gerará ao vivo na hora:", errVoz);
                }

                const novoSpot = {
                    empresa_id: empresaAtual ? empresaAtual.id : "demo",
                    categoria: rot.categoria,
                    roteiro_texto: rot.roteiro_texto,
                    url_audio_ia: urlAudioSalvo,
                    frequencia_musicas: freqAleatoria,
                    tipo_disparo: "musicas",
                    ativo: true
                };

                if (empresaAtual) {
                    const client = ensureSupabaseClient();
                    if (client) {
                        const { data, error } = await client
                            .from("anuncios_locucao")
                            .insert([novoSpot])
                            .select();

                        if (!error && data && data[0]) {
                            anunciosAtivos.unshift(data[0]);
                            itensSincronizados.push({ ...data[0], titulo: rot.titulo });
                        } else {
                            anunciosAtivos.unshift(novoSpot);
                            itensSincronizados.push({ ...novoSpot, titulo: rot.titulo });
                        }
                    } else {
                        anunciosAtivos.unshift(novoSpot);
                        itensSincronizados.push({ ...novoSpot, titulo: rot.titulo });
                    }
                } else {
                    anunciosAtivos.unshift(novoSpot);
                    itensSincronizados.push({ ...novoSpot, titulo: rot.titulo });
                }
            }

            renderizarPainelRoteirosIA(itensSincronizados);
            renderizarListaAnuncios();
            prepararFaixa(0, true);
            alert("✅ Playlist criada! Os 5 roteiros foram sincronizados para entrar a cada 1 a 4 músicas.");
        } catch (e) {
            alert("Erro ao gerar playlist: " + e.message);
        } finally {
            btnGerarIA.disabled = false;
            btnGerarIA.textContent = "✨ Gerar Playlist + Locuções Automáticas da Casa";
        }
    };
}
