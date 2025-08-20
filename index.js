const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Conecta no Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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

const client = new Client({
    // Usa a estratégia LocalAuth, que cuida de salvar e carregar a sessão automaticamente em um arquivo
    authStrategy: new LocalAuth({
        clientId: SESSION_ID,
        dataPath: './.wwebjs_auth'
    }),
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

client.on('authenticated', () => {
    console.log('Autenticado com sucesso. Sessão salva localmente.');
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

client.initialize().catch(err => {
    console.error('X Erro fatal na inicialização do bot:', err.message);
    process.exit(1);
});