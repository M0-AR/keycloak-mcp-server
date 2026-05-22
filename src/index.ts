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

// Protocol Mappers schemas
const CreateProtocolMapperSchema = z.object({
  realm: z.string(),
  clientId: z.string(),
  name: z.string(),
  protocol: z.string(),
  protocolMapper: z.string(),
  config: z.record(z.string()).optional(),
});

const CreateClientScopeProtocolMapperSchema = z.object({
  realm: z.string(),
  clientScopeId: z.string(),
  name: z.string(),
  protocol: z.string(),
  protocolMapper: z.string(),
  config: z.record(z.string()).optional(),
});

const ListProtocolMappersSchema = z.object({
  realm: z.string(),
  clientId: z.string(),
});

const ListClientScopeProtocolMappersSchema = z.object({
  realm: z.string(),
  clientScopeId: z.string(),
});

const UpdateProtocolMapperSchema = z.object({
  realm: z.string(),
  clientId: z.string(),
  mapperId: z.string(),
  name: z.string(),
  protocol: z.string(),
  protocolMapper: z.string(),
  config: z.record(z.string()).optional(),
});

const UpdateClientScopeProtocolMapperSchema = z.object({
  realm: z.string(),
  clientScopeId: z.string(),
  mapperId: z.string(),
  name: z.string(),
  protocol: z.string(),
  protocolMapper: z.string(),
  config: z.record(z.string()).optional(),
});

const DeleteProtocolMapperSchema = z.object({
  realm: z.string(),
  clientId: z.string(),
  mapperId: z.string(),
});

const DeleteClientScopeProtocolMapperSchema = z.object({
  realm: z.string(),
  clientScopeId: z.string(),
  mapperId: z.string(),
});

// User Attributes schemas
const SetUserAttributesSchema = z.object({
  realm: z.string(),
  userId: z.string(),
  attributes: z.record(z.array(z.string())),
});

const GetUserAttributesSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

// Client Scopes schemas
const CreateClientScopeSchema = z.object({
  realm: z.string(),
  name: z.string(),
  description: z.string().optional(),
  protocol: z.string().optional(),
  attributes: z.record(z.string()).optional(),
});

const UpdateClientScopeSchema = z.object({
  realm: z.string(),
  clientScopeId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  protocol: z.string().optional(),
  attributes: z.record(z.string()).optional(),
});

const DeleteClientScopeSchema = z.object({
  realm: z.string(),
  clientScopeId: z.string(),
});

const ListClientScopesSchema = z.object({
  realm: z.string(),
});

const GetClientScopeSchema = z.object({
  realm: z.string(),
  clientScopeId: z.string(),
});

// Organizations schemas
const CreateOrganizationSchema = z.object({
  realm: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  attributes: z.record(z.array(z.string())).optional(),
});

const UpdateOrganizationSchema = z.object({
  realm: z.string(),
  orgId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  attributes: z.record(z.array(z.string())).optional(),
});

const DeleteOrganizationSchema = z.object({
  realm: z.string(),
  orgId: z.string(),
});

const ListOrganizationsSchema = z.object({
  realm: z.string(),
  search: z.string().optional(),
  first: z.number().optional(),
  max: z.number().optional(),
});

const GetOrganizationSchema = z.object({
  realm: z.string(),
  orgId: z.string(),
});

const AddOrganizationMemberSchema = z.object({
  realm: z.string(),
  orgId: z.string(),
  userId: z.string(),
});

const RemoveOrganizationMemberSchema = z.object({
  realm: z.string(),
  orgId: z.string(),
  userId: z.string(),
});

const ListOrganizationMembersSchema = z.object({
  realm: z.string(),
  orgId: z.string(),
  search: z.string().optional(),
  first: z.number().optional(),
  max: z.number().optional(),
});

// Advanced Role Management schemas
const CreateCompositeRoleSchema = z.object({
  realm: z.string(),
  roleId: z.string(),
  roles: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
});

const GetCompositeRolesSchema = z.object({
  realm: z.string(),
  roleId: z.string(),
  search: z.string().optional(),
  first: z.number().optional(),
  max: z.number().optional(),
});

const DeleteCompositeRolesSchema = z.object({
  realm: z.string(),
  roleId: z.string(),
  roles: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
});

const GetRoleByIdSchema = z.object({
  realm: z.string(),
  roleId: z.string(),
});

const UpdateRoleByIdSchema = z.object({
  realm: z.string(),
  roleId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  composite: z.boolean().optional(),
  clientRole: z.boolean().optional(),
  containerId: z.string().optional(),
  attributes: z.record(z.array(z.string())).optional(),
});

const DeleteRoleByIdSchema = z.object({
  realm: z.string(),
  roleId: z.string(),
});

const FindUsersWithRoleSchema = z.object({
  realm: z.string(),
  roleName: z.string(),
  first: z.number().optional(),
  max: z.number().optional(),
});

const AssignRoleToGroupSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
  roleName: z.string(),
});

const RemoveRoleFromGroupSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
  roleName: z.string(),
});

const GetGroupRolesSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
});

const ListAvailableGroupRolesSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
});

const ListCompositeGroupRolesSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
});

// Group Attributes schemas
const SetGroupAttributesSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
  attributes: z.record(z.array(z.string())),
});

const GetGroupAttributesSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
});

