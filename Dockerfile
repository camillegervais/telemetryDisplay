# Utilise une base Debian Slim (très stable) au lieu d'Alpine
FROM node:20-slim

# Installer Python 3 et pip via apt
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# 3. Copier et installer les dépendances Python
COPY requirements.txt ./
# Crée un environnement virtuel interne à Docker pour respecter les normes Python récentes
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# 4. Copier et installer les dépendances Node de la racine (Optimisé)
COPY package.json ./
RUN npm install

# 5. Copier et installer les dépendances du dossier frontend (Optimisé)
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install

# 3. Copier le reste du code source (racine + frontend)
COPY . .

# Exposer le port de ton API Back (8001) et éventuellement le port du Front (ex: 5173 ou 3000)
EXPOSE 8001

# Lancer la commande qui démarre tout d'un coup
CMD ["npm", "run", "dev"]