import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { Document } from '@langchain/core/documents';
import { MCPServerConfig } from '@/lib/types/mcp';

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    role: text('role', { enum: ['assistant', 'user', 'source'] }).notNull(),
    chatId: text('chatId').notNull(),
    createdAt: timestamp('createdAt')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    messageId: text('messageId').notNull(),
    content: text('content'),
    sources: jsonb('sources')
      .$type<Document[]>()
      .default(sql`'[]'::jsonb`),
  },
  (table) => ({
    chatIdIdx: index('messages_chatId_idx').on(table.chatId),
  }),
);

interface FileReference {
  name: string;
  fileId: string;
}

export const chats = pgTable(
  'chats',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    createdAt: timestamp('createdAt')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    focusMode: text('focusMode').notNull(),
    files: jsonb('files')
      .$type<FileReference[]>()
      .default(sql`'[]'::jsonb`),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
  },
  (table) => ({
    userIdIdx: index('chats_user_id_idx').on(table.userId),
  }),
);

export const users = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  password: text('password'),
  image: text('image'),
  role: text('role').notNull().default('user'),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
});

export const sessions = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  impersonatedBy: text('impersonated_by'),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('account', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const verifications = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at')
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp('updated_at')
    .$defaultFn(() => new Date())
    .notNull(),
});

export const mcpServers = pgTable('mcp_server', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  name: text('name').notNull(),
  config: jsonb('config').notNull().$type<MCPServerConfig>(),
  enabled: boolean('enabled').notNull().default(true),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  visibility: text('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const mcpServerCustomInstructions = pgTable(
  'mcp_server_custom_instructions',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mcpServerId: uuid('mcp_server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    prompt: text('prompt'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userServerUnique: unique(
      'mcp_server_custom_instructions_user_id_mcp_server_id_unique',
    ).on(table.userId, table.mcpServerId),
  }),
);

export const mcpToolCustomInstructions = pgTable(
  'mcp_server_tool_custom_instructions',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    mcpServerId: uuid('mcp_server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    prompt: text('prompt'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userToolUnique: unique(
      'mcp_server_tool_custom_instructions_user_id_tool_name_mcp_server_id_unique',
    ).on(table.userId, table.toolName, table.mcpServerId),
  }),
);

export const mcpOAuthSessions = pgTable(
  'mcp_oauth_session',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    mcpServerId: uuid('mcp_server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    serverUrl: text('server_url').notNull(),
    clientInfo: jsonb('client_info'),
    tokens: jsonb('tokens'),
    codeVerifier: text('code_verifier'),
    state: text('state').unique(),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    serverIdIdx: index('mcp_oauth_session_server_id_idx').on(table.mcpServerId),
    stateIdx: index('mcp_oauth_session_state_idx').on(table.state),
  }),
);