const CreateChildGroupSchema = z.object({
  realm: z.string(),
  parentGroupId: z.string(),
  name: z.string(),
  attributes: z.record(z.array(z.string())).optional(),
});

const ListSubGroupsSchema = z.object({
  realm: z.string(),
  parentGroupId: z.string(),
  search: z.string().optional(),
  first: z.number().optional(),
  max: z.number().optional(),
});

const ListGroupMembersSchema = z.object({
  realm: z.string(),
  groupId: z.string(),
  first: z.number().optional(),
  max: z.number().optional(),
});

// Identity Providers schemas
const CreateIdentityProviderSchema = z.object({
  realm: z.string(),
  alias: z.string(),
  displayName: z.string().optional(),
  providerId: z.string(),
  enabled: z.boolean().optional(),
  trustEmail: z.boolean().optional(),
  storeToken: z.boolean().optional(),
  addReadTokenRoleOnCreate: z.boolean().optional(),
  linkOnly: z.boolean().optional(),
  firstBrokerLoginFlowAlias: z.string().optional(),
  config: z.record(z.string()).optional(),
});

const UpdateIdentityProviderSchema = z.object({
  realm: z.string(),
  alias: z.string(),
  displayName: z.string().optional(),
  providerId: z.string().optional(),
  enabled: z.boolean().optional(),
  trustEmail: z.boolean().optional(),
  storeToken: z.boolean().optional(),
  addReadTokenRoleOnCreate: z.boolean().optional(),
  linkOnly: z.boolean().optional(),
  firstBrokerLoginFlowAlias: z.string().optional(),
  config: z.record(z.string()).optional(),
});

const DeleteIdentityProviderSchema = z.object({
  realm: z.string(),
  alias: z.string(),
});

const ListIdentityProvidersSchema = z.object({
  realm: z.string(),
  search: z.string().optional(),
  first: z.number().optional(),
  max: z.number().optional(),
});

const GetIdentityProviderSchema = z.object({
  realm: z.string(),
  alias: z.string(),
});

const CreateIdentityProviderMapperSchema = z.object({
  realm: z.string(),
  alias: z.string(),
  name: z.string(),
  identityProviderMapper: z.string(),
  config: z.record(z.string()).optional(),
});

const UpdateIdentityProviderMapperSchema = z.object({
  realm: z.string(),
  alias: z.string(),
  mapperId: z.string(),
  name: z.string(),
  identityProviderMapper: z.string(),
  config: z.record(z.string()).optional(),
});

const DeleteIdentityProviderMapperSchema = z.object({
  realm: z.string(),
  alias: z.string(),
  mapperId: z.string(),
});

const ListIdentityProviderMappersSchema = z.object({
  realm: z.string(),
  alias: z.string(),
});

const GetIdentityProviderMapperSchema = z.object({
  realm: z.string(),
  alias: z.string(),
  mapperId: z.string(),
});

const ListIdentityProviderMapperTypesSchema = z.object({
  realm: z.string(),
  alias: z.string(),
});

const ImportIdentityProviderFromUrlSchema = z.object({
  realm: z.string(),
  providerId: z.string(),
  fromUrl: z.string(),
});

// Additional Resources schemas
const CreateComponentSchema = z.object({
  realm: z.string(),
  name: z.string(),
  providerId: z.string(),
  providerType: z.string(),
  parentId: z.string().optional(),
  config: z.record(z.array(z.string())).optional(),
});

const UpdateComponentSchema = z.object({
  realm: z.string(),
  componentId: z.string(),
  name: z.string().optional(),
  providerId: z.string().optional(),
  providerType: z.string().optional(),
  parentId: z.string().optional(),
  config: z.record(z.array(z.string())).optional(),
});

const DeleteComponentSchema = z.object({
  realm: z.string(),
  componentId: z.string(),
});

const ListComponentsSchema = z.object({
  realm: z.string(),
  name: z.string().optional(),
  parent: z.string().optional(),
  type: z.string().optional(),
});

const GetComponentSchema = z.object({
  realm: z.string(),
  componentId: z.string(),
});

const ListComponentSubTypesSchema = z.object({
  realm: z.string(),
  componentId: z.string(),
  type: z.string(),
});

const GetServerInfoSchema = z.object({
  dummy: z.string().optional(),
});

const WhoAmISchema = z.object({
  dummy: z.string().optional(),
});

const GetAttackDetectionSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

const ClearAttackDetectionSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

const ClearAllAttackDetectionSchema = z.object({
  realm: z.string(),
});

const ClearUserCacheSchema = z.object({
  realm: z.string(),
  userId: z.string(),
});

const ClearKeysSchema = z.object({
  realm: z.string(),
});

const ClearRealmCacheSchema = z.object({
  realm: z.string(),
});

const CreateClientPolicySchema = z.object({
  realm: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  conditions: z.array(z.any()).optional(),
  profiles: z.array(z.string()).optional(),
});

const UpdateClientPolicySchema = z.object({
  realm: z.string(),
  policyName: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  conditions: z.array(z.any()).optional(),
  profiles: z.array(z.string()).optional(),
});

const DeleteClientPolicySchema = z.object({
  realm: z.string(),
  policyName: z.string(),
});

const ListClientPoliciesSchema = z.object({
  realm: z.string(),
});

