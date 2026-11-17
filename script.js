/* =================================================================
   ORCA SONORA - SCRIPT PRINCIPAL (script.js)
   Organizado em 4 módulos independentes para fácil manutenção.
================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    iniciarPlayerCapa();
    iniciarExemplosDeVoz();
    iniciarSistemaDeModais();
});


/* =================================================================
   MÓDULO 01: SIMULADOR DO PLAYER AO VIVO NA CAPA (HERO)
   Faz o relógio andar e simula a entrada do Locutor IA sobre a música.
================================================================== */
function iniciarPlayerCapa() {
    const progressBar = document.querySelector(".progress-bar");
    const currentTimeEl = document.getElementById("current-time");
    const totalTimeEl = document.getElementById("total-time");
    const statusBadge = document.getElementById("player-status");
    const trackTitle = document.getElementById("track-title");
    const trackArtist = document.getElementById("track-artist");

    if (!progressBar || !currentTimeEl) return;

    // Lista simulada de programação da rádio
    const programacao = [
        { titulo: "Been By Now", artista: "Morgan Wallen", duracao: 213, locutor: false },
        { titulo: "Locução IA • Oferta Combo Corte + Barba", artista: "Orca Sonora Voz Neural", duracao: 18, locutor: true },
        { titulo: "Blinding Lights (Acoustic Lounge)", artista: "The Weeknd", duracao: 195, locutor: false }
    ];

    let faixaAtual = 0;
    let segundoAtual = 141; // Começa em 2:21 como no seu layout

    function formatarTempo(segundos) {
        const min = Math.floor(segundos / 60);
        const seg = segundos % 60;
        return `${min}:${seg < 10 ? "0" : ""}${seg}`;
    }

    function atualizarInterface() {
        const item = programacao[faixaAtual];
        const porcentagem = Math.min((segundoAtual / item.duracao) * 100, 100);

        progressBar.style.width = `${porcentagem}%`;
        currentTimeEl.textContent = formatarTempo(segundoAtual);
        totalTimeEl.textContent = formatarTempo(item.duracao);
        trackTitle.textContent = item.titulo;
        trackArtist.textContent = item.artista;

        if (item.locutor) {
            statusBadge.innerHTML = `<span class="pulse-dot" style="background-color:#050505;"></span> Locutor Falando (Ducking Ativo)`;
            statusBadge.style.backgroundColor = "#ffffff";
            statusBadge.style.color = "#050505";
        } else {
            statusBadge.innerHTML = `<span class="pulse-dot"></span> Música no Ar`;
            statusBadge.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
            statusBadge.style.color = "#ffffff";
        }
    }

    // Atualiza a cada 1 segundo
    setInterval(() => {
        segundoAtual++;
        if (segundoAtual >= programacao[faixaAtual].duracao) {
            segundoAtual = 0;
            faixaAtual = (faixaAtual + 1) % programacao.length;
        }
        atualizarInterface();
    }, 1000);
}


/* =================================================================
   MÓDULO 02: REPRODUTOR DE EXEMPLOS DE LOCUÇÃO (VOZ DO NAVEGADOR)
   Lê os textos dos cards em português quando o usuário clica em Ouvir.
================================================================== */
function iniciarExemplosDeVoz() {
    const botoesPlay = document.querySelectorAll(".btn-play-sample");
    let botaoAtivo = null;

    botoesPlay.forEach((botao) => {
        botao.addEventListener("click", () => {
            if (!("speechSynthesis" in window)) {
                alert("Seu navegador não suporta reprodução de voz automática.");
                return;
            }

            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                resetarBotoes();
                if (botaoAtivo === botao) {
                    botaoAtivo = null;
                    return;
                }
            }

            const card = botao.closest(".script-card");
            const textoRoteiro = card.querySelector("blockquote").textContent.replace(/[“”]/g, "");

            const fala = new SpeechSynthesisUtterance(textoRoteiro);
            fala.lang = "pt-BR";
            fala.rate = 1.05;
            fala.pitch = 1.0;

            botao.textContent = "⏹ Parar áudio";
            botao.style.backgroundColor = "#0a0a0a";
            botao.style.borderColor = "#0a0a0a";
            botao.style.color = "#ffffff";
            botaoAtivo = botao;

            fala.onend = () => {
                resetarBotoes();
                botaoAtivo = null;
            };

            window.speechSynthesis.speak(fala);
        });
    });

    function resetarBotoes() {
        botoesPlay.forEach((btn) => {
            btn.textContent = "▶ Ouvir exemplo";
            btn.style.backgroundColor = "";
            btn.style.borderColor = "";
            btn.style.color = "";
        });
    }
}


