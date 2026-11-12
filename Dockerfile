# Aarogya Drishti — same-origin Express API + React SPA
# Build context: repository root

# ---------- Stage 1: frontend production build ----------
FROM node:20-bookworm-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

ENV REACT_APP_API_URL=/api
ENV CI=false
ENV GENERATE_SOURCEMAP=false

RUN npm run build

# ---------- Stage 2: backend runtime + SPA ----------
FROM node:20-bookworm-slim AS backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Application code (includes Real-ESRGAN ONNX weights under models/)
COPY backend/ ./

# Never ship local patient photo directories into the image
RUN rm -rf ./storage \
  && mkdir -p ./storage \
  && printf '%s\n' \
    'Patient images must use private Supabase Storage in production.' \
    'Do not store PHI in this container filesystem.' \
    > ./storage/README.md

# CRA build must sit at ../frontend/build relative to backend/
COPY --from=frontend-build /app/frontend/build /app/frontend/build

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Uses package.json "start": "node server.js"
CMD ["npm", "start"]
