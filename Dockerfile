# Utilise une base Debian Slim (très stable) au lieu d'Alpine
FROM node:20-slim

# Combined apt-get updates into a single layer to save space and install ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 3. Copier et installer les dépendances Python
COPY requirements.txt ./
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# 4. Copier et installer les dépendances Node de la racine
COPY package.json package-lock.json ./
RUN npm set strict-ssl false && npm install --verbose

# 5. Copier et installer les dépendances du dossier frontend
# FIX: Use COPY with the target path and explicitly use --prefix for npm
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm set strict-ssl false && npm install --prefix frontend --verbose

# 6. Copier le reste du code source
COPY . .

# Add start script and make executable
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Exposer le port de ton API Back (8001)
EXPOSE 8001

# Lancer la commande qui démarre tout d'un coup (via start.sh)
CMD ["/start.sh"]