/* =================================================================
   MÓDULO 03: MODAIS DE CADASTRO (TESTE GRÁTIS 7 DIAS) E LOGIN
================================================================== */
function iniciarSistemaDeModais() {
    const modalContainer = document.getElementById("modal-container");
    const btnLogin = document.getElementById("btn-login");

    const estiloModal = document.createElement("style");
    estiloModal.textContent = `
        .orca-modal-overlay {
            position: fixed; inset: 0; background: rgba(5, 5, 5, 0.8);
            display: flex; align-items: center; justify-content: center;
            z-index: 999; padding: 20px; backdrop-filter: blur(4px);
        }
        .orca-modal-box {
            background: #ffffff; color: #0a0a0a; width: 100%; max-width: 460px;
            border-radius: 16px; padding: 32px; position: relative;
            border: 1px solid #e5e5e5;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: modalFadeIn 0.2s ease-out;
        }
        @keyframes modalFadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .orca-modal-close {
            position: absolute; top: 16px; right: 18px; background: none;
            border: none; font-size: 1.5rem; cursor: pointer; color: #525252;
        }
        .orca-form-group { margin-bottom: 16px; text-align: left; }
        .orca-form-group label {
            display: block; font-size: 0.88rem; font-weight: 700; margin-bottom: 6px;
        }
        .orca-form-group input, .orca-form-group select {
            width: 100%; padding: 12px; border: 1px solid #d4d4d4;
            border-radius: 8px; font-size: 0.95rem; font-family: inherit;
        }
        .orca-form-group input:focus, .orca-form-group select:focus {
            outline: none; border-color: #0a0a0a;
        }
    `;
    document.head.appendChild(estiloModal);

    document.querySelectorAll("[data-plan]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const planoEscolhido = btn.getAttribute("data-plan");
            abrirModalCadastro(planoEscolhido);
        });
    });

    if (btnLogin) {
        btnLogin.addEventListener("click", (e) => {
            e.preventDefault();
            abrirModalLogin();
        });
    }

    function abrirModalCadastro(plano = "lite") {
        modalContainer.innerHTML = `
            <div class="orca-modal-overlay" id="fechar-overlay">
                <div class="orca-modal-box">
                    <button class="orca-modal-close" id="fechar-modal">&times;</button>
                    <span class="pill-badge" style="margin-bottom:8px; background:#0a0a0a; color:#ffffff;">7 dias grátis · Sem cartão</span>
                    <h2 style="font-size:1.5rem; margin-bottom:6px;">Crie a rádio do seu negócio</h2>
                    <p style="color:#525252; font-size:0.9rem; margin-bottom:20px;">
                        Configure seu salão ou barbearia em menos de 1 minuto.
                    </p>

                    <form id="form-cadastro-orca">
                        <div class="orca-form-group">
                            <label>Nome do Salão ou Barbearia</label>
                            <input type="text" id="nome-empresa" placeholder="Ex: Barbearia Navalha de Ouro" required>
                        </div>

                        <div class="orca-form-group">
                            <label>Estilo principal da casa</label>
                            <select id="estilo-casa">
                                <option value="barbearia_rock_hiphop">Barbearia (Rock, Hip Hop e Clássicos)</option>
                                <option value="salao_relaxante">Salão de Beleza (Lounge, Pop Leve e Relaxante)</option>
                                <option value="estetica_sofisticado">Clínica de Estética / Spa (Instrumental Sofisticado)</option>
                                <option value="misto_animado">Unissex / Ambiente Animado (Hits Atuais)</option>
                            </select>
                        </div>

                        <div class="orca-form-group">
                            <label>Seu E-mail</label>
                            <input type="email" id="email-cliente" placeholder="voce@seusalao.com.br" required>
                        </div>

                        <div class="orca-form-group">
                            <label>WhatsApp</label>
                            <input type="tel" id="whatsapp-cliente" placeholder="(62) 99999-9999" required>
                        </div>

                        <div class="orca-form-group">
                            <label>Plano selecionado</label>
                            <select id="plano-selecionado">
                                <option value="lite" ${plano === "lite" ? "selected" : ""}>Lite — 1 local (R$ 64,90/mês após 7 dias)</option>
                            </select>
                        </div>

                        <button type="submit" class="btn-primary btn-block" style="padding:14px; font-size:1rem;">
                            Ativar meus 7 dias grátis agora
                        </button>
                    </form>
                </div>
            </div>
        `;

        configurarFechamentoModal();

        document.getElementById("form-cadastro-orca").addEventListener("submit", async (e) => {
            e.preventDefault();

            const dadosNovoCliente = {
                empresa: document.getElementById("nome-empresa").value,
                estilo: document.getElementById("estilo-casa").value,
                email: document.getElementById("email-cliente").value,
                whatsapp: document.getElementById("whatsapp-cliente").value,
                plano: document.getElementById("plano-selecionado").value,
                dataCadastro: new Date().toISOString(),
                statusTrial: "ativo_7_dias"
            };

            await salvarNoBancoDeDados(dadosNovoCliente);

            modalContainer.innerHTML = `
                <div class="orca-modal-overlay" id="fechar-overlay">
                    <div class="orca-modal-box" style="text-align:center;">
                        <div style="font-size:3rem; margin-bottom:12px;">🐋</div>
                        <h2 style="margin-bottom:8px;">Rádio criada com sucesso!</h2>
                        <p style="color:#525252; margin-bottom:24px;">
                            A rádio da <strong>${dadosNovoCliente.empresa}</strong> já está pré-configurada. 
                            Na próxima etapa conectaremos este passo diretamente ao seu Painel do Player!
                        </p>
                        <button class="btn-primary btn-block" id="fechar-modal">Concluir</button>
                    </div>
                </div>
            `;
            configurarFechamentoModal();
        });
    }

    function abrirModalLogin() {
        modalContainer.innerHTML = `
            <div class="orca-modal-overlay" id="fechar-overlay">
                <div class="orca-modal-box">
                    <button class="orca-modal-close" id="fechar-modal">&times;</button>
                    <h2 style="font-size:1.5rem; margin-bottom:6px;">Acessar minha Rádio</h2>
                    <p style="color:#525252; font-size:0.9rem; margin-bottom:20px;">
                        Entre para abrir o player da loja ou gerenciar seus anúncios.
                    </p>
                    <form id="form-login-orca">
                        <div class="orca-form-group">
                            <label>E-mail cadastrado</label>
                            <input type="email" required placeholder="seu@email.com">
                        </div>
                        <div class="orca-form-group">
                            <label>Senha</label>
                            <input type="password" required placeholder="••••••••">
                        </div>
                        <button type="submit" class="btn-primary btn-block" style="padding:14px;">Entrar no Painel</button>
                    </form>
                </div>
            </div>
        `;
        configurarFechamentoModal();
    }

    function configurarFechamentoModal() {
        const btnFechar = document.getElementById("fechar-modal");
        const overlay = document.getElementById("fechar-overlay");

        if (btnFechar) btnFechar.onclick = () => (modalContainer.innerHTML = "");
        if (overlay) {
            overlay.onclick = (e) => {
                if (e.target === overlay) modalContainer.innerHTML = "";
            };
        }
    }
}


/* =================================================================
   MÓDULO 04: CONEXÃO REAL COM O BANCO DE DADOS SUPABASE
================================================================== */
const SUPABASE_URL = "https://hffnxblzvathjtedoyoz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PETXg6auyEFgcWYd1rR4rA_F1G5EHwA";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function salvarNoBancoDeDados(dados) {
    const limitesPorPlano = {
        lite: 1,
        basic: 2,
        redes: 6
    };

    const { error } = await supabaseClient
        .from("empresas")
        .insert([
            {
                nome_empresa: dados.empresa,
                estilo_musical: dados.estilo,
                email: dados.email,
                whatsapp: dados.whatsapp,
                plano: dados.plano,
                limite_locais: limitesPorPlano[dados.plano] || 1
            }
        ]);

    if (error) {
        console.error("❌ Erro detalhado do Supabase:", error);
        alert("Erro do banco: " + error.message);
        throw error;
    }

    console.log("✅ Cliente salvo no Supabase com sucesso!");
}