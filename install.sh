#!/usr/bin/env bash
#
# Magic Shell Installer
# https://github.com/austin-thesing/magic-shell
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/austin-thesing/magic-shell/main/install.sh | bash
#
# Environment variables:
#   MAGIC_SHELL_INSTALL_DIR - Installation directory (default: ~/.magic-shell/bin)
#   MAGIC_SHELL_VERSION     - Specific version to install (default: latest)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO="austin-thesing/magic-shell"
INSTALL_DIR="${MAGIC_SHELL_INSTALL_DIR:-$HOME/.magic-shell/bin}"
VERSION="${MAGIC_SHELL_VERSION:-latest}"

# Detect OS and architecture
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *)       error "Unsupported operating system: $(uname -s)" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)  arch="x64" ;;
        arm64|aarch64) arch="arm64" ;;
        *)             error "Unsupported architecture: $(uname -m)" ;;
    esac

    echo "${os}-${arch}"
}

# Print functions
info() {
    echo -e "${BLUE}info${NC}  $1"
}

success() {
    echo -e "${GREEN}success${NC}  $1"
}

warn() {
    echo -e "${YELLOW}warn${NC}  $1"
}

error() {
    echo -e "${RED}error${NC}  $1" >&2
    exit 1
}

# Check for required commands
check_dependencies() {
    local missing=()

    for cmd in curl tar; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing[*]}"
    fi
}

# Get the latest version from GitHub
get_latest_version() {
    local version
    version=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    
    if [[ -z "$version" ]]; then
        error "Failed to fetch latest version"
    fi
    
    echo "$version"
}

# Download and install
install() {
    local platform version download_url tmp_dir

    info "Detecting platform..."
    platform=$(detect_platform)
    info "Platform: $platform"

    if [[ "$VERSION" == "latest" ]]; then
        info "Fetching latest version..."
        version=$(get_latest_version)
    else
        version="$VERSION"
    fi
    info "Version: $version"

    # Create temp directory
    tmp_dir=$(mktemp -d)
    trap "rm -rf $tmp_dir" EXIT

    # Download URL (adjust based on your release asset naming)
    download_url="https://github.com/${REPO}/releases/download/${version}/magic-shell-${version}-${platform}.tar.gz"
    
    info "Downloading from $download_url..."
    if ! curl -fsSL "$download_url" -o "$tmp_dir/magic-shell.tar.gz"; then
        # Fallback: try npm install if binary not available
        warn "Binary release not found, falling back to npm install..."
        install_via_npm
        return
    fi

    info "Extracting..."
    tar -xzf "$tmp_dir/magic-shell.tar.gz" -C "$tmp_dir"

    info "Installing to $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    cp "$tmp_dir/magic-shell" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/magic-shell"

    # Create symlinks
    ln -sf "$INSTALL_DIR/magic-shell" "$INSTALL_DIR/msh"
    ln -sf "$INSTALL_DIR/magic-shell" "$INSTALL_DIR/ms"

    success "Installed magic-shell $version to $INSTALL_DIR"
    
    setup_path
}

# Fallback to npm installation
install_via_npm() {
    info "Installing via npm..."
    
    if command -v bun &> /dev/null; then
        info "Using bun..."
        bun add -g @austinthesing/magic-shell
    elif command -v npm &> /dev/null; then
        info "Using npm..."
        npm install -g @austinthesing/magic-shell
    elif command -v yarn &> /dev/null; then
        info "Using yarn..."
        yarn global add @austinthesing/magic-shell
    elif command -v pnpm &> /dev/null; then
        info "Using pnpm..."
        pnpm add -g @austinthesing/magic-shell
    else
        error "No package manager found. Please install Node.js/npm, Bun, Yarn, or pnpm first."
    fi
    
    success "Installed @austinthesing/magic-shell via npm"
}

# Add to PATH
setup_path() {
    local shell_profile=""
    local path_export="export PATH=\"\$PATH:$INSTALL_DIR\""

    # Detect shell and profile file
    case "${SHELL:-/bin/bash}" in
        */bash)
            if [[ -f "$HOME/.bashrc" ]]; then
                shell_profile="$HOME/.bashrc"
            elif [[ -f "$HOME/.bash_profile" ]]; then
                shell_profile="$HOME/.bash_profile"
            fi
            ;;
        */zsh)
            shell_profile="$HOME/.zshrc"
            ;;
        */fish)
            shell_profile="$HOME/.config/fish/config.fish"
            path_export="set -gx PATH \$PATH $INSTALL_DIR"
            ;;
    esac

    # Check if already in PATH
    if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
        info "Already in PATH"
        return
    fi

    if [[ -n "$shell_profile" ]]; then
        # Check if already added to profile
        if [[ -f "$shell_profile" ]] && grep -q "magic-shell" "$shell_profile" 2>/dev/null; then
            info "PATH already configured in $shell_profile"
        else
            echo "" >> "$shell_profile"
            echo "# Magic Shell" >> "$shell_profile"
            echo "$path_export" >> "$shell_profile"
            info "Added to PATH in $shell_profile"
        fi
    fi

    echo ""
    success "Installation complete!"
    echo ""
    echo "To get started:"
    echo "  1. Restart your terminal or run:"
    if [[ "${SHELL:-}" == */fish ]]; then
        echo "     source $shell_profile"
    else
        echo "     source $shell_profile"
    fi
    echo ""
    echo "  2. Set up your API key:"
    echo "     msh --setup"
    echo ""
    echo "  3. Try it out:"
    echo "     msh \"list all files\""
    echo ""
}

# Main
main() {
    echo ""
    echo -e "${BLUE}Magic Shell Installer${NC}"
    echo ""

    check_dependencies
    install
}

main "$@"
