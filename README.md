# Keycloak Model Context Protocol Server

A comprehensive Model Context Protocol (MCP) server for Keycloak administration, providing **80+ tools** to manage users, realms, clients, roles, groups, sessions, events, organizations, protocol mappers, user attributes, client scopes, and identity providers directly from AI assistants like Claude Desktop or Cursor AI.

## 🚀 Features

### 👤 **User Management**
- ✅ Create, update, and delete users
- ✅ List, search, and get user details
- ✅ Reset user passwords
- ✅ Logout user sessions
- ✅ Manage user roles and groups
- ✅ **NEW:** User attributes management (critical for organization data)

### 🏛️ **Realm Management**
- ✅ List, create, update, and delete realms
- ✅ Get detailed realm settings and configurations
- ✅ Manage realm-level security policies

### 🔧 **Client Management**
- ✅ Register, update, and delete clients/applications
- ✅ List all clients in realms
- ✅ Configure client settings and redirect URIs
- ✅ **NEW:** Protocol mappers management (critical for JWT claims)

### 🎭 **Role Management**
- ✅ Create, update, and delete roles (realm and client-level)
- ✅ Assign and remove roles from users and groups
- ✅ List all roles and user role assignments
- ✅ **NEW:** Composite roles and role hierarchies
- ✅ **NEW:** Advanced role operations by ID
- ✅ **NEW:** Find users with specific roles

### 👥 **Group Management**
- ✅ Create, update, and delete user groups
- ✅ Add and remove users from groups
- ✅ Manage hierarchical group structures
- ✅ **NEW:** Group attributes management
- ✅ **NEW:** Child groups and subgroup management
- ✅ **NEW:** Group member listing and management

### 🏢 **Organization Management** ⭐ **NEW**
- ✅ Create, update, and delete organizations
- ✅ Add and remove organization members
- ✅ List organizations and members
- ✅ Organization attributes management

### 🔗 **Identity Provider Management** ⭐ **NEW**
- ✅ Create, update, and delete identity providers (SSO)
- ✅ Identity provider mapper management
- ✅ SAML and OIDC provider configuration
- ✅ External user attribute mapping

### 🎯 **Client Scopes Management** ⭐ **NEW**
- ✅ Create, update, and delete client scopes
- ✅ Protocol mappers for client scopes
- ✅ Token scope management

### 📊 **Session & Event Management**
- ✅ List active user sessions
- ✅ Monitor authentication and admin events
- ✅ Clear event logs and manage session lifecycles

### 🛡️ **Advanced Features**
- ✅ **Bulletproof authentication** with fresh client instances
- ✅ **Comprehensive error handling** with detailed logging
- ✅ **Cross-platform support** (Windows, macOS, Linux)
- ✅ **Production-ready** with TypeScript and robust architecture
- ✅ **Organization JWT Claims** - Solve organization visibility in tokens
- ✅ **80+ Tools** - Complete Keycloak administration coverage

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

## ��️ Available Tools (80+ Tools)

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

#### `set-user-attributes` ⭐ **NEW**
Set user attributes (critical for organization data storage).
```
Set organization attribute for user "user-id-123" in "master" realm: {"organization": ["wateen-corp"]}
```

