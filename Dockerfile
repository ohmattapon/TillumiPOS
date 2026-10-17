# One image for the API and the built web app: the API serves the web files itself (see web.plugin.ts).
FROM oven/bun:1

WORKDIR /repo

# Dependencies first, so a change to the code does not reinstall them.
COPY package.json bun.lock bunfig.toml ./
COPY workers/media/package.json workers/media/
COPY workers/cloud/package.json workers/cloud/
RUN bun install --frozen-lockfile

COPY . .
RUN bunx vite build
# The checkout may have Windows line endings; a script with them cannot run.
RUN sed -i 's/\r$//' docker/entrypoint.sh && chmod +x docker/entrypoint.sh

ENV NODE_ENV=production \
    WEB_DIST=/repo/dist \
    PORT=3000
EXPOSE 3000
ENTRYPOINT ["/repo/docker/entrypoint.sh"]