const GetClientPolicySchema = z.object({
  realm: z.string(),
  policyName: z.string(),
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
            redirectUris: {
              type: 'array',
              description: 'Redirect URIs',
              items: { type: 'string' },
            },
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
            redirectUris: {
              type: 'array',
              description: 'Redirect URIs',
              items: { type: 'string' },
            },
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

      // Protocol Mappers Management Tools (CRITICAL for JWT organization problem)
      {
        name: 'create-protocol-mapper',
        description: 'Create a protocol mapper for a client (CRITICAL for JWT organization claims)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientId: { type: 'string', description: 'Client ID' },
            name: { type: 'string', description: 'Protocol mapper name' },
            protocol: { type: 'string', description: 'Protocol (e.g., openid-connect)' },
            protocolMapper: { type: 'string', description: 'Protocol mapper type (e.g., oidc-group-membership-mapper)' },
            config: { type: 'object', description: 'Protocol mapper configuration' },
          },
          required: ['realm', 'clientId', 'name', 'protocol', 'protocolMapper'],
        },
      },
      {
        name: 'create-client-scope-protocol-mapper',
        description: 'Create a protocol mapper for a client scope',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientScopeId: { type: 'string', description: 'Client scope ID' },
            name: { type: 'string', description: 'Protocol mapper name' },
            protocol: { type: 'string', description: 'Protocol (e.g., openid-connect)' },
            protocolMapper: { type: 'string', description: 'Protocol mapper type' },
            config: { type: 'object', description: 'Protocol mapper configuration' },
          },
          required: ['realm', 'clientScopeId', 'name', 'protocol', 'protocolMapper'],
        },
      },
      {
        name: 'list-protocol-mappers',
        description: 'List protocol mappers for a client',
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
        name: 'list-client-scope-protocol-mappers',
        description: 'List protocol mappers for a client scope',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientScopeId: { type: 'string', description: 'Client scope ID' },
          },
          required: ['realm', 'clientScopeId'],
        },
      },
      {
        name: 'update-protocol-mapper',
        description: 'Update a protocol mapper for a client',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientId: { type: 'string', description: 'Client ID' },
            mapperId: { type: 'string', description: 'Protocol mapper ID' },
            name: { type: 'string', description: 'Protocol mapper name' },
            protocol: { type: 'string', description: 'Protocol' },
            protocolMapper: { type: 'string', description: 'Protocol mapper type' },
            config: { type: 'object', description: 'Protocol mapper configuration' },
          },
          required: ['realm', 'clientId', 'mapperId', 'name', 'protocol', 'protocolMapper'],
        },
      },
      {
        name: 'update-client-scope-protocol-mapper',
        description: 'Update a protocol mapper for a client scope',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientScopeId: { type: 'string', description: 'Client scope ID' },
            mapperId: { type: 'string', description: 'Protocol mapper ID' },
            name: { type: 'string', description: 'Protocol mapper name' },
            protocol: { type: 'string', description: 'Protocol' },
            protocolMapper: { type: 'string', description: 'Protocol mapper type' },
            config: { type: 'object', description: 'Protocol mapper configuration' },
          },
          required: ['realm', 'clientScopeId', 'mapperId', 'name', 'protocol', 'protocolMapper'],
        },
      },
      {
        name: 'delete-protocol-mapper',
        description: 'Delete a protocol mapper from a client',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientId: { type: 'string', description: 'Client ID' },
            mapperId: { type: 'string', description: 'Protocol mapper ID' },
          },
          required: ['realm', 'clientId', 'mapperId'],
        },
      },
      {
        name: 'delete-client-scope-protocol-mapper',
        description: 'Delete a protocol mapper from a client scope',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientScopeId: { type: 'string', description: 'Client scope ID' },
            mapperId: { type: 'string', description: 'Protocol mapper ID' },
          },
          required: ['realm', 'clientScopeId', 'mapperId'],
        },
      },

      // User Attributes Management Tools (CRITICAL for organization data storage)
      {
        name: 'set-user-attributes',
        description: 'Set user attributes (CRITICAL for storing organization data)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
            attributes: { type: 'object', description: 'User attributes (key-value pairs where values are arrays)' },
          },
          required: ['realm', 'userId', 'attributes'],
        },
      },
      {
        name: 'get-user-attributes',
        description: 'Get user attributes including unmanaged attributes',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['realm', 'userId'],
        },
      },

      // Client Scopes Management Tools (CRITICAL for token scopes)
      {
        name: 'create-client-scope',
        description: 'Create a new client scope (CRITICAL for managing token scopes)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            name: { type: 'string', description: 'Client scope name' },
            description: { type: 'string', description: 'Client scope description' },
            protocol: { type: 'string', description: 'Protocol (e.g., openid-connect)' },
            attributes: { type: 'object', description: 'Client scope attributes' },
          },
          required: ['realm', 'name'],
        },
      },
      {
        name: 'update-client-scope',
        description: 'Update an existing client scope',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientScopeId: { type: 'string', description: 'Client scope ID' },
            name: { type: 'string', description: 'Client scope name' },
            description: { type: 'string', description: 'Client scope description' },
            protocol: { type: 'string', description: 'Protocol' },
            attributes: { type: 'object', description: 'Client scope attributes' },
          },
          required: ['realm', 'clientScopeId'],
        },
      },
      {
        name: 'delete-client-scope',
        description: 'Delete a client scope',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientScopeId: { type: 'string', description: 'Client scope ID' },
          },
          required: ['realm', 'clientScopeId'],
        },
      },
      {
        name: 'list-client-scopes',
        description: 'List all client scopes in a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'get-client-scope',
        description: 'Get details of a specific client scope',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            clientScopeId: { type: 'string', description: 'Client scope ID' },
          },
          required: ['realm', 'clientScopeId'],
        },
      },

      // Organizations Management Tools (CRITICAL for organization features)
      {
        name: 'create-organization',
        description: 'Create a new organization (CRITICAL for organization management)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            name: { type: 'string', description: 'Organization name' },
            description: { type: 'string', description: 'Organization description' },
            enabled: { type: 'boolean', description: 'Organization enabled status' },
            attributes: { type: 'object', description: 'Organization attributes' },
          },
          required: ['realm', 'name'],
        },
      },
      {
        name: 'update-organization',
        description: 'Update an existing organization',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            orgId: { type: 'string', description: 'Organization ID' },
            name: { type: 'string', description: 'Organization name' },
            description: { type: 'string', description: 'Organization description' },
            enabled: { type: 'boolean', description: 'Organization enabled status' },
            attributes: { type: 'object', description: 'Organization attributes' },
          },
          required: ['realm', 'orgId'],
        },
      },
      {
        name: 'delete-organization',
        description: 'Delete an organization',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            orgId: { type: 'string', description: 'Organization ID' },
          },
          required: ['realm', 'orgId'],
        },
      },
      {
        name: 'list-organizations',
        description: 'List all organizations in a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            search: { type: 'string', description: 'Search term' },
            first: { type: 'number', description: 'First result index' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'get-organization',
        description: 'Get details of a specific organization',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            orgId: { type: 'string', description: 'Organization ID' },
          },
          required: ['realm', 'orgId'],
        },
      },
      {
        name: 'add-organization-member',
        description: 'Add a user to an organization',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            orgId: { type: 'string', description: 'Organization ID' },
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['realm', 'orgId', 'userId'],
        },
      },
      {
        name: 'remove-organization-member',
        description: 'Remove a user from an organization',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            orgId: { type: 'string', description: 'Organization ID' },
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['realm', 'orgId', 'userId'],
        },
      },
      {
        name: 'list-organization-members',
        description: 'List all members of an organization',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            orgId: { type: 'string', description: 'Organization ID' },
            search: { type: 'string', description: 'Search term' },
            first: { type: 'number', description: 'First result index' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm', 'orgId'],
        },
      },

      // Advanced Role Management Tools
      {
        name: 'create-composite-role',
        description: 'Create composite roles (role hierarchies)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleId: { type: 'string', description: 'Role ID' },
            roles: {
              type: 'array',
              description: 'Array of roles to compose',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Role ID' },
                  name: { type: 'string', description: 'Role name' },
                },
                required: ['id', 'name'],
              },
            },
          },
          required: ['realm', 'roleId', 'roles'],
        },
      },
      {
        name: 'get-composite-roles',
        description: 'Get composite roles for a role',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleId: { type: 'string', description: 'Role ID' },
            search: { type: 'string', description: 'Search term' },
            first: { type: 'number', description: 'First result index' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm', 'roleId'],
        },
      },
      {
        name: 'delete-composite-roles',
        description: 'Delete composite roles from a role',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleId: { type: 'string', description: 'Role ID' },
            roles: {
              type: 'array',
              description: 'Array of roles to remove',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Role ID' },
                  name: { type: 'string', description: 'Role name' },
                },
                required: ['id', 'name'],
              },
            },
          },
          required: ['realm', 'roleId', 'roles'],
        },
      },
      {
        name: 'get-role-by-id',
        description: 'Get role details by ID',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleId: { type: 'string', description: 'Role ID' },
          },
          required: ['realm', 'roleId'],
        },
      },
      {
        name: 'update-role-by-id',
        description: 'Update role by ID',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleId: { type: 'string', description: 'Role ID' },
            name: { type: 'string', description: 'Role name' },
            description: { type: 'string', description: 'Role description' },
            composite: { type: 'boolean', description: 'Is composite role' },
            clientRole: { type: 'boolean', description: 'Is client role' },
            containerId: { type: 'string', description: 'Container ID' },
            attributes: { type: 'object', description: 'Role attributes' },
          },
          required: ['realm', 'roleId'],
        },
      },
      {
        name: 'delete-role-by-id',
        description: 'Delete role by ID',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleId: { type: 'string', description: 'Role ID' },
          },
          required: ['realm', 'roleId'],
        },
      },
      {
        name: 'find-users-with-role',
        description: 'Find users with a specific role',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            roleName: { type: 'string', description: 'Role name' },
            first: { type: 'number', description: 'First result index' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm', 'roleName'],
        },
      },
      {
        name: 'assign-role-to-group',
        description: 'Assign a role to a group',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            groupId: { type: 'string', description: 'Group ID' },
            roleName: { type: 'string', description: 'Role name' },
          },
          required: ['realm', 'groupId', 'roleName'],
        },
      },
      {
        name: 'remove-role-from-group',
        description: 'Remove a role from a group',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            groupId: { type: 'string', description: 'Group ID' },
            roleName: { type: 'string', description: 'Role name' },
          },
          required: ['realm', 'groupId', 'roleName'],
        },
      },
      {
        name: 'get-group-roles',
        description: 'Get roles assigned to a group',
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
        name: 'list-available-group-roles',
        description: 'List available roles for a group',
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
        name: 'list-composite-group-roles',
        description: 'List composite roles for a group',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            groupId: { type: 'string', description: 'Group ID' },
          },
          required: ['realm', 'groupId'],
        },
      },

      // Group Attributes Management Tools
      {
        name: 'set-group-attributes',
        description: 'Set group attributes (organization metadata)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            groupId: { type: 'string', description: 'Group ID' },
            attributes: { type: 'object', description: 'Group attributes' },
          },
          required: ['realm', 'groupId', 'attributes'],
        },
      },
      {
        name: 'get-group-attributes',
        description: 'Get group attributes',
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
        name: 'create-child-group',
        description: 'Create a child group (subgroup)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            parentGroupId: { type: 'string', description: 'Parent group ID' },
            name: { type: 'string', description: 'Group name' },
            attributes: { type: 'object', description: 'Group attributes' },
          },
          required: ['realm', 'parentGroupId', 'name'],
        },
      },
      {
        name: 'list-sub-groups',
        description: 'List subgroups of a parent group',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            parentGroupId: { type: 'string', description: 'Parent group ID' },
            search: { type: 'string', description: 'Search term' },
            first: { type: 'number', description: 'First result index' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm', 'parentGroupId'],
        },
      },
      {
        name: 'list-group-members',
        description: 'List members of a group',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            groupId: { type: 'string', description: 'Group ID' },
            first: { type: 'number', description: 'First result index' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm', 'groupId'],
        },
      },

      // Identity Providers Management Tools (SSO integration)
      {
        name: 'create-identity-provider',
        description: 'Create a new identity provider for SSO integration',
        inputSchema: {
          type: 'object',
                     properties: {
             realm: { type: 'string', description: 'Realm name' },
             alias: { type: 'string', description: 'Identity provider alias' },
             displayName: { type: 'string', description: 'Display name' },
             providerId: { type: 'string', description: 'Provider ID (e.g., saml, oidc)' },
             enabled: { type: 'boolean', description: 'Enabled status' },
             trustEmail: { type: 'boolean', description: 'Trust email' },
             storeToken: { type: 'boolean', description: 'Store token' },
             addReadTokenRoleOnCreate: { type: 'boolean', description: 'Add read token role on create' },
             linkOnly: { type: 'boolean', description: 'Link only' },
             firstBrokerLoginFlowAlias: { type: 'string', description: 'First broker login flow alias' },
             config: { type: 'object', description: 'Identity provider configuration' },
           },
           required: ['realm', 'alias', 'providerId'],
        },
      },
      {
        name: 'update-identity-provider',
        description: 'Update an existing identity provider',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
            displayName: { type: 'string', description: 'Display name' },
            providerId: { type: 'string', description: 'Provider ID' },
            enabled: { type: 'boolean', description: 'Enabled status' },
            trustEmail: { type: 'boolean', description: 'Trust email' },
                         storeToken: { type: 'boolean', description: 'Store token' },
             addReadTokenRoleOnCreate: { type: 'boolean', description: 'Add read token role on create' },
             linkOnly: { type: 'boolean', description: 'Link only' },
             firstBrokerLoginFlowAlias: { type: 'string', description: 'First broker login flow alias' },
             config: { type: 'object', description: 'Identity provider configuration' },
           },
           required: ['realm', 'alias'],
        },
      },
      {
        name: 'delete-identity-provider',
        description: 'Delete an identity provider',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
          },
          required: ['realm', 'alias'],
        },
      },
      {
        name: 'list-identity-providers',
        description: 'List all identity providers in a realm',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            search: { type: 'string', description: 'Search term' },
            first: { type: 'number', description: 'First result index' },
            max: { type: 'number', description: 'Maximum results' },
          },
          required: ['realm'],
        },
      },
      {
        name: 'get-identity-provider',
        description: 'Get details of a specific identity provider',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
          },
          required: ['realm', 'alias'],
        },
      },
      {
        name: 'create-identity-provider-mapper',
        description: 'Create a mapper for identity provider (external user mapping)',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
            name: { type: 'string', description: 'Mapper name' },
            identityProviderMapper: { type: 'string', description: 'Mapper type' },
            config: { type: 'object', description: 'Mapper configuration' },
          },
          required: ['realm', 'alias', 'name', 'identityProviderMapper'],
        },
      },
      {
        name: 'update-identity-provider-mapper',
        description: 'Update an identity provider mapper',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
            mapperId: { type: 'string', description: 'Mapper ID' },
            name: { type: 'string', description: 'Mapper name' },
            identityProviderMapper: { type: 'string', description: 'Mapper type' },
            config: { type: 'object', description: 'Mapper configuration' },
          },
          required: ['realm', 'alias', 'mapperId', 'name', 'identityProviderMapper'],
        },
      },
      {
        name: 'delete-identity-provider-mapper',
        description: 'Delete an identity provider mapper',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
            mapperId: { type: 'string', description: 'Mapper ID' },
          },
          required: ['realm', 'alias', 'mapperId'],
        },
      },
      {
        name: 'list-identity-provider-mappers',
        description: 'List all mappers for an identity provider',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
          },
          required: ['realm', 'alias'],
        },
      },
      {
        name: 'get-identity-provider-mapper',
        description: 'Get details of a specific identity provider mapper',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
            mapperId: { type: 'string', description: 'Mapper ID' },
          },
          required: ['realm', 'alias', 'mapperId'],
        },
      },
      {
        name: 'list-identity-provider-mapper-types',
        description: 'List available mapper types for an identity provider',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            alias: { type: 'string', description: 'Identity provider alias' },
          },
          required: ['realm', 'alias'],
        },
      },
      {
        name: 'import-identity-provider-from-url',
        description: 'Import identity provider configuration from URL',
        inputSchema: {
          type: 'object',
          properties: {
            realm: { type: 'string', description: 'Realm name' },
            providerId: { type: 'string', description: 'Provider ID' },
            fromUrl: { type: 'string', description: 'URL to import from' },
          },
          required: ['realm', 'providerId', 'fromUrl'],
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

      // Protocol Mappers Management Tools (CRITICAL for JWT organization problem)
      case 'create-protocol-mapper': {
        const { realm, clientId, name, protocol, protocolMapper, config = {} } = CreateProtocolMapperSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const clients = await client.clients.find({ clientId });
          if (clients.length === 0 || !clients[0].id) {
            throw new Error(`Client ${clientId} not found or invalid`);
          }
          return await client.clients.addProtocolMapper({ id: clients[0].id }, {
            name,
            protocol,
            protocolMapper,
            config,
          });
        });
        return { content: [{ type: 'text', text: `Protocol mapper created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'create-client-scope-protocol-mapper': {
        const { realm, clientScopeId, name, protocol, protocolMapper, config = {} } = CreateClientScopeProtocolMapperSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clientScopes.addProtocolMapper({ id: clientScopeId }, {
            name,
            protocol,
            protocolMapper,
            config,
          });
        });
        return { content: [{ type: 'text', text: `Client scope protocol mapper created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'list-protocol-mappers': {
        const { realm, clientId } = ListProtocolMappersSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const clients = await client.clients.find({ clientId });
          if (clients.length === 0 || !clients[0].id) {
            throw new Error(`Client ${clientId} not found or invalid`);
          }
          return await client.clients.listProtocolMappers({ id: clients[0].id });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list-client-scope-protocol-mappers': {
        const { realm, clientScopeId } = ListClientScopeProtocolMappersSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clientScopes.listProtocolMappers({ id: clientScopeId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'update-protocol-mapper': {
        const { realm, clientId, mapperId, name, protocol, protocolMapper, config = {} } = UpdateProtocolMapperSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const clients = await client.clients.find({ clientId });
          if (clients.length === 0 || !clients[0].id) {
            throw new Error(`Client ${clientId} not found or invalid`);
          }
          return await client.clients.updateProtocolMapper({ id: clients[0].id, mapperId }, {
            name,
            protocol,
            protocolMapper,
            config,
          });
        });
        return { content: [{ type: 'text', text: `Protocol mapper updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-client-scope-protocol-mapper': {
        const { realm, clientScopeId, mapperId, name, protocol, protocolMapper, config = {} } = UpdateClientScopeProtocolMapperSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clientScopes.updateProtocolMapper({ id: clientScopeId, mapperId }, {
            name,
            protocol,
            protocolMapper,
            config,
          });
        });
        return { content: [{ type: 'text', text: `Client scope protocol mapper updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-protocol-mapper': {
        const { realm, clientId, mapperId } = DeleteProtocolMapperSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const clients = await client.clients.find({ clientId });
          if (clients.length === 0 || !clients[0].id) {
            throw new Error(`Client ${clientId} not found or invalid`);
          }
          await client.clients.delProtocolMapper({ id: clients[0].id, mapperId });
        });
        return { content: [{ type: 'text', text: `Protocol mapper ${mapperId} deleted successfully from client ${clientId}` }] };
      }

      case 'delete-client-scope-protocol-mapper': {
        const { realm, clientScopeId, mapperId } = DeleteClientScopeProtocolMapperSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.clientScopes.delProtocolMapper({ id: clientScopeId, mapperId });
        });
        return { content: [{ type: 'text', text: `Protocol mapper ${mapperId} deleted successfully from client scope ${clientScopeId}` }] };
      }

      // User Attributes Management Tools (CRITICAL for organization data storage)
      case 'set-user-attributes': {
        const { realm, userId, attributes } = SetUserAttributesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const user = await client.users.findOne({ id: userId });
          if (!user) {
            throw new Error(`User ${userId} not found`);
          }
          return await client.users.update({ id: userId }, { 
            ...user, 
            attributes 
          });
        });
        return { content: [{ type: 'text', text: `User attributes set successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'get-user-attributes': {
        const { realm, userId } = GetUserAttributesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const user = await client.users.findOne({ id: userId });
          if (!user) {
            throw new Error(`User ${userId} not found`);
          }
          const unmanagedAttributes = await client.users.getUnmanagedAttributes({ id: userId });
          return {
            user: user,
            attributes: user.attributes || {},
            unmanagedAttributes: unmanagedAttributes || {}
          };
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Client Scopes Management Tools (CRITICAL for token scopes)
      case 'create-client-scope': {
        const { realm, name, description, protocol = 'openid-connect', attributes = {} } = CreateClientScopeSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clientScopes.create({
            name,
            description,
            protocol,
            attributes,
          });
        });
        return { content: [{ type: 'text', text: `Client scope created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-client-scope': {
        const { realm, clientScopeId, ...updateData } = UpdateClientScopeSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clientScopes.update({ id: clientScopeId }, updateData);
        });
        return { content: [{ type: 'text', text: `Client scope updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-client-scope': {
        const { realm, clientScopeId } = DeleteClientScopeSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.clientScopes.del({ id: clientScopeId });
        });
        return { content: [{ type: 'text', text: `Client scope ${clientScopeId} deleted successfully` }] };
      }

      case 'list-client-scopes': {
        const { realm } = ListClientScopesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clientScopes.find();
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get-client-scope': {
        const { realm, clientScopeId } = GetClientScopeSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.clientScopes.findOne({ id: clientScopeId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Organizations Management Tools (CRITICAL for organization features)
      case 'create-organization': {
        const { realm, name, description, enabled, attributes } = CreateOrganizationSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.organizations.create({
            name,
            description,
            enabled,
            attributes,
          });
        });
        return { content: [{ type: 'text', text: `Organization created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-organization': {
        const { realm, orgId, ...updateData } = UpdateOrganizationSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.organizations.updateById({ id: orgId }, updateData);
        });
        return { content: [{ type: 'text', text: `Organization updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-organization': {
        const { realm, orgId } = DeleteOrganizationSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.organizations.delById({ id: orgId });
        });
        return { content: [{ type: 'text', text: `Organization ${orgId} deleted successfully` }] };
      }

      case 'list-organizations': {
        const { realm, search, first, max } = ListOrganizationsSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const params: any = {};
          if (search) params.search = search;
          if (first) params.first = first;
          if (max) params.max = max;
          return await client.organizations.find(params);
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get-organization': {
        const { realm, orgId } = GetOrganizationSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.organizations.findOne({ id: orgId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'add-organization-member': {
        const { realm, orgId, userId } = AddOrganizationMemberSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.organizations.addMember({ orgId, userId });
        });
        return { content: [{ type: 'text', text: `User ${userId} added to organization ${orgId}: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'remove-organization-member': {
        const { realm, orgId, userId } = RemoveOrganizationMemberSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.organizations.delMember({ orgId, userId });
        });
        return { content: [{ type: 'text', text: `User ${userId} removed from organization ${orgId}: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'list-organization-members': {
        const { realm, orgId, search, first, max } = ListOrganizationMembersSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const params: any = { orgId };
          if (search) params.search = search;
          if (first) params.first = first;
          if (max) params.max = max;
          return await client.organizations.listMembers(params);
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Advanced Role Management Tools
      case 'create-composite-role': {
        const { realm, roleId, roles } = CreateCompositeRoleSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.roles.createComposite({ roleId }, roles);
        });
        return { content: [{ type: 'text', text: `Composite role created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'get-composite-roles': {
        const { realm, roleId, search, first, max } = GetCompositeRolesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const params: any = { id: roleId };
          if (search) params.search = search;
          if (first) params.first = first;
          if (max) params.max = max;
          return await client.roles.getCompositeRoles(params);
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'delete-composite-roles': {
        const { realm, roleId, roles } = DeleteCompositeRolesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.roles.delCompositeRoles({ id: roleId }, roles);
        });
        return { content: [{ type: 'text', text: `Composite roles deleted successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'get-role-by-id': {
        const { realm, roleId } = GetRoleByIdSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.roles.findOneById({ id: roleId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'update-role-by-id': {
        const { realm, roleId, ...updateData } = UpdateRoleByIdSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.roles.updateById({ id: roleId }, updateData);
        });
        return { content: [{ type: 'text', text: `Role updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-role-by-id': {
        const { realm, roleId } = DeleteRoleByIdSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.roles.delById({ id: roleId });
        });
        return { content: [{ type: 'text', text: `Role ${roleId} deleted successfully` }] };
      }

      case 'find-users-with-role': {
        const { realm, roleName, first, max } = FindUsersWithRoleSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const params: any = { name: roleName };
          if (first) params.first = first;
          if (max) params.max = max;
          return await client.roles.findUsersWithRole(params);
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'assign-role-to-group': {
        const { realm, groupId, roleName } = AssignRoleToGroupSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const role = await client.roles.findOneByName({ name: roleName });
          if (!role || !role.id || !role.name) {
            throw new Error(`Role ${roleName} not found or invalid`);
          }
          await client.groups.addRealmRoleMappings({ id: groupId, roles: [{ id: role.id, name: role.name }] });
        });
        return { content: [{ type: 'text', text: `Role ${roleName} assigned to group ${groupId} successfully` }] };
      }

      case 'remove-role-from-group': {
        const { realm, groupId, roleName } = RemoveRoleFromGroupSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const role = await client.roles.findOneByName({ name: roleName });
          if (!role || !role.id || !role.name) {
            throw new Error(`Role ${roleName} not found or invalid`);
          }
          await client.groups.delRealmRoleMappings({ id: groupId, roles: [{ id: role.id, name: role.name }] });
        });
        return { content: [{ type: 'text', text: `Role ${roleName} removed from group ${groupId} successfully` }] };
      }

      case 'get-group-roles': {
        const { realm, groupId } = GetGroupRolesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.groups.listRealmRoleMappings({ id: groupId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list-available-group-roles': {
        const { realm, groupId } = ListAvailableGroupRolesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.groups.listAvailableRealmRoleMappings({ id: groupId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list-composite-group-roles': {
        const { realm, groupId } = ListCompositeGroupRolesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.groups.listCompositeRealmRoleMappings({ id: groupId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Group Attributes Management Tools
      case 'set-group-attributes': {
        const { realm, groupId, attributes } = SetGroupAttributesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const group = await client.groups.findOne({ id: groupId });
          if (!group) {
            throw new Error(`Group ${groupId} not found`);
          }
          return await client.groups.update({ id: groupId }, { 
            ...group, 
            attributes 
          });
        });
        return { content: [{ type: 'text', text: `Group attributes set successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'get-group-attributes': {
        const { realm, groupId } = GetGroupAttributesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const group = await client.groups.findOne({ id: groupId });
          if (!group) {
            throw new Error(`Group ${groupId} not found`);
          }
          return {
            group: group,
            attributes: group.attributes || {}
          };
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'create-child-group': {
        const { realm, parentGroupId, name, attributes } = CreateChildGroupSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.groups.createChildGroup({ id: parentGroupId }, {
            name,
            attributes,
          });
        });
        return { content: [{ type: 'text', text: `Child group created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'list-sub-groups': {
        const { realm, parentGroupId, search, first, max } = ListSubGroupsSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const params: any = { parentId: parentGroupId };
          if (search) params.search = search;
          if (first) params.first = first;
          if (max) params.max = max;
          return await client.groups.listSubGroups(params);
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list-group-members': {
        const { realm, groupId, first, max } = ListGroupMembersSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const params: any = { id: groupId };
          if (first) params.first = first;
          if (max) params.max = max;
          return await client.groups.listMembers(params);
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Identity Providers Management Tools (SSO integration)
      case 'create-identity-provider': {
        const { realm, alias, displayName, providerId, enabled, trustEmail, storeToken, addReadTokenRoleOnCreate, linkOnly, firstBrokerLoginFlowAlias, config } = CreateIdentityProviderSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.create({
            alias,
            displayName,
            providerId,
            enabled,
            trustEmail,
            storeToken,
            addReadTokenRoleOnCreate,
            linkOnly,
            firstBrokerLoginFlowAlias,
            config,
          });
        });
        return { content: [{ type: 'text', text: `Identity provider created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-identity-provider': {
        const { realm, alias, ...updateData } = UpdateIdentityProviderSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.update({ alias }, updateData);
        });
        return { content: [{ type: 'text', text: `Identity provider updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-identity-provider': {
        const { realm, alias } = DeleteIdentityProviderSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.identityProviders.del({ alias });
        });
        return { content: [{ type: 'text', text: `Identity provider ${alias} deleted successfully` }] };
      }

      case 'list-identity-providers': {
        const { realm, search, first, max } = ListIdentityProvidersSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          const params: any = {};
          if (search) params.search = search;
          if (first) params.first = first;
          if (max) params.max = max;
          return await client.identityProviders.find(params);
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get-identity-provider': {
        const { realm, alias } = GetIdentityProviderSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.findOne({ alias });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'create-identity-provider-mapper': {
        const { realm, alias, name, identityProviderMapper, config = {} } = CreateIdentityProviderMapperSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.createMapper({ alias, identityProviderMapper: {
            name,
            identityProviderMapper,
            config,
          }});
        });
        return { content: [{ type: 'text', text: `Identity provider mapper created successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'update-identity-provider-mapper': {
        const { realm, alias, mapperId, name, identityProviderMapper, config = {} } = UpdateIdentityProviderMapperSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.updateMapper({ alias, id: mapperId }, {
            name,
            identityProviderMapper,
            config,
          });
        });
        return { content: [{ type: 'text', text: `Identity provider mapper updated successfully: ${JSON.stringify(result, null, 2)}` }] };
      }

      case 'delete-identity-provider-mapper': {
        const { realm, alias, mapperId } = DeleteIdentityProviderMapperSchema.parse(args);
        await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          await client.identityProviders.delMapper({ alias, id: mapperId });
        });
        return { content: [{ type: 'text', text: `Identity provider mapper ${mapperId} deleted successfully` }] };
      }

      case 'list-identity-provider-mappers': {
        const { realm, alias } = ListIdentityProviderMappersSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.findMappers({ alias });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get-identity-provider-mapper': {
        const { realm, alias, mapperId } = GetIdentityProviderMapperSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.findOneMapper({ alias, id: mapperId });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list-identity-provider-mapper-types': {
        const { realm, alias } = ListIdentityProviderMapperTypesSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.findMapperTypes({ alias });
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'import-identity-provider-from-url': {
        const { realm, providerId, fromUrl } = ImportIdentityProviderFromUrlSchema.parse(args);
        const result = await adminManager.executeOperation(async (client) => {
          client.setConfig({ realmName: realm });
          return await client.identityProviders.importFromUrl({ providerId, fromUrl });
        });
        return { content: [{ type: 'text', text: `Identity provider imported successfully: ${JSON.stringify(result, null, 2)}` }] };
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