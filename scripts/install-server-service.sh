#!/usr/bin/env bash
# Run once to set up the BetOnMe server as a persistent systemd user service
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Setting up BetOnMe server service..."
echo "Project dir: $PROJECT_DIR"

mkdir -p "$HOME/.config/systemd/user"

cat > "$HOME/.config/systemd/user/betonme-server.service" << UNIT
[Unit]
Description=BetOnMe Save Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which node) server.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable betonme-server
systemctl --user start betonme-server

# Enable lingering so service starts on boot without login
loginctl enable-linger "$USER" 2>/dev/null || true

echo ""
echo "✅ betonme-server installed and running"
echo "   Status:  systemctl --user status betonme-server"
echo "   Logs:    journalctl --user -u betonme-server -f"
echo "   Restart: systemctl --user restart betonme-server"
