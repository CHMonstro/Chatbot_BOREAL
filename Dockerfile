FROM node:18-alpine

# Instala dependências do Chromium
RUN apk add --no-cache     chromium     nss     freetype     harfbuzz     ca-certificates     ttf-freefont

# Define pasta de trabalho
WORKDIR /app

# Copia arquivos de dependências primeiro
COPY package*.json ./

# Evita baixar Chromium extra
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --omit=dev

# Copia o restante do código
COPY . .

# Força Puppeteer a usar Chromium do sistema
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Comando para iniciar
CMD ["npm", "start"]
