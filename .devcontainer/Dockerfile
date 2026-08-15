# Dev container image based on Ubuntu 26.04 with zsh + Oh My Zsh + dsh
FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive \
    SHELL=/usr/bin/zsh \
    ZSH=/root/.oh-my-zsh

# Base packages needed for the shell setup.
# build-essential + python3 are required to compile node-pty (native
# dependency of dsh) when no prebuilt binary exists for the platform.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential xz-utils python3 \
        ca-certificates dnsutils \
        curl git zsh vim

# Node.js 22 LTS (required by dsh).
# Detect the CPU arch with uname so this works with both docker buildx and podman build.
RUN arch="$(uname -m)" \
    && case "${arch}" in \
         x86_64) node_arch=x64 ;; \
         aarch64|arm64) node_arch=arm64 ;; \
         *) echo "unsupported architecture: ${arch}" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-${node_arch}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1 \
    && node --version \
    && npm --version

# dsh (DeepSeek Harness) launcher
RUN npm install -g @deepseek-ai/dsh@0.1.0-rc.6 \
    && dsh --version

# Install Oh My Zsh (unattended: skips prompts and shell change)
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Install third-party Oh My Zsh plugins into the custom plugins directory
RUN git clone --depth=1 https://github.com/zsh-users/zsh-autosuggestions.git "${ZSH_CUSTOM:-$ZSH/custom}/plugins/zsh-autosuggestions" \
    && git clone --depth=1 https://github.com/zsh-users/zsh-syntax-highlighting.git "${ZSH_CUSTOM:-$ZSH/custom}/plugins/zsh-syntax-highlighting"

# Enable the avit theme and the git / zsh-autosuggestions / zsh-syntax-highlighting plugins
RUN sed -i 's/^ZSH_THEME=.*/ZSH_THEME="avit"/' /root/.zshrc \
    && sed -i 's/^plugins=(.*)/plugins=(git zsh-autosuggestions zsh-syntax-highlighting)/' /root/.zshrc
