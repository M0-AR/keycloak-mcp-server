#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import KcAdminClient from '@keycloak/keycloak-admin-client';
import { z } from 'zod';

// Environment variables
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_ADMIN = process.env.KEYCLOAK_ADMIN || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

// Connection management
interface AuthConfig {
  username: string;
  password: string;
  grantType: 'password';
  clientId: 'admin-cli';
}

class KeycloakAdminManager {
  private authConfig: AuthConfig;
  private baseUrl: string;

  constructor() {
    this.baseUrl = KEYCLOAK_URL;
    this.authConfig = {
      username: KEYCLOAK_ADMIN,
      password: KEYCLOAK_ADMIN_PASSWORD,
      grantType: 'password',
      clientId: 'admin-cli'
    };
  }

  /**
   * Create a fresh admin client for each request with retry logic
   * This prevents token expiration and connection staleness issues
   */
  private async createFreshClient(): Promise<KcAdminClient> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.error(`Creating fresh Keycloak client (attempt ${attempt}/${maxRetries})`);
        
        const client = new KcAdminClient({
          baseUrl: this.baseUrl,
          requestOptions: {
            // Connection pooling settings for better performance
            headers: {
              'Connection': 'close', // Force new connections to avoid stale connections
            }
          }
        });

        // Authenticate with fresh session
        console.error('Authenticating with Keycloak server...');
        await client.auth(this.authConfig);
        
