const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

let client = null;

function getDB() {
  if (client) return client;

  const url = process.env.TURSO_URL || `file:${path.join(__dirname, 'local.db')}`;
  const authToken = process.env.TURSO_TOKEN || '';

  console.log(`Connecting to database at: ${url}`);
  client = createClient({
    url: url,
    authToken: authToken,
  });

  return client;
}

async function initDB() {
  const db = getDB();

  // Create tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      plan TEXT NOT NULL,
      member_limit INTEGER NOT NULL,
      created_date TEXT NOT NULL,
      ceo_email TEXT,
      smtp_host TEXT,
      smtp_port TEXT,
      smtp_user TEXT,
      smtp_pass TEXT,
      smtp_secure TEXT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      whatsapp TEXT,
      tenant_id TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      permissions TEXT,
      password_changed INTEGER DEFAULT 1,
      smtp_host TEXT,
      smtp_port TEXT,
      smtp_user TEXT,
      smtp_pass TEXT,
      smtp_secure TEXT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      designation TEXT,
      phone TEXT,
      email TEXT,
      source TEXT,
      status TEXT,
      found_by TEXT,
      summary TEXT,
      created_date TEXT,
      assigned_agent TEXT,
      post_url TEXT,
      tenant_id TEXT NOT NULL,
      organization TEXT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS delete_requests (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      lead_name TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL,
      created_date TEXT NOT NULL,
      tenant_id TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS otp_store (
      email TEXT PRIMARY KEY,
      otp TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      reset_token TEXT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT,
      client_address TEXT,
      client_gst TEXT,
      invoice_date TEXT NOT NULL,
      amount REAL NOT NULL,
      gst_rate REAL DEFAULT 18,
      cgst REAL,
      sgst REAL,
      igst REAL,
      total_amount REAL,
      status TEXT DEFAULT 'Unpaid',
      items TEXT
    );
  `);

  // Schema Migrations helper list
  const migrations = [
    { table: 'leads', column: 'found_by', type: 'TEXT' },
    { table: 'leads', column: 'summary', type: 'TEXT' },
    { table: 'leads', column: 'created_date', type: 'TEXT' },
    { table: 'leads', column: 'assigned_agent', type: 'TEXT' },
    { table: 'leads', column: 'post_url', type: 'TEXT' },
    { table: 'agents', column: 'whatsapp', type: 'TEXT' },
    { table: 'agents', column: 'tenant_id', type: 'TEXT' },
    { table: 'agents', column: 'role', type: 'TEXT' },
    { table: 'agents', column: 'permissions', type: 'TEXT' },
    { table: 'agents', column: 'password_changed', type: 'INTEGER DEFAULT 1' },
    { table: 'leads', column: 'designation', type: 'TEXT' },
    { table: 'leads', column: 'phone', type: 'TEXT' },
    { table: 'leads', column: 'email', type: 'TEXT' },
    { table: 'leads', column: 'source', type: 'TEXT' },
    { table: 'leads', column: 'status', type: 'TEXT' },
    { table: 'leads', column: 'last_follow_up', type: 'TEXT' },
    { table: 'leads', column: 'next_follow_up', type: 'TEXT' },
    { table: 'leads', column: 'tenant_id', type: 'TEXT' },
    { table: 'leads', column: 'organization', type: 'TEXT' },
    { table: 'delete_requests', column: 'lead_name', type: 'TEXT' },
    { table: 'delete_requests', column: 'reason', type: 'TEXT' },
    { table: 'delete_requests', column: 'status', type: 'TEXT' },
    { table: 'delete_requests', column: 'created_date', type: 'TEXT' },
    { table: 'delete_requests', column: 'tenant_id', type: 'TEXT' },
    { table: 'companies', column: 'ceo_email', type: 'TEXT' },
    { table: 'companies', column: 'smtp_host', type: 'TEXT' },
    { table: 'companies', column: 'smtp_port', type: 'TEXT' },
    { table: 'companies', column: 'smtp_user', type: 'TEXT' },
    { table: 'companies', column: 'smtp_pass', type: 'TEXT' },
    { table: 'companies', column: 'smtp_secure', type: 'TEXT' },
    { table: 'agents', column: 'smtp_host', type: 'TEXT' },
    { table: 'agents', column: 'smtp_port', type: 'TEXT' },
    { table: 'agents', column: 'smtp_user', type: 'TEXT' },
    { table: 'agents', column: 'smtp_pass', type: 'TEXT' },
    { table: 'agents', column: 'smtp_secure', type: 'TEXT' },
    { table: 'companies', column: 'sync_settings_pin', type: 'TEXT DEFAULT "4321"' },
    { table: 'companies', column: 'delete_lead_pin', type: 'TEXT DEFAULT "0000"' },
    { table: 'companies', column: 'logo_url', type: 'TEXT' },
    { table: 'companies', column: 'gst_number', type: 'TEXT' },
    { table: 'companies', column: 'cin_number', type: 'TEXT' },
    { table: 'companies', column: 'msme_number', type: 'TEXT' },
    { table: 'companies', column: 'company_address', type: 'TEXT' }
  ];

  for (const m of migrations) {
    try {
      await db.execute(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type};`);
      console.log(`Schema Migration: Added column "${m.column}" to table "${m.table}"`);
    } catch (err) {
      // Safe to ignore if column already exists
    }
  }

  // Backfill existing companies ceo_email from agents table
  try {
    await db.execute(`
      UPDATE companies 
      SET ceo_email = (
        SELECT email FROM agents 
        WHERE tenant_id = companies.id AND role = 'Manager' 
        LIMIT 1
      ) 
      WHERE ceo_email IS NULL OR ceo_email = '';
    `);
    console.log("Schema Migration: Backfilled company ceo_email fields from agents table.");
  } catch (err) {
    console.error("Backfilling companies ceo_email failed:", err);
  }

  // Default companies and agents seeding removed to keep database clean.

  // Ensure the user's requested Super Admin account is registered and active
  const superEmail = 'info@neogencode.com';
  const superPassword = 'neogencode';
  const salt = bcrypt.genSaltSync(10);
  const hashedSuperPassword = bcrypt.hashSync(superPassword, salt);

  try {
    const superCheck = await db.execute({
      sql: "SELECT id FROM agents WHERE email = ? LIMIT 1;",
      args: [superEmail]
    });

    if (superCheck.rows.length === 0) {
      // Insert new Super Admin
      await db.execute({
        sql: "INSERT INTO agents (id, name, email, whatsapp, tenant_id, password, role, permissions, password_changed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);",
        args: [
          'agent-super-admin-neogencode',
          'Super Admin',
          superEmail,
          '',
          'all',
          hashedSuperPassword,
          'Super Admin',
          '{}'
        ]
      });
      console.log(`Seeded Super Admin: ${superEmail}`);
    } else {
      // Update existing to ensure role and password match the user's request
      await db.execute({
        sql: "UPDATE agents SET password = ?, role = 'Super Admin', tenant_id = 'all' WHERE email = ?;",
        args: [hashedSuperPassword, superEmail]
      });
      console.log(`Updated Super Admin credentials for: ${superEmail}`);
    }
  } catch (err) {
    console.error("Failed to ensure custom Super Admin credentials:", err);
  }

  // Seed some mock leads if empty
  const leadCheck = await db.execute("SELECT COUNT(*) as count FROM leads;");
  if (leadCheck.rows[0].count === 0) {
    console.log("Seeding default mock leads...");
    const today = new Date().toISOString().split('T')[0];
    const mockLeads = [
      {
        id: 'lead-1',
        name: 'David Chen',
        designation: 'VP of Technology at ByteFlow',
        phone: '+1 555-0142',
        email: 'dchen@byteflow.io',
        source: 'LinkedIn',
        status: 'inprogress',
        last_follow_up: '2 days ago',
        next_follow_up: 'Today',
        found_by: 'Alex (CEO)',
        summary: 'Interested in core database upgrades.',
        assigned_agent: 'Sarah (Sales)',
        organization: 'ABC Technologies',
        tenant_id: 'tenant-abc',
        created_date: today,
        post_url: ''
      },
      {
        id: 'lead-2',
        name: 'Sarah Jenkins',
        designation: 'Product Manager at CloudScale',
        phone: '+1 555-0189',
        email: 'sarah.j@cloudscale.com',
        source: 'Website',
        status: 'new',
        last_follow_up: 'Today',
        next_follow_up: 'Tomorrow',
        found_by: 'Alex (CEO)',
        summary: 'Needs pricing info for enterprise tier.',
        assigned_agent: 'Sarah (Sales)',
        organization: 'ABC Technologies',
        tenant_id: 'tenant-abc',
        created_date: today,
        post_url: ''
      }
    ];

    for (const l of mockLeads) {
      await db.execute({
        sql: "INSERT INTO leads (id, name, designation, phone, email, source, status, last_follow_up, next_follow_up, found_by, summary, created_date, assigned_agent, post_url, tenant_id, organization) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        args: [l.id, l.name, l.designation, l.phone, l.email, l.source, l.status, l.last_follow_up, l.next_follow_up, l.found_by, l.summary, l.created_date, l.assigned_agent, l.post_url, l.tenant_id, l.organization]
      });
    }
  }

  console.log("Database initialized successfully.");
}

module.exports = {
  getDB,
  initDB
};