#### `get-user-attributes` ⭐ **NEW**
Get user attributes including unmanaged attributes.
```
Get all attributes for user "user-id-123" in "master" realm
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

#### `create-protocol-mapper` ⭐ **NEW**
Create protocol mappers for clients (critical for JWT organization claims).
```
Create organization group mapper for client "my-app" in "master" realm to include "organization" claim in JWT
```

#### `update-protocol-mapper` ⭐ **NEW**
Update existing protocol mappers.
```
Update protocol mapper "mapper-id-123" for client "my-app" in "master" realm
```

#### `delete-protocol-mapper` ⭐ **NEW**
Delete protocol mappers from clients.
```
Delete protocol mapper "mapper-id-123" from client "my-app" in "master" realm
```

#### `list-protocol-mappers` ⭐ **NEW**
List all protocol mappers for a client.
```
List all protocol mappers for client "my-app" in "master" realm
```

### 🎯 Client Scopes Management Tools ⭐ **NEW**

#### `create-client-scope`
Create a new client scope for managing token scopes.
```
Create client scope "organization-scope" in "master" realm for organization claims
```

#### `update-client-scope`
Update existing client scope.
```
Update client scope "scope-id-123" in "master" realm to change description
```

#### `delete-client-scope`
Delete a client scope.
```
Delete client scope "scope-id-123" from "master" realm
```

#### `list-client-scopes`
List all client scopes in a realm.
```
List all client scopes in the "master" realm
```

#### `get-client-scope`
Get details of a specific client scope.
```
Get details for client scope "scope-id-123" in "master" realm
```

#### `create-client-scope-protocol-mapper` ⭐ **NEW**
Create protocol mappers for client scopes.
```
Create organization mapper for client scope "organization-scope" in "master" realm
```

#### `update-client-scope-protocol-mapper` ⭐ **NEW**
Update protocol mappers in client scopes.
```
Update protocol mapper "mapper-id-123" in client scope "scope-id-456" in "master" realm
```

#### `delete-client-scope-protocol-mapper` ⭐ **NEW**
Delete protocol mappers from client scopes.
```
Delete protocol mapper "mapper-id-123" from client scope "scope-id-456" in "master" realm
```

#### `list-client-scope-protocol-mappers` ⭐ **NEW**
List protocol mappers for a client scope.
```
List all protocol mappers for client scope "scope-id-123" in "master" realm
```

### 🏢 Organization Management Tools ⭐ **NEW**

#### `create-organization`
Create a new organization.
```
Create organization "wateen-corp" with description "Wateen Corporation" in "master" realm
```

#### `update-organization`
Update existing organization.
```
Update organization "org-id-123" in "master" realm to change name to "Updated Corp"
```

#### `delete-organization`
Delete an organization.
```
Delete organization "org-id-123" from "master" realm
```

#### `list-organizations`
List all organizations in a realm.
```
List all organizations in "master" realm with search "wateen", limit 10
```

#### `get-organization`
Get details of a specific organization.
```
Get details for organization "org-id-123" in "master" realm
```

#### `add-organization-member`
Add a user to an organization.
```
Add user "user-id-123" to organization "org-id-456" in "master" realm
```

#### `remove-organization-member`
Remove a user from an organization.
```
Remove user "user-id-123" from organization "org-id-456" in "master" realm
```

#### `list-organization-members`
List all members of an organization.
```
List all members of organization "org-id-123" in "master" realm, limit 20
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

#### `create-composite-role` ⭐ **NEW**
Create composite roles (role hierarchies).
```
Create composite role from "parent-role-id" with child roles ["child-role-1", "child-role-2"] in "master" realm
```

#### `get-composite-roles` ⭐ **NEW**
Get composite roles for a role.
```
Get composite roles for role "role-id-123" in "master" realm, limit 10
```

#### `delete-composite-roles` ⭐ **NEW**
Delete composite roles from a role.
```
Remove composite roles ["child-role-1", "child-role-2"] from role "parent-role-id" in "master" realm
```

#### `get-role-by-id` ⭐ **NEW**
Get role details by ID.
```
Get role details for role ID "role-id-123" in "master" realm
```

#### `update-role-by-id` ⭐ **NEW**
Update role by ID.
```
Update role "role-id-123" in "master" realm to change name to "new-role-name"
```

#### `delete-role-by-id` ⭐ **NEW**
Delete role by ID.
```
Delete role with ID "role-id-123" from "master" realm
```

#### `find-users-with-role` ⭐ **NEW**
Find users with a specific role.
```
Find all users with role "manager" in "master" realm, limit 20
```

#### `assign-role-to-group` ⭐ **NEW**
Assign a role to a group.
```
Assign role "developer" to group "group-id-123" in "master" realm
```

#### `remove-role-from-group` ⭐ **NEW**
Remove a role from a group.
```
Remove role "developer" from group "group-id-123" in "master" realm
```

#### `get-group-roles` ⭐ **NEW**
Get roles assigned to a group.
```
Get all roles for group "group-id-123" in "master" realm
```