        console.error('✅ Fresh Keycloak client created and authenticated successfully');
        return client;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ Attempt ${attempt} failed:`, lastError.message);
        
        // If it's the last attempt, don't wait
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          console.error(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error('All authentication attempts failed');
    throw new McpError(
      ErrorCode.InternalError,
      `Keycloak authentication failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Execute an operation with a fresh client and comprehensive error handling
   */
  async executeOperation<T>(operation: (client: KcAdminClient) => Promise<T>): Promise<T> {
    let client: KcAdminClient | null = null;
    const startTime = Date.now();
    
    try {
      client = await this.createFreshClient();
      console.error('🔧 Executing Keycloak operation...');
      const result = await operation(client);
      const duration = Date.now() - startTime;
      console.error(`✅ Operation completed successfully in ${duration}ms`);
      return result;
          } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ Keycloak operation failed after ${duration}ms:`, error);
      
      // Handle specific Keycloak errors with comprehensive coverage based on research
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        if (errorMsg.includes('network response was not ok')) {
          throw new McpError(
            ErrorCode.InternalError,
            'Keycloak server connection failed. The server may be temporarily unavailable or experiencing network issues. Please check server status and try again in a moment.'
          );
        }
        
        if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
          throw new McpError(
            ErrorCode.InternalError,
            'Keycloak authentication failed. Please verify admin credentials and permissions.'
          );
        }
        
        if (errorMsg.includes('timeout') || errorMsg.includes('etimedout') || errorMsg.includes('econnreset')) {
          throw new McpError(
            ErrorCode.InternalError,
            'Keycloak server timeout or connection reset. The server may be under load. Please try again.'
          );
        }
        
        if (errorMsg.includes('econnrefused') || errorMsg.includes('enotfound')) {
          throw new McpError(
            ErrorCode.InternalError,
            'Cannot connect to Keycloak server. Please verify the server URL and ensure the server is running.'
          );
        }
        
        if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
          throw new McpError(
            ErrorCode.InternalError,
            'Access denied. The admin user may lack sufficient permissions for this operation.'
          );
        }
        
        if (errorMsg.includes('ssl') || errorMsg.includes('certificate') || errorMsg.includes('handshake')) {
          throw new McpError(
            ErrorCode.InternalError,
            'SSL/TLS connection error. Please check certificate configuration and trust settings.'
          );
        }
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Keycloak operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      // Clean up - let garbage collection handle the client
      client = null;
    }
  }
}

// Global admin manager instance
const adminManager = new KeycloakAdminManager();

// Zod schemas for all tools
const CreateUserSchema = z.object({
  realm: z.string(),
  username: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
});

const DeleteUserSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

const ListRealmsSchema = z.object({
  random_string: z.string().optional(),
});

const ListUsersSchema = z.object({
  realm: z.string(),
});

const UpdateUserSchema = z.object({
  realm: z.string(),
  userId: z.string(),
  username: z.string().optional(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  enabled: z.boolean().optional(),
});

const GetUserSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

const ResetUserPasswordSchema = z.object({
  realm: z.string(),
  userId: z.string(),
  newPassword: z.string(),
  temporary: z.boolean().optional(),
});

const SearchUsersSchema = z.object({
  realm: z.string(),
  search: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  max: z.number().optional(),
});

const ListRolesSchema = z.object({
  realm: z.string(),
});

const AssignRoleToUserSchema = z.object({
  realm: z.string(),
  userId: z.string(),
  roleName: z.string(),
});

const RemoveRoleFromUserSchema = z.object({
  realm: z.string(),
  userId: z.string(),
  roleName: z.string(),
});

const GetUserRolesSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

const LogoutUserSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

const CreateRealmSchema = z.object({
  realm: z.string(),
  displayName: z.string().optional(),
  enabled: z.boolean().optional(),
});

const UpdateRealmSchema = z.object({
  realm: z.string(),
  displayName: z.string().optional(),
  enabled: z.boolean().optional(),
});

const DeleteRealmSchema = z.object({
  realm: z.string(),
});

const GetRealmSettingsSchema = z.object({
  realm: z.string(),
});

const CreateClientSchema = z.object({
  realm: z.string(),
  clientId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  publicClient: z.boolean().optional(),
  redirectUris: z.array(z.string()).optional(),
});

const UpdateClientSchema = z.object({
  realm: z.string(),
  clientId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  publicClient: z.boolean().optional(),
  redirectUris: z.array(z.string()).optional(),
});

const DeleteClientSchema = z.object({
  realm: z.string(),
  clientId: z.string(),
});

const ListClientsSchema = z.object({
  realm: z.string(),
});

const CreateRoleSchema = z.object({
  realm: z.string(),
  roleName: z.string(),
  description: z.string().optional(),
  clientId: z.string().optional(),
});

const UpdateRoleSchema = z.object({
  realm: z.string(),
  roleName: z.string(),
  newName: z.string().optional(),
  description: z.string().optional(),
  clientId: z.string().optional(),
});

const DeleteRoleSchema = z.object({
  realm: z.string(),
  roleName: z.string(),
  clientId: z.string().optional(),
});

const CreateGroupSchema = z.object({
  realm: z.string(),
  name: z.string(),
  parentId: z.string().optional(),
});

const UpdateGroupSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
  name: z.string().optional(),
});

const DeleteGroupSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
});

const ListGroupsSchema = z.object({
  realm: z.string(),
});

const ManageUserGroupsSchema = z.object({
  realm: z.string(),
  userId: z.string(),
  groupId: z.string(),
  action: z.enum(['add', 'remove']),
});

const ListSessionsSchema = z.object({
  realm: z.string(),
  clientId: z.string().optional(),
});

const GetUserSessionsSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

const ListEventsSchema = z.object({
  realm: z.string(),
  type: z.string().optional(),
  max: z.number().optional(),
});

const ClearEventsSchema = z.object({
  realm: z.string(),
});

// Create and configure the server
const server = new Server(
  {
    name: 'keycloak-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // User Management Tools
      {
        name: 'create-user',
        description: 'Create a new user in a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            username: { type: 'string', description: 'Username' },
            email: { type: 'string', description: 'Email address' },
            firstName: { type: 'string', description: 'First name' },
            lastName: { type: 'string', description: 'Last name' },
          },
          required: ['realm', 'username', 'email', 'firstName', 'lastName'],
        },
      },
      {
        name: 'delete-user',
        description: 'Delete a user from a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['realm', 'userId'],
        },
      },
      {
        name: 'list-users',
        description: 'List users in a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'update-user',
        description: 'Update user information in a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
            username: { type: 'string', description: 'Username' },
            email: { type: 'string', description: 'Email address' },
            firstName: { type: 'string', description: 'First name' },
            lastName: { type: 'string', description: 'Last name' },
            enabled: { type: 'boolean', description: 'User enabled status' },
          },
          required: ['realm', 'userId'],
        },
      },
      {
        name: 'get-user',
        description: 'Get user details by ID from a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['realm', 'userId'],
        },
      },
      {
        name: 'reset-user-password',
        description: 'Reset a user\'s password in a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
            newPassword: { type: 'string', description: 'New password' },
            temporary: { type: 'boolean', description: 'Whether password is temporary' },
          },
          required: ['realm', 'userId', 'newPassword'],
        },
      },
      {
        name: 'search-users',
        description: 'Search users in a specific realm with filters',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            search: { type: 'string', description: 'Search term' },
            username: { type: 'string', description: 'Username filter' },
            email: { type: 'string', description: 'Email filter' },
            firstName: { type: 'string', description: 'First name filter' },
            lastName: { type: 'string', description: 'Last name filter' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'logout-user',
        description: 'Logout all sessions for a specific user',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['realm', 'userId'],
        },
      },

      // Realm Management Tools
      {
        name: 'list-realms',
        description: 'List all available realms',
        inputSchema: {
          type: 'object',
          properties: {
            random_string: { type: 'string', description: 'Dummy parameter for no-parameter tools' },
          },
          required: ['random_string'],
        },
      },
      {
        name: 'create-realm',
        description: 'Create a new realm with configurable settings',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            displayName: { type: 'string', description: 'Display name' },
            enabled: { type: 'boolean', description: 'Enabled status' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'update-realm',
        description: 'Update realm settings and configurations',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            displayName: { type: 'string', description: 'Display name' },
            enabled: { type: 'boolean', description: 'Enabled status' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'delete-realm',
        description: 'Delete an existing realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'get-realm-settings',
        description: 'Retrieve detailed settings of a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
          },
          required: ['realm'],
        },
      },

      // Client Management Tools
      {
        name: 'create-client',
        description: 'Register a new client/application in a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientId: { type: 'string', description: 'Client ID' },
            name: { type: 'string', description: 'Client name' },
            description: { type: 'string', description: 'Client description' },
            enabled: { type: 'boolean', description: 'Enabled status' },
            publicClient: { type: 'boolean', description: 'Public client' },
            redirectUris: { type: 'array', description: 'Redirect URIs' },
          },
          required: ['realm', 'clientId'],
        },
      },
      {
        name: 'update-client',
        description: 'Update client settings (redirect URIs, protocol mappers, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientId: { type: 'string', description: 'Client ID' },
            name: { type: 'string', description: 'Client name' },
            description: { type: 'string', description: 'Client description' },
            enabled: { type: 'boolean', description: 'Enabled status' },
            publicClient: { type: 'boolean', description: 'Public client' },
            redirectUris: { type: 'array', description: 'Redirect URIs' },
          },
          required: ['realm', 'clientId'],
        },
      },
      {
        name: 'delete-client',
        description: 'Remove a client from a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientId: { type: 'string', description: 'Client ID' },
          },
          required: ['realm', 'clientId'],
        },
      },
      {
        name: 'list-clients',
        description: 'List all clients in a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
          },
          required: ['realm'],
        },
      },

      // Role Management Tools
      {
        name: 'list-roles',
        description: 'List all roles in a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'create-role',
        description: 'Create roles at realm or client level',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleName: { type: 'string', description: 'Role name' },
            description: { type: 'string', description: 'Role description' },
            clientId: { type: 'string', description: 'Client ID for client roles' },
          },
          required: ['realm', 'roleName'],
        },
      },
      {
        name: 'update-role',
        description: 'Modify role attributes',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleName: { type: 'string', description: 'Current role name' },
            newName: { type: 'string', description: 'New role name' },
            description: { type: 'string', description: 'Role description' },
            clientId: { type: 'string', description: 'Client ID for client roles' },
          },
          required: ['realm', 'roleName'],
        },
      },
      {
        name: 'delete-role',
        description: 'Delete roles',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleName: { type: 'string', description: 'Role name' },
            clientId: { type: 'string', description: 'Client ID for client roles' },
          },
          required: ['realm', 'roleName'],
        },
      },
      {
        name: 'assign-role-to-user',
        description: 'Assign a role to a user in a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
            roleName: { type: 'string', description: 'Role name' },
          },
          required: ['realm', 'userId', 'roleName'],
        },
      },
      {
        name: 'remove-role-from-user',
        description: 'Remove a role from a user in a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
            roleName: { type: 'string', description: 'Role name' },
          },
          required: ['realm', 'userId', 'roleName'],
        },
      },
      {
        name: 'get-user-roles',
        description: 'Get all roles assigned to a user in a specific realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['realm', 'userId'],
        },
      },

      // Group Management Tools
      {
        name: 'create-group',
        description: 'Create user groups',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            name: { type: 'string', description: 'Group name' },
            parentId: { type: 'string', description: 'Parent group ID' },
          },
          required: ['realm', 'name'],
        },
      },
      {
        name: 'update-group',
        description: 'Update group attributes',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            groupId: { type: 'string', description: 'Group ID' },
            name: { type: 'string', description: 'Group name' },
          },
          required: ['realm', 'groupId'],
        },
      },
      {
        name: 'delete-group',
        description: 'Delete groups',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            groupId: { type: 'string', description: 'Group ID' },
          },
          required: ['realm', 'groupId'],
        },
      },
      {
        name: 'list-groups',
        description: 'List all groups in a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'manage-user-groups',
        description: 'Add or remove users from groups',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
            groupId: { type: 'string', description: 'Group ID' },
            action: { type: 'string', enum: ['add', 'remove'], description: 'Action to perform' },
          },
          required: ['realm', 'userId', 'groupId', 'action'],
        },
      },

      // Session & Event Management Tools
      {
        name: 'list-sessions',
        description: 'List all active sessions in a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientId: { type: 'string', description: 'Client ID filter' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'get-user-sessions',
        description: 'List active sessions for a user',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['realm', 'userId'],
        },
      },
      {
        name: 'list-events',
        description: 'Retrieve authentication and admin events',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            type: { type: 'string', description: 'Event type filter' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'clear-events',
        description: 'Clear event logs',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
          },
          required: ['realm'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // User Management Tools
      case 'create-user': {
        const { realm, username, email, firstName, lastName } = CreateUserSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.users.create({
            username,
            email,
            firstName,
            lastName,
            enabled: true,
          });
        });
        return { content: [{ type: 'text', text: `User created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-user': {
        const { realm, userId } = DeleteUserSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.users.del({ id: userId });
        });
        return { content: [{ type: 'text', text: `User ${userId} deleted successfully from realm ${realm}` }] };
      }

      case 'list-realms': {
        const result = await adminManager.executeOperation(async (client) => {
          return await client.realms.find();
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list-users': {
        const { realm } = ListUsersSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.users.find();
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'update-user': {
        const parsed = UpdateUserSchema.parse(args);
        const { realm, userId, ...updateData } = parsed;
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.users.update({ id: userId }, updateData);
        });
        return { content: [{ type: 'text', text: `User ${userId} updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'get-user': {
        const { realm, userId } = GetUserSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.users.findOne({ id: userId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'reset-user-password': {
        const { realm, userId, newPassword, temporary = false } = ResetUserPasswordSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.users.resetPassword({
            id: userId,
            credential: {
              temporary,
              type: 'password',
              value: newPassword,
            },
          });
        });
        return { content: [{ type: 'text', text: `Password reset successfully for user ${userId} in realm ${realm}` }] };
      }

      case 'search-users': {
        const { realm, ...searchParams } = SearchUsersSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.users.find(searchParams);
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'logout-user': {
        const { realm, userId } = LogoutUserSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.users.logout({ id: userId });
        });
        return { content: [{ type: 'text', text: `User ${userId} logged out successfully from realm ${realm}` }] };
      }

      // Realm Management Tools
      case 'create-realm': {
        const { realm, displayName, enabled = true } = CreateRealmSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          return await client.realms.create({
            realm,
            displayName,
            enabled,
          });
        });
        return { content: [{ type: 'text', text: `Realm created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-realm': {
        const { realm, ...updateData } = UpdateRealmSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          return await client.realms.update({ realm }, updateData);
        });
        return { content: [{ type: 'text', text: `Realm ${realm} updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-realm': {
        const { realm } = DeleteRealmSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          await client.realms.del({ realm });
        });
        return { content: [{ type: 'text', text: `Realm ${realm} deleted successfully` }] };
      }

      case 'get-realm-settings': {
        const { realm } = GetRealmSettingsSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          return await client.realms.findOne({ realm });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Client Management Tools
      case 'create-client': {
        const { realm, clientId, ...clientData } = CreateClientSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clients.create({
            clientId,
            ...clientData,
          });
        });
        return { content: [{ type: 'text', text: `Client created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-client': {
        const { realm, clientId, ...updateData } = UpdateClientSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const clients = await client.clients.find({ clientId });
          if (clients.length === 0 || !clients[0].id) {
            throw new Error(`Client ${clientId} not found or invalid`);
          }
          return await client.clients.update({ id: clients[0].id }, updateData);
        });
        return { content: [{ type: 'text', text: `Client ${clientId} updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-client': {
        const { realm, clientId } = DeleteClientSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const clients = await client.clients.find({ clientId });
          if (clients.length === 0 || !clients[0].id) {
            throw new Error(`Client ${clientId} not found or invalid`);
          }
          await client.clients.del({ id: clients[0].id });
        });
        return { content: [{ type: 'text', text: `Client ${clientId} deleted successfully from realm ${realm}` }] };
      }

      case 'list-clients': {
        const { realm } = ListClientsSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clients.find();
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Role Management Tools
      case 'list-roles': {
        const { realm } = ListRolesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.roles.find();
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'create-role': {
        const { realm, roleName, description, clientId } = CreateRoleSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          if (clientId) {
            const clients = await client.clients.find({ clientId });
            if (clients.length === 0 || !clients[0].id) {
              throw new Error(`Client ${clientId} not found or invalid`);
            }
            return await client.clients.createRole({
              id: clients[0].id,
              name: roleName,
              description,
            });
          } else {
            return await client.roles.create({
              name: roleName,
              description,
            });
          }
        });
        return { content: [{ type: 'text', text: `Role created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-role': {
        const { realm, roleName, newName, description, clientId } = UpdateRoleSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const updateData: any = {};
          if (newName) updateData.name = newName;
          if (description) updateData.description = description;

          if (clientId) {
            const clients = await client.clients.find({ clientId });
            if (clients.length === 0 || !clients[0].id) {
              throw new Error(`Client ${clientId} not found or invalid`);
            }
            return await client.clients.updateRole({
              id: clients[0].id,
              roleName,
            }, updateData);
          } else {
            return await client.roles.updateByName({
              name: roleName,
            }, updateData);
          }
        });
        return { content: [{ type: 'text', text: `Role ${roleName} updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-role': {
        const { realm, roleName, clientId } = DeleteRoleSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          if (clientId) {
            const clients = await client.clients.find({ clientId });
            if (clients.length === 0 || !clients[0].id) {
              throw new Error(`Client ${clientId} not found or invalid`);
            }
            await client.clients.delRole({
              id: clients[0].id,
              roleName,
            });
          } else {
            await client.roles.delByName({ name: roleName });
          }
        });
        return { content: [{ type: 'text', text: `Role ${roleName} deleted successfully from realm ${realm}` }] };
      }

      case 'assign-role-to-user': {
        const { realm, userId, roleName } = AssignRoleToUserSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const role = await client.roles.findOneByName({ name: roleName });
          if (!role || !role.id || !role.name) {
            throw new Error(`Role ${roleName} not found or invalid`);
          }
          await client.users.addRealmRoleMappings({
            id: userId,
            roles: [{ id: role.id, name: role.name }],
          });
        });
        return { content: [{ type: 'text', text: `Role ${roleName} assigned to user ${userId} in realm ${realm}` }] };
      }

      case 'remove-role-from-user': {
        const { realm, userId, roleName } = RemoveRoleFromUserSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const role = await client.roles.findOneByName({ name: roleName });
          if (!role || !role.id || !role.name) {
            throw new Error(`Role ${roleName} not found or invalid`);
          }
          await client.users.delRealmRoleMappings({
            id: userId,
            roles: [{ id: role.id, name: role.name }],
          });
        });
        return { content: [{ type: 'text', text: `Role ${roleName} removed from user ${userId} in realm ${realm}` }] };
      }

      case 'get-user-roles': {
        const { realm, userId } = GetUserRolesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.users.listRealmRoleMappings({ id: userId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Group Management Tools
      case 'create-group': {
        const { realm, name } = CreateGroupSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.groups.create({
            name,
          });
        });
        return { content: [{ type: 'text', text: `Group created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-group': {
        const { realm, groupId, ...updateData } = UpdateGroupSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.groups.update({ id: groupId }, updateData);
        });
        return { content: [{ type: 'text', text: `Group ${groupId} updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-group': {
        const { realm, groupId } = DeleteGroupSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.groups.del({ id: groupId });
        });
        return { content: [{ type: 'text', text: `Group ${groupId} deleted successfully from realm ${realm}` }] };
      }

      case 'list-groups': {
        const { realm } = ListGroupsSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.groups.find();
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'manage-user-groups': {
        const { realm, userId, groupId, action } = ManageUserGroupsSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          if (action === 'add') {
            await client.users.addToGroup({ id: userId, groupId });
          } else {
            await client.users.delFromGroup({ id: userId, groupId });
          }
        });
        return { content: [{ type: 'text', text: `User ${userId} ${action === 'add' ? 'added to' : 'removed from'} group ${groupId} in realm ${realm}` }] };
      }

      // Session & Event Management Tools
      case 'list-sessions': {
        const { realm, clientId } = ListSessionsSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          if (clientId) {
            const clients = await client.clients.find({ clientId });
            if (clients.length === 0 || !clients[0].id) {
              throw new Error(`Client ${clientId} not found or invalid`);
            }
            return await client.clients.listSessions({ id: clients[0].id });
          } else {
            return await client.realms.getClientSessionStats({ realm });
          }
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get-user-sessions': {
        const { realm, userId } = GetUserSessionsSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.users.listSessions({ id: userId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list-events': {
        const { realm, type, max } = ListEventsSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const params: any = {};
          if (type) params.type = type;
          if (max) params.max = max;
          return await client.realms.findEvents({ realm, ...params });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'clear-events': {
        const { realm } = ClearEventsSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.realms.clearEvents({ realm });
        });
        return { content: [{ type: 'text', text: `Events cleared successfully for realm ${realm}` }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    console.error(`Error executing tool ${name}:`, error);
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Keycloak MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
}); 