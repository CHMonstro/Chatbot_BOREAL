const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, NoAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Conecta no Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Erro: SUPABASE_URL ou SUPABASE_KEY não foram definidos no arquivo .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Funções para salvar/carregar sessão no Supabase
async function saveSession(sessionId, sessionData) {
    const { error } = await supabase
        .from('whatsapp_sessions')
        .upsert({ id: sessionId, session_data: sessionData, updated_at: new Date() });

    if (error) console.error('Erro ao salvar sessão:', error.message);
    else console.log('Sessão salva no Supabase com sucesso.');
}

async function loadSession(sessionId) {
    const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('id', sessionId)
        .single();

    if (error && error.code === 'PGRST116') {
        console.warn('Nenhuma sessão encontrada. Gerando novo QR Code...');
        return null;
    }
    if (error) {
        console.error('Erro ao carregar sessão:', error.message);
        return null;
    }
    return data.session_data;
}

// Funções para gerenciar clientes atendidos no Supabase
async function saveClient(clientData) {
    const { error } = await supabase
        .from('clientes_atendidos')
        .upsert(clientData, { onConflict: 'numero' });
    if (error) console.error('Erro ao salvar cliente atendido:', error.message);
}

async function getClientsToFollowUp() {
    const now = new Date();
    const fiveDaysAgo = new Date(now.setDate(now.getDate() - 5)).toISOString();
    const { data, error } = await supabase
        .from('clientes_atendidos')
        .select('*')
        .eq('followup_enviado', false)
        .lte('data', fiveDaysAgo);
    if (error) {
        console.error('Erro ao buscar clientes para follow-up:', error.message);
        return [];
    }
    return data;
}

// ===== CONFIGURAÇÕES E INICIALIZAÇÃO =====
const delay = ms => new Promise(res => setTimeout(res, ms));
const modoManutencao = false;
const SESSION_ID = "boreal_bot";

const PUPPETEER_ARGS = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
    '--single-process', '--disable-gpu'
];

const initClient = async () => {
    // Carrega a sessão do Supabase antes de inicializar o cliente
    const sessionData = await loadSession(SESSION_ID);

    const client = new Client({
        // Adiciona a sessão carregada e a estratégia NoAuth
        session: sessionData,
        authStrategy: new NoAuth(), 
        puppeteer: {
            headless: true,
            args: PUPPETEER_ARGS,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
        }
    });

    // ===== EVENTOS =====
    client.on('qr', qr => {
        console.log(" Escaneie este QR Code no WhatsApp da empresa:");
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log(`✓ Bot conectado e pronto! ${new Date().toLocaleString()}`);
    });

    client.on('authenticated', (session) => {
        // Salva a sessão no Supabase após a autenticação
        saveSession(SESSION_ID, session);
    });

    client.on('auth_failure', (msg) => {
        console.error(' Falha na autenticação:', msg);
        process.exit(1);
    });

    client.on('disconnected', (reason) => {
        console.error(' Cliente desconectado. Motivo:', reason);
        if (reason === 'DISCONNECTED' || reason === 'UNLAUNCHED') {
            console.log('Sessão encerrada pelo WhatsApp. Reiniciando o processo...');
            process.exit(1);
        }
    });

    async function digitar(chat, tempo = 2000) {
        try {
            await chat.sendStateTyping();
            await delay(tempo);
            await chat.clearState();
        } catch (err) {
            console.error(' Erro ao simular digitação:', err.message);
        }
    }

    client.on('message', async msg => {
        // ... [O restante do seu código de mensagens permanece o mesmo] ...
        try {
            const texto = msg.body.trim().toLowerCase();
            if (modoManutencao) {
                await client.sendMessage(msg.from, 'Assistente em manutenção. Responderemos em breve.');
                return;
            }

            const chat = await msg.getChat();
            const contact = await msg.getContact();
            const name = contact.pushname || 'cliente';

            if (/menu|oi|olá|ola|dia|tarde|noite/.test(texto) && msg.from.endsWith('@c.us')) {
                await digitar(chat);
                await client.sendMessage(msg.from, `Olá, ${name.split(" ")[0]}! \nSou o assistente virtual da BOREAL.\nComo posso ajudá-lo hoje? Digite o número:\n\n1 Quem somos\n2 Orçamento\n3 Falar com a equipe`);
            } else if (texto === '1') {
                await digitar(chat);
                await client.sendMessage(msg.from, 'A BOREAL nasceu da união entre design, precisão e propósito.\n\nSomos especializados em móveis planejados de alto padrão, com foco em criar ambientes funcionais, elegantes e personalizados.\n\nBOREAL: Design que respeita sua história. Montagem que valoriza seu espaço.\n\nConfira: https://bwmbizqx.manus.space/');
                await delay(2000);
                await client.sendMessage(msg.from, 'Digite 2 para iniciar seu orçamento.');
            } else if (texto === '2') {
                await digitar(chat);
                await client.sendMessage(msg.from, 'Preencha o formulário para obter seu orçamento:');
                await delay(1500);
                await client.sendMessage(msg.from, 'https://docs.google.com/forms/d/e/1FAIpQLSc0vd1eigdgQYfgWTc8Lx1E592vFRDLje5h-RXQ9TzWZYKbNA/viewform');
                await saveClient({ numero: msg.from, data: new Date().toISOString(), followup_enviado: false });
            } else if (texto === '3') {
                await digitar(chat);
                await client.sendMessage(msg.from, 'Ainda com dúvidas? Fale com nossa equipe:');
                await delay(1500);
                await client.sendMessage(msg.from, 'https://wa.link/srhfro');
            } else if (texto.includes('prazo')) {
                await client.sendMessage(msg.from, 'Prazo: até 5 dias úteis após envio das informações.');
            } else if (texto.includes('cidade') || texto.includes('local') || texto.includes('atendem')) {
                await client.sendMessage(msg.from, 'Sim! Atendemos outras cidades. Consulte custos de deslocamento.');
            } else if (texto.includes('pagamento')) {
                await client.sendMessage(msg.from, 'Aceitamos cartões, transferências e boletos.');
            }
        } catch (err) {
            console.error('X Erro no processamento da mensagem:', err.message);
        }
    });

    // Lógica para follow-up dos clientes
    setInterval(async () => {
        try {
            const clientes = await getClientsToFollowUp();
            for (const cliente of clientes) {
                await client.sendMessage(cliente.numero, 'Olá! Como foi sua experiência com a BOREAL? Sua opinião é muito importante.');
                await supabase.from('clientes_atendidos').update({ followup_enviado: true }).eq('numero', cliente.numero);
            }
        } catch (err) {
            console.error('X Erro no envio de follow-up: ', err.message);
        }
    }, 3600000);

    return client;
};

process.on('unhandledRejection', err => {
    console.error(' Erro não tratado:', err);
    process.exit(1);
});

initClient()
    .then(client => client.initialize())
    .catch(err => {
        console.error('X Erro fatal na inicialização do bot:', err.message);
        process.exit(1);
    });