#!/bin/bash

# Keycloak MCP Server Setup Script
# This script helps you set up the Keycloak MCP server for your AI assistant

echo "🚀 Keycloak MCP Server Setup"
echo "================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "18" ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js $(node --version) is installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed!"
    exit 1
fi

# Get the absolute path to the dist/index.js file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_PATH="$SCRIPT_DIR/dist/index.js"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy the following configuration to your AI assistant's MCP config file:"
echo ""

# Detect OS and show appropriate config
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows path format
    WIN_PATH=$(echo "$INDEX_PATH" | sed 's|/mnt/c|C:|' | sed 's|/|\\|g')
    echo "   For Cursor AI (Windows): C:\\Users\\<username>\\.cursor\\mcp.json"
    echo "   {"
    echo "     \"mcpServers\": {"
    echo "       \"keycloak\": {"
    echo "         \"command\": \"node\","
    echo "         \"args\": [\"$WIN_PATH\"],"
    echo "         \"env\": {"
    echo "           \"KEYCLOAK_URL\": \"https://your-keycloak-instance.com\","
    echo "           \"KEYCLOAK_ADMIN\": \"your-admin-username\","
    echo "           \"KEYCLOAK_ADMIN_PASSWORD\": \"your-admin-password\""
    echo "         }"
    echo "       }"
    echo "     }"
    echo "   }"
else
    # Unix/Linux/macOS path format
    echo "   For Cursor AI (macOS/Linux): ~/.cursor/mcp.json"
    echo "   For Claude Desktop (macOS): ~/Library/Application Support/Claude/claude_desktop_config.json"
    echo "   {"
    echo "     \"mcpServers\": {"
    echo "       \"keycloak\": {"
    echo "         \"command\": \"node\","
    echo "         \"args\": [\"$INDEX_PATH\"],"
    echo "         \"env\": {"
    echo "           \"KEYCLOAK_URL\": \"https://your-keycloak-instance.com\","
    echo "           \"KEYCLOAK_ADMIN\": \"your-admin-username\","
    echo "           \"KEYCLOAK_ADMIN_PASSWORD\": \"your-admin-password\""
    echo "         }"
    echo "       }"
    echo "     }"
    echo "   }"
fi

echo ""
echo "2. Replace the environment variables with your actual Keycloak details:"
echo "   - KEYCLOAK_URL: Your Keycloak instance URL"
echo "   - KEYCLOAK_ADMIN: Your Keycloak admin username"
echo "   - KEYCLOAK_ADMIN_PASSWORD: Your Keycloak admin password"
echo ""
echo "3. Restart your AI assistant to load the new configuration"
echo ""
echo "4. Test the connection by asking your AI assistant to:"
echo "   - List all Keycloak realms"
echo "   - List users in a specific realm"
echo ""
echo "🔧 Troubleshooting:"
echo "   - Run 'npm run dev' to test the server locally"
echo "   - Check the README.md for more detailed instructions"
echo ""
echo "Happy coding! 🎯" 