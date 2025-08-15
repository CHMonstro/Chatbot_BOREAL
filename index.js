const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

const delay = ms => new Promise(res => setTimeout(res, ms));
const modoManutencao = false;

const pathAtendidos = './clientes_atendidos.json';
const SESSION_FOLDER = path.join(__dirname, '.wwebjs_auth');

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

if (!fs.existsSync(pathAtendidos)) {
    fs.writeFileSync(pathAtendidos, '[]');
}
let atendidos = JSON.parse(fs.readFileSync(pathAtendidos));

const clearSession = () => {
    console.warn('⚠️ Sessão corrompida detectada. Limpando cache...');
    if (fs.existsSync(SESSION_FOLDER)) {
        fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
        console.log('✅ Cache removido. Reinicie e escaneie o QR Code.');
    }
};

const initClient = () => {
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: "boreal_bot" }),
        puppeteer: {
            headless: true,
            args: PUPPETEER_ARGS,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
        }
    });

    client.on('qr', qr => {
        console.log("📲 Escaneie o QR Code:");
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log(`✅ Bot conectado! ${new Date().toLocaleString()}`);
    });

    client.on('auth_failure', msg => {
        console.error('❌ Falha de autenticação:', msg);
        clearSession();
        setTimeout(() => initClient().initialize(), 5000);
    });

    client.on('disconnected', reason => {
        console.error('⚠️ Cliente desconectado:', reason);
        clearSession();
        setTimeout(() => initClient().initialize(), 5000);
    });

    async function digitar(chat, tempo = 2000) {
        try {
            chat.sendStateTyping();
            await delay(tempo);
        } catch (err) {
            console.error('⚠️ Erro ao simular digitação:', err.message);
        }
    }

    client.on('message', async msg => {
        try {
            const texto = msg.body.trim().toLowerCase();
            if (modoManutencao) {
                await client.sendMessage(msg.from, '🚧 Assistente em manutenção.');
                return;
            }
            if (/menu|oi|olá|ola|dia|tarde|noite/.test(texto) && msg.from.endsWith('@c.us')) {
                const chat = await msg.getChat();
                const contact = await msg.getContact();
                const name = contact.pushname || 'cliente';
                await digitar(chat);
                await client.sendMessage(msg.from, `Olá, ${name.split(" ")[0]}! \nSou o assistente virtual da BOREAL.\nComo posso ajudá-lo hoje? Digite:\n\n1 Quem somos\n2 Orçamento\n3 Falar com a equipe`);
            }
            if (texto === '1') {
                const chat = await msg.getChat();
                await digitar(chat);
                await client.sendMessage(msg.from, 'A BOREAL nasceu da união entre design e precisão...\nConfira: https://bwmbizqx.manus.space/');
                await delay(2000);
                await client.sendMessage(msg.from, 'Digite 2 para iniciar seu orçamento.');
            }
            if (texto === '2') {
                const chat = await msg.getChat();
                await digitar(chat);
                await client.sendMessage(msg.from, 'Preencha o formulário para orçamento:');
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
                await client.sendMessage(msg.from, 'Fale com nossa equipe: https://wa.link/srhfro');
            }
        } catch (err) {
            console.error('❌ Erro na mensagem:', err.message);
        }
    });

    setInterval(async () => {
        const agora = new Date();
        for (const cliente of atendidos) {
            if (cliente.followupEnviado) continue;
            const diasPassados = Math.floor((agora - new Date(cliente.data)) / (1000 * 60 * 60 * 24));
            if (diasPassados >= 5) {
                try {
                    await client.sendMessage(cliente.numero, 'Olá! Como foi sua experiência com a BOREAL?');
                    cliente.followupEnviado = true;
                    fs.writeFileSync(pathAtendidos, JSON.stringify(atendidos, null, 2));
                } catch (err) {
                    console.error('❌ Erro no follow-up: ', err.message);
                }
            }
        }
    }, 3600000);

    client.initialize();
    return client;
};

process.on('unhandledRejection', err => {
    console.error('❌ Erro não tratado:', err.message);
});

initClient();
