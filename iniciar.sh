#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Carrega .env se existir, senão cria a partir do .env.example
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    if command -v node >/dev/null 2>&1; then
      RANDOM_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
      sed -i "s|JWT_SECRET=.*|JWT_SECRET=${RANDOM_SECRET}|" .env
    fi
    chmod 600 .env
    echo "[info] Arquivo .env criado automaticamente a partir de .env.example."
  else
    echo "[erro] Arquivo .env e .env.example não encontrados."
    exit 1
  fi
fi

# Lê PORT padrão do .env caso não seja passada como argumento
DEFAULT_PORT=$(grep -E '^PORT=' .env | tail -n 1 | cut -d '=' -f2- | tr -d '[:space:]' || true)
DEFAULT_PORT=${DEFAULT_PORT:-8080}

PORT_ARG="${1:-$DEFAULT_PORT}"
FORCE_BUILD="${2:-}"

if ! [[ "$PORT_ARG" =~ ^[0-9]+$ ]] || [ "$PORT_ARG" -lt 1 ] || [ "$PORT_ARG" -gt 65535 ]; then
  echo "[erro] Porta inválida: '$PORT_ARG'. Informe um número entre 1 e 65535."
  echo "Exemplo de uso: ./iniciar.sh 8080"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[erro] Node.js não encontrado. Instale o Node.js 18+ para executar o sistema."
  exit 1
fi

needs_npm_install() {
  local dir="$1"
  [ ! -d "$dir/node_modules" ] && return 0
  [ ! -f "$dir/node_modules/.package-lock.json" ] && return 0
  [ "$dir/package.json" -nt "$dir/node_modules/.package-lock.json" ] && return 0
  [ -f "$dir/package-lock.json" ] && [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ] && return 0
  return 1
}

if needs_npm_install "backend"; then
  echo "[info] Instalando dependências do backend..."
  npm install --prefix backend
fi

# Garante uso de rollup/esbuild em WASM (evita Segmentation fault no Termux/Android)
if needs_npm_install "frontend" || compgen -G "frontend/node_modules/@rollup/rollup-*" >/dev/null || [ -d "frontend/node_modules/@esbuild" ]; then
  echo "[info] Instalando dependências do frontend..."
  rm -rf frontend/node_modules/@rollup/rollup-* frontend/node_modules/@esbuild
  npm install --prefix frontend
fi

if [ ! -f "frontend/dist/index.html" ] || [ "$FORCE_BUILD" = "--build" ]; then
  echo "[info] Compilando interface Web..."
  npm run build --prefix frontend
fi

echo "[info] Iniciando servidor na porta ${PORT_ARG}..."
exec node backend/src/server.js "$PORT_ARG"
