# Dev container image based on Ubuntu 26.04 with zsh + Oh My Zsh + dsh
FROM ubuntu:26.04

# 安装基础组件
RUN DEBIAN_FRONTEND=noninteractive apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        tzdata build-essential xz-utils python3 \
        ca-certificates dnsutils \
        curl git zsh vim gnupg pinentry-curses jq ssh

ENV LC_ALL=C.utf8

# 安装 Node.js 22 LTS (required by dsh).
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

# 安装 DeepSeek Harness
RUN npm install -g @deepseek-ai/dsh \
    && dsh --version

ENV SHELL=/usr/bin/zsh
ENV ZSH=/root/.oh-my-zsh

# 安装 oh-my-zsh
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended \
    && git clone --depth=1 https://github.com/zsh-users/zsh-autosuggestions.git "${ZSH_CUSTOM:-$ZSH/custom}/plugins/zsh-autosuggestions" \
    && git clone --depth=1 https://github.com/zsh-users/zsh-syntax-highlighting.git "${ZSH_CUSTOM:-$ZSH/custom}/plugins/zsh-syntax-highlighting"
COPY .zshrc "/root/.zshrc"

COPY entrypoint.sh /entrypoint.sh
CMD ["/entrypoint.sh"]
