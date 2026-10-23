import path from 'node:path';

try { process.loadEnvFile?.(path.join(process.cwd(), '.env')); } catch {}
const env = (k: string, d = '') => process.env[k] ?? d;
const ROOT = process.cwd();

// ==== SERVER ====
export const PORT = Number(env('PORT', '4747'));
export const HOST = env('HOST', '127.0.0.1');

// ==== MODELS ====
export const MODEL_MAIN = env('MODEL_MAIN', 'openai/gpt-6.1-sol');
export const MODEL_LIGHT = env('MODEL_LIGHT', 'openai/gpt-6-luna');
export const MAX_STEPS = Number(env('MAX_STEPS', '12'));
export const OLLAMA_BASE_URL = env('OLLAMA_BASE_URL', 'http://localhost:11434');

// ==== BUDGET (tokens per UTC day across all models) ====
export const DAILY_TOKEN_BUDGET = Number(env('DAILY_TOKEN_BUDGET', '4000000'));
export const BUDGET_DOWNGRADE_AT = Number(env('BUDGET_DOWNGRADE_AT', '0.85')); // share spent before MODEL_MAIN -> MODEL_LIGHT
export const COMPACT_AT = Number(env('COMPACT_AT', '120000'));                 // input tokens of one request
export const APPROVAL_TIMEOUT_MS = Number(env('APPROVAL_TIMEOUT_MS', String(10 * 60_000)));

// ==== PATHS ====
export const MODES_DIR = path.join(ROOT, 'modes');
export const CARTRIDGES_DIR = path.join(ROOT, 'cartridges');
export const DATA_DIR = path.join(ROOT, 'data');
export const UI_DIR = path.join(ROOT, 'ui');
export const WORKSPACE_DIR = env('WORKSPACE_DIR', path.join(ROOT, 'workspace'));
export const SKILLS_PATH = env('SKILLS_PATH', '');
export const DB_PATH = path.join(DATA_DIR, 'agent.sqlite');

// ==== IMESSAGE ====
export const IMSG_BIN = env('IMSG_BIN', 'imsg');
export const ALLOWED_HANDLES = env('ALLOWED_HANDLES', '').split(',').map((s) => s.trim()).filter(Boolean);
export const IMESSAGE_ENABLED = env('IMESSAGE', ALLOWED_HANDLES.length ? '1' : '0') === '1';

// ==== DESK ====
export const DESK_DIR = path.join(ROOT, 'desk');
export const OUT_DIR = path.join(ROOT, 'out');
export const LOGBOOK_DIR = path.join(DATA_DIR, 'logbook');
export const ENV_PATH = path.join(ROOT, '.env');
export const LOOP_INTERVAL_MIN = Number(env('LOOP_INTERVAL_MIN', '5'));
export const IMAP_HOST = env('IMAP_HOST');
export const IMAP_PORT = Number(env('IMAP_PORT', '993'));
export const IMAP_USER = env('IMAP_USER');
export const IMAP_PASS = env('IMAP_PASS');
export const IMAP_MAILBOX = env('IMAP_MAILBOX', 'INBOX');

// ==== TOOLS ====
export const SHELL_TIMEOUT_MS = Number(env('SHELL_TIMEOUT_MS', '60000'));
export const TOOL_OUTPUT_CAP = Number(env('TOOL_OUTPUT_CAP', '20000'));          // chars returned to the model
