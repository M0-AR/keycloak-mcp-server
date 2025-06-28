# Keycloak Model Context Protocol Server

A comprehensive Model Context Protocol (MCP) server for Keycloak administration, providing 30+ tools to manage users, realms, clients, roles, groups, sessions, and events directly from AI assistants like Claude Desktop or Cursor AI.

## 🚀 Features

### 👤 **User Management**
- ✅ Create, update, and delete users
- ✅ List, search, and get user details
- ✅ Reset user passwords
- ✅ Logout user sessions
- ✅ Manage user roles and groups

### 🏛️ **Realm Management**
- ✅ List, create, update, and delete realms
- ✅ Get detailed realm settings and configurations
- ✅ Manage realm-level security policies

### 🔧 **Client Management**
- ✅ Register, update, and delete clients/applications
- ✅ List all clients in realms
- ✅ Configure client settings and redirect URIs

### 🎭 **Role Management**
- ✅ Create, update, and delete roles (realm and client-level)
- ✅ Assign and remove roles from users
- ✅ List all roles and user role assignments

### 👥 **Group Management**
- ✅ Create, update, and delete user groups
- ✅ Add and remove users from groups
- ✅ Manage hierarchical group structures

### 📊 **Session & Event Management**
- ✅ List active user sessions
- ✅ Monitor authentication and admin events
- ✅ Clear event logs and manage session lifecycles

### 🛡️ **Advanced Features**
- ✅ **Bulletproof authentication** with fresh client instances
- ✅ **Comprehensive error handling** with detailed logging
- ✅ **Cross-platform support** (Windows, macOS, Linux)
- ✅ **Production-ready** with TypeScript and robust architecture

## 📋 Prerequisites

- **Node.js 18 or higher**
- **Running Keycloak instance** (local or remote)
- **Keycloak admin credentials** with appropriate permissions
- **AI Assistant** that supports MCP (Claude Desktop, Cursor AI, etc.)

## 📦 Installation

### Global Installation (Recommended)
```bash
npm install -g keycloak-mcp-server
```

### Using NPX (No Installation Required)
```bash
npx keycloak-mcp-server
```

### Local Project Installation
```bash
npm install keycloak-mcp-server
```

### Local Development
```bash
git clone https://github.com/M0-AR/keycloak-mcp-server.git
cd keycloak-mcp-server
npm install
npm run build
```

## ⚙️ Configuration

### For Cursor AI
Add to your Cursor MCP configuration file (`~/.cursor/mcp.json`):

#### Option 1: Using NPX (Recommended)
```json
{
  "mcpServers": {
    "keycloak": {
      "command": "npx",
      "args": ["keycloak-mcp-server"],
      "env": {
        "KEYCLOAK_URL": "https://your-keycloak-instance.com",
        "KEYCLOAK_ADMIN": "your-admin-username",
        "KEYCLOAK_ADMIN_PASSWORD": "your-admin-password"
      }
    }
  }
}
```

#### Option 2: If Installed Globally
```json
{
  "mcpServers": {
    "keycloak": {
      "command": "keycloak-mcp-server",
      "env": {
        "KEYCLOAK_URL": "https://your-keycloak-instance.com", 
        "KEYCLOAK_ADMIN": "your-admin-username",
        "KEYCLOAK_ADMIN_PASSWORD": "your-admin-password"
      }
    }
  }
}
```

### For Claude Desktop
Add to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "keycloak": {
      "command": "npx",
      "args": ["keycloak-mcp-server"],
      "env": {
        "KEYCLOAK_URL": "https://your-keycloak-instance.com",
        "KEYCLOAK_ADMIN": "your-admin-username",
        "KEYCLOAK_ADMIN_PASSWORD": "your-admin-password"
      }
    }
  }
}
```

## 🌍 Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `KEYCLOAK_URL` | The base URL of your Keycloak instance | `http://localhost:8080` | ✅ |
| `KEYCLOAK_ADMIN` | Admin username | `admin` | ✅ |
| `KEYCLOAK_ADMIN_PASSWORD` | Admin password | `admin` | ✅ |

## 🛠️ Available Tools (30+ Tools)

### 👤 User Management Tools

#### `create-user`
Creates a new user in a specified realm.
```
Create a user in "master" realm: username "john.doe", email "john@example.com", first name "John", last name "Doe"
```

#### `update-user`
Updates user information (email, names, enabled status).
```
Update user "user-id-123" in "master" realm to change email to "newemail@example.com"
```

#### `delete-user`
Deletes a user from a realm.
```
Delete user with ID "user-id-123" from "master" realm
```

#### `list-users`
Lists all users in a realm.
```
List all users in the "master" realm
```

#### `search-users`
Search users with filters (username, email, firstName, lastName).
```
Search for users with email containing "wateen.io" in "master" realm, limit 10 results
```

#### `get-user`
Get detailed information about a specific user.
```
Get details for user ID "user-id-123" in "master" realm
```

#### `reset-user-password`
Reset a user's password.
```
Reset password for user "user-id-123" in "master" realm to "newPassword123", make it temporary
```

#### `logout-user`
Logout all sessions for a specific user.
```
Logout all sessions for user "user-id-123" in "master" realm
```

### 🏛️ Realm Management Tools

#### `list-realms`
Lists all available realms.
```
Show me all available realms in Keycloak
```

