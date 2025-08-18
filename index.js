const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

// ===== CONFIGURAÇÕES =====
const delay = ms => new Promise(res => setTimeout(res, ms));
const modoManutencao = false;

const pathAtendidos = './clientes_atendidos.json';
const SESSION_FOLDER = path.join(__dirname, '.wwebjs_auth');

// Configurações do Puppeteer para ambientes de servidor
const PUPPETEER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu'
];

// Caminho do Chromium (Railway usa o nixpacks.toml)
const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || null;

// Garante que o arquivo de clientes atendidos existe
if (!fs.existsSync(pathAtendidos)) {
    fs.writeFileSync(pathAtendidos, '[]');
}

let atendidos = JSON.parse(fs.readFileSync(pathAtendidos));

// Função para apagar a sessão corrompida
const clearSession = () => {
    console.warn(' Sessão corrompida detectada. Limpando a pasta de cache...');
    if (fs.existsSync(SESSION_FOLDER)) {
        fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
        console.log(' Cache da sessão removido. Por favor, reinicie o bot e escaneie o QR Code novamente.');
    } else {
        console.log(' A pasta de cache não existe. Criando nova sessão.');
    }
};

const initClient = () => {
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: "boreal_bot" }),
        puppeteer: {
            headless: true,
            args: PUPPETEER_ARGS,
            executablePath: EXECUTABLE_PATH // aqui é usado só no Railway
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

    client.on('auth_failure', (msg) => {
        console.error(' Falha na autenticação:', msg);
        clearSession();
        process.exit(1);
    });

    client.on('disconnected', (reason) => {
        console.error(' Cliente desconectado. Motivo:', reason);
        if (reason === 'DISCONNECTED') {
            console.log('Sessão encerrada pelo WhatsApp. Reiniciando o processo...');
            clearSession();
            process.exit(1);
        }
    });

    async function digitar(chat, tempo = 2000) {
        try {
            chat.sendStateTyping();
            await delay(tempo);
        } catch (err) {
            console.error(' Erro ao simular digitação:', err.message);
        }
    }

    client.on('message', async msg => {
        try {
            const texto = msg.body.trim().toLowerCase();
            if (modoManutencao) {
                await client.sendMessage(msg.from, ' Assistente em manutenção. Responderemos em breve.');
                return;
            }
            if (/menu|oi|olá|ola|dia|tarde|noite/.test(texto) && msg.from.endsWith('@c.us')) {
                const chat = await msg.getChat();
                const contact = await msg.getContact();
                const name = contact.pushname || 'cliente';
                await digitar(chat);
                await client.sendMessage(msg.from, `Olá, ${name.split(" ")[0]}! \nSou o assistente virtual da BOREAL.\nComo posso ajudá-lo hoje? Digite o número:\n\n1 Quem somos\n2 Orçamento\n3 Falar com a equipe`);
            }
            if (texto === '1') {
                const chat = await msg.getChat();
                await digitar(chat);
                await client.sendMessage(msg.from, 'A BOREAL nasceu da união entre design, precisão e propósito.\n\nSomos especializados em móveis planejados de alto padrão, com foco em criar ambientes funcionais, elegantes e personalizados.\n\nBOREAL: Design que respeita sua história. Montagem que valoriza seu espaço.\n\nConfira: https://bwmbizqx.manus.space/');
                await delay(2000);
                await client.sendMessage(msg.from, 'Digite 2 para iniciar seu orçamento.');
            }
            if (texto === '2') {
                const chat = await msg.getChat();
                await digitar(chat);
                await client.sendMessage(msg.from, 'Preencha o formulário para obter seu orçamento:');
                await delay(1500);
                await client.sendMessage(msg.from, 'https://docs.google.com/forms/d/e/1FAIpQLSc0vd1eigdgQYfgWTc8Lx1E592vFRDLje5h-RXQ9TzWZYKbNA/viewform');
                if (!atendidos.find(c => c.numero === msg.from)) {
                    atendidos.push({ numero: msg.from, data: new Date().toISOString(), followupEnviado: false });
                    fs.writeFileSync(pathAtendidos, JSON.stringify(atendidos, null, 2));
                }
            }
            if (texto === '3') {
                const chat = await msg.getChat();
                await digitar(chat);
                await client.sendMessage(msg.from, 'Ainda com dúvidas? Fale com nossa equipe:');
                await delay(1500);
                await client.sendMessage(msg.from, 'https://wa.link/srhfro');
            }
            if (texto.includes('prazo')) {
                await client.sendMessage(msg.from, 'Prazo: até 5 dias úteis após envio das informações.');
            }
            if (texto.includes('cidade') || texto.includes('local') || texto.includes('atendem')) {
                await client.sendMessage(msg.from, 'Sim! Atendemos outras cidades. Consulte custos de deslocamento.');
            }
            if (texto.includes('pagamento')) {
                await client.sendMessage(msg.from, 'Aceitamos cartões, transferências e boletos.');
            }
        } catch (err) {
            console.error('X Erro no processamento da mensagem:', err.message);
        }
    });

    setInterval(async () => {
        const agora = new Date();
        for (const cliente of atendidos) {
            if (cliente.followupEnviado) continue;
            const diasPassados = Math.floor((agora - new Date(cliente.data)) / (1000 * 60 * 60 * 24));
            if (diasPassados >= 5) {
                try {
                    await client.sendMessage(cliente.numero, 'Olá! Como foi sua experiência com a BOREAL? Sua opinião é muito importante.');
                    cliente.followupEnviado = true;
                    fs.writeFileSync(pathAtendidos, JSON.stringify(atendidos, null, 2));
                } catch (err) {
                    console.error('X Erro no envio de follow-up: ', err.message);
                }
            }
        }
    }, 3600000);

    return client;
};

process.on('unhandledRejection', err => {
    console.error(' Erro não tratado:', err.message);
    clearSession();
    process.exit(1);
});

initClient().initialize().catch(err => {
    console.error('X Erro fatal na inicialização do bot:', err.message);
    clearSession();
    process.exit(1);
});