#### `list-available-group-roles` ⭐ **NEW**
List available roles for a group.
```
List available roles for group "group-id-123" in "master" realm
```

#### `list-composite-group-roles` ⭐ **NEW**
List composite roles for a group.
```
List composite roles for group "group-id-123" in "master" realm
```

### 👥 Group Management Tools

#### `create-group`
Creates user groups. Pass `parentId` to create a subgroup.
```
Create a group called "developers" in "master" realm
Create a group called "backend" under parent group "group-id-123" in "master" realm
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

#### `set-group-attributes` ⭐ **NEW**
Set group attributes (organization metadata).
```
Set organization attributes for group "group-id-123" in "master" realm: {"department": ["engineering"]}
```

#### `get-group-attributes` ⭐ **NEW**
Get group attributes.
```
Get all attributes for group "group-id-123" in "master" realm
```

#### `create-child-group` ⭐ **NEW**
Create a child group (subgroup).
```
Create child group "junior-devs" under parent group "group-id-123" in "master" realm
```

#### `list-sub-groups` ⭐ **NEW**
List subgroups of a parent group.
```
List subgroups of parent group "group-id-123" in "master" realm, limit 10
```

#### `list-group-members` ⭐ **NEW**
List members of a group.
```
List all members of group "group-id-123" in "master" realm, limit 20
```

### 🔗 Identity Provider Management Tools ⭐ **NEW**

#### `create-identity-provider`
Create a new identity provider for SSO integration.
```
Create SAML identity provider "company-saml" in "master" realm with SSO URL and certificate
```

#### `update-identity-provider`
Update an existing identity provider.
```
Update identity provider "company-saml" in "master" realm to change display name
```

#### `delete-identity-provider`
Delete an identity provider.
```
Delete identity provider "old-saml" from "master" realm
```

#### `list-identity-providers`
List all identity providers in a realm.
```
List all identity providers in "master" realm
```

#### `get-identity-provider`
Get details of a specific identity provider.
```
Get details for identity provider "company-saml" in "master" realm
```

#### `create-identity-provider-mapper`
Create a mapper for identity provider (external user mapping).
```
Create user attribute mapper for identity provider "company-saml" in "master" realm
```

#### `update-identity-provider-mapper`
Update an identity provider mapper.
```
Update mapper "mapper-id-123" for identity provider "company-saml" in "master" realm
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
Visit `http://localhost:6274` to test all 80+ tools interactively.

### Local Development
```bash
npm run watch    # Auto-rebuild on changes
npm run dev     # Test server directly
```

### Stress Testing
The server has been stress-tested with 80+ consecutive operations without authentication failures, demonstrating production-level reliability.

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
- ✅ **80+ consecutive operations** without authentication failures
- ✅ **Cross-realm operations** working seamlessly  
- ✅ **Parallel tool execution** supported
- ✅ **Complex search queries** with multiple filters
- ✅ **Error recovery** and detailed logging
- ✅ **TypeScript compilation** with zero errors
- ✅ **Complete Keycloak API coverage** with organization management

## 🎯 JWT Organization Problem Solved

This package specifically addresses the common JWT organization problem:
- ✅ **User Attributes**: Store organization data in user attributes
- ✅ **Protocol Mappers**: Create mappers to include organization in JWT tokens
- ✅ **Client Scopes**: Manage token scopes for organization claims
- ✅ **Organizations**: Full organization lifecycle management
- ✅ **Group Attributes**: Store organization metadata in groups

Example workflow:
1. Create organization using `create-organization`
2. Set user organization attribute using `set-user-attributes`
3. Create protocol mapper using `create-protocol-mapper` to include organization in JWT
4. Add user to organization using `add-organization-member`

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

- **80+ Tools**: Complete Keycloak administration coverage
- **Production Ready**: Extensively tested and validated
- **TypeScript**: Full type safety and modern development experience
- **Cross-Platform**: Windows, macOS, and Linux support
- **Zero Dependencies Issues**: Robust dependency management
- **Organization Management**: Solve JWT organization visibility problems
- **Advanced Features**: Protocol mappers, client scopes, identity providers

---

**Made with ❤️ for the Keycloak and AI community** 