#### `create-realm`
Creates a new realm with configurable settings.
```
Create a new realm called "company" with display name "Company Realm", enabled
```

#### `update-realm`
Updates realm settings and configurations.
```
Update realm "company" to change display name to "Updated Company"
```

#### `delete-realm`
Deletes an existing realm.
```
Delete the realm "test-realm"
```

#### `get-realm-settings`
Retrieves detailed settings of a realm.
```
Get detailed settings for the "master" realm
```

### 🔧 Client Management Tools

#### `create-client`
Registers a new client/application in a realm.
```
Create client "my-app" in "master" realm with redirect URIs ["http://localhost:3000/*"]
```

#### `update-client`
Updates client settings (redirect URIs, protocol mappers, etc.).
```
Update client "my-app" in "master" realm to add new redirect URI "https://app.example.com/*"
```

#### `delete-client`
Removes a client from a realm.
```
Delete client "old-app" from "master" realm
```

#### `list-clients`
Lists all clients in a realm.
```
List all clients in the "master" realm
```

### 🎭 Role Management Tools

#### `create-role`
Creates roles at realm or client level.
```
Create a realm role "manager" with description "Manager role" in "master" realm
```

#### `update-role`
Modifies role attributes.
```
Update role "manager" in "master" realm to change description to "Updated manager role"
```

#### `delete-role`
Deletes roles.
```
Delete role "old-role" from "master" realm
```

#### `list-roles`
Lists all roles in a realm.
```
List all roles in the "master" realm
```

#### `assign-role-to-user`
Assigns a role to a user.
```
Assign role "manager" to user "user-id-123" in "master" realm
```

#### `remove-role-from-user`
Removes a role from a user.
```
Remove role "manager" from user "user-id-123" in "master" realm
```

#### `get-user-roles`
Gets all roles assigned to a user.
```
Get all roles for user "user-id-123" in "master" realm
```

### 👥 Group Management Tools

#### `create-group`
Creates user groups.
```
Create a group called "developers" in "master" realm
```

#### `update-group`
Updates group attributes.
```
Update group "group-id-123" in "master" realm to change name to "senior-developers"
```

#### `delete-group`
Deletes groups.
```
Delete group "group-id-123" from "master" realm
```

#### `list-groups`
Lists all groups in a realm.
```
List all groups in the "master" realm
```

#### `manage-user-groups`
Adds or removes users from groups.
```
Add user "user-id-123" to group "group-id-456" in "master" realm
```

### 📊 Session & Event Management Tools

#### `list-sessions`
Lists all active sessions in a realm.
```
List all active sessions in "master" realm
```

#### `get-user-sessions`
Lists active sessions for a specific user.
```
Get active sessions for user "user-id-123" in "master" realm
```

#### `list-events`
Retrieves authentication and admin events.
```
List last 10 events in "master" realm
```

#### `clear-events`
Clears event logs.
```
Clear all events in "master" realm
```

## 🧪 Testing & Development

### Testing with MCP Inspector
```bash
npx @modelcontextprotocol/inspector npx keycloak-mcp-server
```
Visit `http://localhost:6274` to test all tools interactively.

### Local Development
```bash
npm run watch    # Auto-rebuild on changes
npm run dev     # Test server directly
```

### Stress Testing
The server has been stress-tested with 40+ consecutive operations without authentication failures, demonstrating production-level reliability.

## 🔧 Architecture

### Bulletproof Authentication System
- **Fresh Client Instances**: Creates new KcAdminClient for every request
- **Retry Logic**: Exponential backoff with 2 attempts maximum  
- **Connection Management**: 15-second timeout with proper cleanup
- **Error Handling**: Comprehensive error messages for all scenarios

### TypeScript Implementation
- **Type Safety**: Full TypeScript coverage with proper interfaces
- **Error Handling**: Detailed error messages and logging
- **Modular Design**: Clean separation of concerns

## 📈 Production Ready

This package has been extensively tested and validated:
- ✅ **40+ consecutive operations** without authentication failures
- ✅ **Cross-realm operations** working seamlessly  
- ✅ **Parallel tool execution** supported
- ✅ **Complex search queries** with multiple filters
- ✅ **Error recovery** and detailed logging
- ✅ **TypeScript compilation** with zero errors

## 🔒 Security Best Practices

- Use environment variables for credentials
- Enable HTTPS for production Keycloak instances
- Use strong admin passwords
- Regularly rotate credentials
- Monitor admin events and sessions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **GitHub Issues**: [Create an issue](https://github.com/M0-AR/keycloak-mcp-server/issues)
- **Documentation**: Check this README for comprehensive examples
- **MCP Documentation**: [Model Context Protocol](https://modelcontextprotocol.io/)

## 🔗 Related Projects

- [Claude Desktop](https://claude.ai/desktop) - AI assistant supporting MCP
- [Cursor AI](https://cursor.sh/) - AI-powered code editor with MCP support
- [Model Context Protocol](https://modelcontextprotocol.io/) - Protocol specification
- [Keycloak](https://www.keycloak.org/) - Open source identity and access management

## 📊 Package Stats

- **30+ Tools**: Comprehensive Keycloak administration coverage
- **Production Ready**: Extensively tested and validated
- **TypeScript**: Full type safety and modern development experience
- **Cross-Platform**: Windows, macOS, and Linux support
- **Zero Dependencies Issues**: Robust dependency management

---

**Made with ❤️ for the Keycloak and AI community** 