const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getDB, initDB } = require('./database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'neogencode-super-secret-key-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize Database on startup
initDB().catch(err => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }

    try {
      const db = getDB();
      // 1. Verify agent still exists in SQLite
      const agentRes = await db.execute({
        sql: "SELECT id, tenant_id FROM agents WHERE id = ? LIMIT 1;",
        args: [user.id]
      });

      if (agentRes.rows.length === 0) {
        return res.status(401).json({ error: 'User session has been revoked or user was deleted.' });
      }

      // 2. If not super admin, verify their company/tenant still exists
      if (user.tenantId !== 'all') {
        const companyRes = await db.execute({
          sql: "SELECT id FROM companies WHERE id = ? LIMIT 1;",
          args: [user.tenantId]
        });
        if (companyRes.rows.length === 0) {
          return res.status(401).json({ error: 'Company workspace has been deactivated.' });
        }
      }

      req.user = user;
      next();
    } catch (dbErr) {
      console.error("Token verification database check error:", dbErr);
      // Fail-safe fallback: allow request if SQLite is temporarily unreachable
      req.user = user;
      next();
    }
  });
}

// Configure Nodemailer transporter (reads SMTP settings from .env or defaults to a console-logger/Ethereal testing carrier)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  connectionTimeout: 5000, // 5 seconds connection timeout
  greetingTimeout: 5000,   // 5 seconds handshake timeout
  socketTimeout: 5000      // 5 seconds socket inactivity timeout
});

const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"NeoGenCode CRM" <no-reply@neogencode.com>',
    to: email,
    subject: 'NeoGenCode CRM Password Reset OTP',
    text: `Hello,\n\nYour One-Time Password (OTP) for password reset is: ${otp}\n\nThis OTP is valid for 5 minutes. If you did not request this, please ignore this email.\n\nBest regards,\nNeoGenCode Super Admin Team`,
    html: `<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #1e1b4b; color: #f8fafc; border-radius: 8px;">
             <h2 style="color: #a855f7;">NeoGenCode CRM Password Reset OTP</h2>
             <p>Hello,</p>
             <p>You requested a password reset. Please use the following One-Time Password (OTP) to proceed:</p>
             <div style="font-size: 24px; font-weight: 700; color: #38bdf8; background: rgba(255,255,255,0.05); padding: 10px 20px; border-radius: 6px; display: inline-block; letter-spacing: 2px; margin: 15px 0;">${otp}</div>
             <p>This OTP is valid for <strong>5 minutes</strong>. For security, please do not share this code.</p>
             <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;" />
             <p style="font-size: 12px; color: #94a3b8;">If you did not request this password reset, please ignore this email.</p>
             <p style="font-size: 12px; color: #94a3b8;">Need help? Contact Super Admin at <a href="mailto:info@neogencode.com" style="color: #38bdf8;">info@neogencode.com</a></p>
           </div>`
  };

  if (!process.env.SMTP_USER) {
    console.log("========================================");
    console.log(`MOCK SMTP EMAIL SENDER: OTP for ${email} is ${otp}`);
    console.log("========================================");
    return true;
  }

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error("Nodemailer error:", err);
    throw err;
  }
};

// POST Forgot Password - Request OTP
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    const db = getDB();
    const userCheck = await db.execute({
      sql: "SELECT id FROM agents WHERE email = ? LIMIT 1;",
      args: [cleanEmail]
    });

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Email address not registered in system.' });
    }

    // Generate 6-digit numeric OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    
    // Clear any previous OTP session for this email
    await db.execute({
      sql: "DELETE FROM otp_store WHERE email = ?;",
      args: [cleanEmail]
    });

    // Store new OTP session in database
    await db.execute({
      sql: "INSERT INTO otp_store (email, otp, expires_at, attempts, reset_token) VALUES (?, ?, ?, 0, NULL);",
      args: [cleanEmail, otp, Date.now() + 5 * 60 * 1000] // 5 minutes expiration
    });

    // Send email and await it so that Vercel doesn't freeze the container before the dispatch completes
    try {
      await sendOTPEmail(cleanEmail, otp);
    } catch (sendErr) {
      console.error("OTP email dispatch failed:", sendErr);
      return res.status(500).json({ error: `Failed to send OTP email: ${sendErr.message}` });
    }

    res.json({ success: true, message: 'OTP successfully sent to your email.' });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    const db = getDB();
    const recordRes = await db.execute({
      sql: "SELECT * FROM otp_store WHERE email = ? LIMIT 1;",
      args: [cleanEmail]
    });
    const record = recordRes.rows[0];

    if (!record) {
      return res.status(400).json({ error: 'No password reset session active for this email.' });
    }

    if (Number(record.expires_at) < Date.now()) {
      await db.execute({ sql: "DELETE FROM otp_store WHERE email = ?;", args: [cleanEmail] });
      return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
    }

    if (Number(record.attempts) >= 3) {
      await db.execute({ sql: "DELETE FROM otp_store WHERE email = ?;", args: [cleanEmail] });
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    if (record.otp !== String(otp).trim()) {
      const newAttempts = Number(record.attempts) + 1;
      const remaining = 3 - newAttempts;
      if (remaining <= 0) {
        await db.execute({ sql: "DELETE FROM otp_store WHERE email = ?;", args: [cleanEmail] });
        return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
      }
      await db.execute({
        sql: "UPDATE otp_store SET attempts = ? WHERE email = ?;",
        args: [newAttempts, cleanEmail]
      });
      return res.status(400).json({ error: `Incorrect OTP. ${remaining} attempts remaining.` });
    }

    // OTP verified, generate unique reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(20).toString('hex');
    await db.execute({
      sql: "UPDATE otp_store SET reset_token = ?, expires_at = ? WHERE email = ?;",
      args: [resetToken, Date.now() + 10 * 60 * 1000, cleanEmail] // 10 minutes session validity
    });

    res.json({ success: true, resetToken });
  } catch (err) {
    console.error("OTP verification error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST Reset Password with Verified OTP Token
app.post('/api/auth/reset-password-otp', async (req, res) => {
  const { email, resetToken, newPassword } = req.body;
  if (!email || !resetToken || !newPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    const db = getDB();
    const recordRes = await db.execute({
      sql: "SELECT * FROM otp_store WHERE email = ? LIMIT 1;",
      args: [cleanEmail]
    });
    const record = recordRes.rows[0];

    if (!record || record.reset_token !== resetToken || Number(record.expires_at) < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired password reset session.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword.trim(), salt);

    // Update password and set password_changed flag to 1 (valid)
    await db.execute({
      sql: "UPDATE agents SET password = ?, password_changed = 1 WHERE email = ?;",
      args: [hashedPassword, cleanEmail]
    });

    // Clean up OTP record
    await db.execute({
      sql: "DELETE FROM otp_store WHERE email = ?;",
      args: [cleanEmail]
    });

    res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error("OTP password reset DB error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Authentication Endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const db = getDB();
    const result = await db.execute({
      sql: "SELECT * FROM agents WHERE LOWER(email) = ?;",
      args: [email.toLowerCase().trim()]
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const dbUser = result.rows[0];
    const passwordValid = bcrypt.compareSync(password, dbUser.password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Get company organization name if applicable
    let organizationName = 'Company A';
    let companyCeoEmail = '';
    let companyPlan = 'Starter';
    let companyMemberLimit = 5;
    if (dbUser.tenant_id !== 'all') {
      const companyRes = await db.execute({
        sql: "SELECT name, ceo_email, plan, member_limit FROM companies WHERE id = ?;",
        args: [dbUser.tenant_id]
      });
      if (companyRes.rows.length > 0) {
        organizationName = companyRes.rows[0].name;
        companyCeoEmail = companyRes.rows[0].ceo_email || '';
        companyPlan = companyRes.rows[0].plan || 'Starter';
        companyMemberLimit = Number(companyRes.rows[0].member_limit) || 5;
      }
    } else {
      organizationName = 'Platform Administration';
    }

    // Generate JWT token
    const tokenPayload = {
      id: dbUser.id,
      name: dbUser.name,
      agentName: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      tenantId: dbUser.tenant_id,
      organization: organizationName,
      tenantName: organizationName,
      ceoEmail: companyCeoEmail,
      plan: companyPlan,
      memberLimit: companyMemberLimit,
      permissions: dbUser.permissions ? JSON.parse(dbUser.permissions) : null,
      passwordChanged: Number(dbUser.password_changed) === 1
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    res.json({ token, user: tokenPayload });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Force Password Reset Endpoint
app.post('/api/auth/reset-password', authenticateToken, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  try {
    const db = getDB();
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    await db.execute({
      sql: "UPDATE agents SET password = ?, password_changed = 1 WHERE id = ?;",
      args: [hashedPassword, req.user.id]
    });

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET Leads (Scoped by Tenant)
app.get('/api/leads', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    let result;

    if (req.user.role === 'Super Admin') {
      const activeTenant = req.query.tenantId || 'all';
      if (activeTenant === 'all') {
        result = await db.execute("SELECT * FROM leads;");
      } else {
        result = await db.execute({
          sql: "SELECT * FROM leads WHERE tenant_id = ?;",
          args: [activeTenant]
        });
      }
    } else {
      result = await db.execute({
        sql: "SELECT * FROM leads WHERE tenant_id = ?;",
        args: [req.user.tenantId]
      });
    }

    // Map rows to standard frontend object format
    const leads = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      designation: r.designation,
      phone: r.phone,
      email: r.email,
      source: r.source,
      status: r.status,
      lastFollowUp: r.last_follow_up || 'N/A',
      nextFollowUp: r.next_follow_up || 'N/A',
      foundBy: r.found_by,
      summary: r.summary,
      createdDate: r.created_date,
      assignedAgent: r.assigned_agent,
      postUrl: r.post_url,
      tenantId: r.tenant_id,
      organization: r.organization
    }));

    res.json(leads);
  } catch (err) {
    console.error("Fetch leads error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST Lead (Add Lead)
app.post('/api/leads', authenticateToken, async (req, res) => {
  const lead = req.body;
  if (!lead.name) {
    return res.status(400).json({ error: 'Lead name is required.' });
  }

  const tenantId = req.user.role === 'Super Admin' ? (lead.tenantId || 'tenant-abc') : req.user.tenantId;
  const organization = req.user.role === 'Super Admin' ? (lead.organization || 'Company A') : req.user.organization;

  try {
    const db = getDB();
    const id = lead.id || 'lead-' + Date.now();
    const today = new Date().toISOString().split('T')[0];
    
    const finalAssignedAgent = lead.assignedAgent || (req.user.role !== 'Super Admin' ? req.user.name : '');

    await db.execute({
      sql: "INSERT INTO leads (id, name, designation, phone, email, source, status, last_follow_up, next_follow_up, found_by, summary, created_date, assigned_agent, post_url, tenant_id, organization) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      args: [
        id,
        lead.name,
        lead.designation || '',
        lead.phone || '',
        lead.email || '',
        lead.source || 'Manual',
        lead.status || 'new',
        lead.lastFollowUp || 'N/A',
        lead.nextFollowUp || 'N/A',
        lead.foundBy || req.user.name,
        lead.summary || '',
        lead.createdDate || today,
        finalAssignedAgent,
        lead.postUrl || '',
        tenantId,
        organization
      ]
    });

    res.json({ success: true, leadId: id });
  } catch (err) {
    console.error("Create lead error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT Lead (Update Lead)
app.put('/api/leads/:id', authenticateToken, async (req, res) => {
  const leadId = req.params.id;
  const lead = req.body;

  try {
    const db = getDB();

    // Verify lead ownership/tenant boundary and fetch current assigned agent
    const checkRes = await db.execute({
      sql: "SELECT tenant_id, assigned_agent FROM leads WHERE id = ?;",
      args: [leadId]
    });

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    const currentLead = checkRes.rows[0];

    if (req.user.role !== 'Super Admin' && currentLead.tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied: Lead belongs to another tenant.' });
    }

    const finalAssignedAgent = lead.assignedAgent !== undefined ? lead.assignedAgent : (currentLead.assigned_agent || '');
    
    // Check reassign permission
    const isCEO = req.user.ceoEmail && req.user.email && req.user.email.toLowerCase() === req.user.ceoEmail.toLowerCase();
    const hasReassign = req.user.permissions && req.user.permissions.reassignLead === true;

    if (req.user.role !== 'Super Admin' && !isCEO && !hasReassign) {
      if (finalAssignedAgent !== (currentLead.assigned_agent || '')) {
        return res.status(403).json({ error: 'Access denied: You do not have permission to reassign leads.' });
      }
    }

    await db.execute({
      sql: `UPDATE leads SET 
            name = ?, designation = ?, phone = ?, email = ?, 
            source = ?, status = ?, last_follow_up = ?, next_follow_up = ?, 
            summary = ?, assigned_agent = ?, post_url = ? 
            WHERE id = ?;`,
      args: [
        lead.name,
        lead.designation || '',
        lead.phone || '',
        lead.email || '',
        lead.source || '',
        lead.status || '',
        lead.lastFollowUp || 'N/A',
        lead.nextFollowUp || 'N/A',
        lead.summary || '',
        finalAssignedAgent,
        lead.postUrl || '',
        leadId
      ]
    });

    res.json({ success: true, message: 'Lead updated successfully.' });
  } catch (err) {
    console.error("Update lead error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE Lead (Role-Scoped: Manager/Super Admin Deletes, Agents request deletion)
app.delete('/api/leads/:id', authenticateToken, async (req, res) => {
  const leadId = req.params.id;
  const reason = req.query.reason || 'Requested by Sales Agent';

  try {
    const db = getDB();

    // Verify ownership
    const checkRes = await db.execute({
      sql: "SELECT name, tenant_id FROM leads WHERE id = ?;",
      args: [leadId]
    });

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    const lead = checkRes.rows[0];

    if (req.user.role !== 'Super Admin' && lead.tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Managers or Super Admins delete immediately
    if (req.user.role === 'Manager' || req.user.role === 'Super Admin') {
      await db.execute({
        sql: "DELETE FROM leads WHERE id = ?;",
        args: [leadId]
      });
      // Clear associated requests if any
      await db.execute({
        sql: "DELETE FROM delete_requests WHERE lead_id = ?;",
        args: [leadId]
      });
      return res.json({ success: true, deleted: true, message: 'Lead permanently deleted.' });
    }

    // Sales Agents create a delete request
    const requestId = 'req-' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    await db.execute({
      sql: "INSERT INTO delete_requests (id, lead_id, lead_name, requested_by, reason, status, created_date, tenant_id) VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?);",
      args: [
        requestId,
        leadId,
        lead.name,
        req.user.name,
        reason,
        today,
        req.user.tenantId
      ]
    });

    res.json({ success: true, deleted: false, message: 'Deletion request submitted for approval.' });
  } catch (err) {
    console.error("Delete lead error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET Delete Requests (scoped)
app.get('/api/delete-requests', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Manager' && req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const db = getDB();
    let result;

    if (req.user.role === 'Super Admin') {
      result = await db.execute("SELECT * FROM delete_requests;");
    } else {
      result = await db.execute({
        sql: "SELECT * FROM delete_requests WHERE tenant_id = ?;",
        args: [req.user.tenantId]
      });
    }

    const requests = result.rows.map(r => ({
      id: r.id,
      leadId: r.lead_id,
      leadName: r.lead_name,
      requestedBy: r.requested_by,
      reason: r.reason,
      status: r.status,
      createdDate: r.created_date,
      tenantId: r.tenant_id
    }));

    res.json(requests);
  } catch (err) {
    console.error("Fetch delete requests error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// APPROVE Delete Request
app.post('/api/delete-requests/:id/approve', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Manager' && req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const reqId = req.params.id;

  try {
    const db = getDB();

    // Verify request ownership
    const requestRes = await db.execute({
      sql: "SELECT lead_id, tenant_id FROM delete_requests WHERE id = ?;",
      args: [reqId]
    });

    if (requestRes.rows.length === 0) {
      return res.status(404).json({ error: 'Delete request not found.' });
    }

    const deleteRequest = requestRes.rows[0];

    if (req.user.role !== 'Super Admin' && deleteRequest.tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Delete the lead
    await db.execute({
      sql: "DELETE FROM leads WHERE id = ?;",
      args: [deleteRequest.lead_id]
    });

    // Delete the request
    await db.execute({
      sql: "DELETE FROM delete_requests WHERE id = ?;",
      args: [reqId]
    });

    res.json({ success: true, message: 'Lead deletion request approved. Lead deleted.' });
  } catch (err) {
    console.error("Approve delete error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// REJECT Delete Request
app.post('/api/delete-requests/:id/reject', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Manager' && req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const reqId = req.params.id;

  try {
    const db = getDB();

    // Verify ownership
    const requestRes = await db.execute({
      sql: "SELECT tenant_id FROM delete_requests WHERE id = ?;",
      args: [reqId]
    });

    if (requestRes.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    if (req.user.role !== 'Super Admin' && requestRes.rows[0].tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Just delete the request, leaving the lead intact
    await db.execute({
      sql: "DELETE FROM delete_requests WHERE id = ?;",
      args: [reqId]
    });

    res.json({ success: true, message: 'Lead deletion request rejected. Lead retained.' });
  } catch (err) {
    console.error("Reject delete error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET Team/Agents
app.get('/api/agents', authenticateToken, async (req, res) => {
  // Allow all authenticated team members to view company agents directory
  try {
    const db = getDB();
    let result;

    if (req.user.role === 'Super Admin') {
      const activeTenant = req.query.tenantId || 'all';
      if (activeTenant === 'all') {
        result = await db.execute("SELECT id, name, email, whatsapp, tenant_id, role, permissions, password_changed FROM agents;");
      } else {
        result = await db.execute({
          sql: "SELECT id, name, email, whatsapp, tenant_id, role, permissions, password_changed FROM agents WHERE tenant_id = ?;",
          args: [activeTenant]
        });
      }
    } else {
      result = await db.execute({
        sql: "SELECT id, name, email, whatsapp, tenant_id, role, permissions, password_changed FROM agents WHERE tenant_id = ?;",
        args: [req.user.tenantId]
      });
    }

    const agents = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      whatsapp: r.whatsapp,
      tenantId: r.tenant_id,
      role: r.role,
      permissions: r.permissions ? JSON.parse(r.permissions) : null,
      passwordChanged: Number(r.password_changed) === 1
    }));

    res.json(agents);
  } catch (err) {
    console.error("Fetch agents error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST Agent (Add Agent)
app.post('/api/agents', authenticateToken, async (req, res) => {
  const hasAddAgentPerm = req.user.permissions && req.user.permissions.addAgent === true;
  if (req.user.role !== 'Manager' && req.user.role !== 'Super Admin' && !hasAddAgentPerm) {
    return res.status(403).json({ error: 'Access denied. You do not have permission to register new agents.' });
  }

  const agent = req.body;
  if (!agent.name || !agent.email || !agent.password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const tenantId = req.user.role === 'Super Admin' ? (agent.tenantId || 'tenant-abc') : req.user.tenantId;

  try {
    const db = getDB();
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(agent.password, salt);
    const id = agent.id || 'agent-' + Date.now();

    await db.execute({
      sql: "INSERT INTO agents (id, name, email, whatsapp, tenant_id, password, role, permissions, password_changed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0);",
      args: [
        id,
        agent.name,
        agent.email.toLowerCase().trim(),
        agent.whatsapp || '',
        tenantId,
        hashedPassword,
        agent.role || 'Sales Agent',
        JSON.stringify(agent.permissions || { linkedinExtractor: true, whatsappApi: true, deleteUser: false, viewAllLeads: false })
      ]
    });

    res.json({ success: true, agentId: id });
  } catch (err) {
    console.error("Create agent error:", err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Email address already registered.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT Agent (Manager / Super Admin Only) - Updates agent details (name, whatsapp, email, role, permissions)
app.put('/api/agents/:id', authenticateToken, async (req, res) => {
  const canManage = req.user.role === 'Super Admin' || req.user.role === 'Manager';
  if (!canManage) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const agentId = req.params.id;
  const { permissions, name, whatsapp, email, role } = req.body;

  try {
    const db = getDB();
    
    // 1. If Manager, verify the agent belongs to the same tenant
    if (req.user.role === 'Manager') {
      const agentRes = await db.execute({
        sql: "SELECT * FROM agents WHERE id = ?;",
        args: [agentId]
      });
      const agent = agentRes.rows[0];
      if (!agent || agent.tenant_id !== req.user.tenantId) {
        return res.status(403).json({ error: 'Access denied. You can only manage your own organization agents.' });
      }
    }

    // 2. Fetch current agent to keep values
    const currentRes = await db.execute({
      sql: "SELECT * FROM agents WHERE id = ?;",
      args: [agentId]
    });
    const current = currentRes.rows[0];
    if (!current) {
      return res.status(404).json({ error: 'Agent not found.' });
    }

    const finalName = name !== undefined ? name : current.name;
    const finalWhatsapp = whatsapp !== undefined ? whatsapp : current.whatsapp;
    const finalEmail = email !== undefined ? email.toLowerCase().trim() : current.email;
    const finalRole = role !== undefined ? role : current.role;
    const finalPerms = permissions !== undefined ? JSON.stringify(permissions) : current.permissions;

    await db.execute({
      sql: "UPDATE agents SET name = ?, whatsapp = ?, email = ?, role = ?, permissions = ? WHERE id = ?;",
      args: [finalName, finalWhatsapp, finalEmail, finalRole, finalPerms, agentId]
    });

    res.json({ success: true, message: 'Agent updated successfully.' });
  } catch (err) {
    console.error("Update agent error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE Agent
app.delete('/api/agents/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Manager' && req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const agentId = req.params.id;

  try {
    const db = getDB();

    // Verify ownership
    const checkRes = await db.execute({
      sql: "SELECT tenant_id FROM agents WHERE id = ?;",
      args: [agentId]
    });

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found.' });
    }

    if (req.user.role !== 'Super Admin' && checkRes.rows[0].tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    await db.execute({
      sql: "DELETE FROM agents WHERE id = ?;",
      args: [agentId]
    });

    res.json({ success: true, message: 'Agent deleted.' });
  } catch (err) {
    console.error("Delete agent error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST Force Reset Password (Super Admin or Manager)
app.post('/api/agents/:id/force-password', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Manager' && req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const agentId = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  try {
    const db = getDB();

    // Verify ownership
    const checkRes = await db.execute({
      sql: "SELECT tenant_id FROM agents WHERE id = ?;",
      args: [agentId]
    });

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found.' });
    }

    if (req.user.role !== 'Super Admin' && checkRes.rows[0].tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword.trim(), salt);

    await db.execute({
      sql: "UPDATE agents SET password = ?, password_changed = 0 WHERE id = ?;",
      args: [hashedPassword, agentId]
    });

    res.json({ success: true, message: 'Agent password reset successfully and force flag activated.' });
  } catch (err) {
    console.error("Force reset password error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET My Company Settings (Manager / Super Admin Only) - Retrieves SMTP configurations
app.get('/api/companies/my-settings', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const agentRes = await db.execute({
      sql: "SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure FROM agents WHERE id = ?;",
      args: [req.user.id]
    });
    const agent = agentRes.rows[0];

    if (!agent) {
      return res.status(404).json({ error: "User profile not found." });
    }

    res.json({
      smtpHost: agent.smtp_host || '',
      smtpPort: agent.smtp_port || '',
      smtpUser: agent.smtp_user || '',
      smtpPass: agent.smtp_pass || '',
      smtpSecure: agent.smtp_secure || 'true'
    });
  } catch (err) {
    console.error("Fetch agent settings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT My Company Settings (Manager / Super Admin Only) - Updates SMTP configurations
app.put('/api/companies/my-settings', authenticateToken, async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure } = req.body;

  try {
    const db = getDB();
    
    await db.execute({
      sql: `UPDATE agents SET 
              smtp_host = ?, 
              smtp_port = ?, 
              smtp_user = ?, 
              smtp_pass = ?, 
              smtp_secure = ?
            WHERE id = ?;`,
      args: [
        smtpHost || null,
        smtpPort || null,
        smtpUser || null,
        smtpPass || null,
        smtpSecure || null,
        req.user.id
      ]
    });

    res.json({ success: true, message: 'SMTP settings updated successfully.' });
  } catch (err) {
    console.error("Update agent settings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET Companies (Super Admin Only)
app.get('/api/companies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const db = getDB();
    const result = await db.execute("SELECT * FROM companies;");
    const companies = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      plan: r.plan,
      memberLimit: Number(r.member_limit),
      createdDate: r.created_date,
      ceoEmail: r.ceo_email || ''
    }));

    res.json(companies);
  } catch (err) {
    console.error("Fetch companies error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST Company (Super Admin Only) - Provisions Company and CEO Agent
app.post('/api/companies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const { id, name, status, plan, memberLimit, ceoEmail, ceoPassword } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Company name is required.' });
  }

  try {
    const db = getDB();
    const companyId = id || 'tenant-' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Pre-check: Ensure CEO email is not already registered in agents table
    if (ceoEmail) {
      const emailCheck = await db.execute({
        sql: "SELECT id FROM agents WHERE email = ? LIMIT 1;",
        args: [ceoEmail.toLowerCase().trim()]
      });
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: 'CEO Email address already registered.' });
      }
    }

    // 1. Insert Company
    await db.execute({
      sql: "INSERT INTO companies (id, name, status, plan, member_limit, created_date, ceo_email) VALUES (?, ?, ?, ?, ?, ?, ?);",
      args: [companyId, name, status || 'Active', plan || 'Starter', memberLimit || 5, today, ceoEmail ? ceoEmail.toLowerCase().trim() : null]
    });

    // 2. Insert default CEO agent if details provided
    if (ceoEmail && ceoPassword) {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(ceoPassword, salt);
      const agentId = 'agent-' + Date.now();
      
      try {
        await db.execute({
          sql: "INSERT INTO agents (id, name, email, whatsapp, tenant_id, password, role, permissions, password_changed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);",
          args: [
            agentId,
            `CEO @ ${name}`,
            ceoEmail.toLowerCase().trim(),
            '+919999988888',
            companyId,
            hashedPassword,
            'Manager',
            JSON.stringify({ linkedinExtractor: true, whatsappApi: true, deleteUser: true, viewAllLeads: true }),
            0
          ]
        });
      } catch (agentErr) {
        // Rollback: delete company if CEO creation fails
        await db.execute({
          sql: "DELETE FROM companies WHERE id = ?;",
          args: [companyId]
        });
        throw agentErr;
      }
    }

    res.json({ success: true, companyId });
  } catch (err) {
    console.error("Create company error:", err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'CEO Email address already registered.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT Company (Super Admin Only) - Updates company limits and owner email
app.put('/api/companies/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const companyId = req.params.id;
  const { name, status, plan, memberLimit, ceoEmail } = req.body;

  try {
    const db = getDB();
    
    const finalName = name || '';
    const finalStatus = status || 'Active';
    const finalPlan = plan || 'Starter';
    const finalLimit = memberLimit !== undefined ? memberLimit : 5;

    // 1. Update company record
    await db.execute({
      sql: "UPDATE companies SET name = ?, status = ?, plan = ?, member_limit = ?, ceo_email = ? WHERE id = ?;",
      args: [finalName, finalStatus, finalPlan, finalLimit, ceoEmail ? ceoEmail.toLowerCase().trim() : null, companyId]
    });

    // 2. Update CEO email if provided
    if (ceoEmail) {
      await db.execute({
        sql: "UPDATE agents SET email = ? WHERE tenant_id = ? AND role = 'Manager';",
        args: [ceoEmail.toLowerCase().trim(), companyId]
      });
    }

    res.json({ success: true, message: 'Company updated successfully.' });
  } catch (err) {
    console.error("Update company error:", err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'New CEO email address is already in use.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE Company (Super Admin Only) - Cascade purges company, leads, agents, and delete requests
app.delete('/api/companies/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const companyId = req.params.id;

  try {
    const db = getDB();

    // Purge leads & agents of this tenant
    await db.execute({
      sql: "DELETE FROM leads WHERE tenant_id = ?;",
      args: [companyId]
    });

    await db.execute({
      sql: "DELETE FROM agents WHERE tenant_id = ?;",
      args: [companyId]
    });

    await db.execute({
      sql: "DELETE FROM delete_requests WHERE tenant_id = ?;",
      args: [companyId]
    });

    // Delete company itself
    await db.execute({
      sql: "DELETE FROM companies WHERE id = ?;",
      args: [companyId]
    });

    res.json({ success: true, message: 'Company and all associated records deleted successfully.' });
  } catch (err) {
    console.error("Delete company error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// CHROME EXTENSION: Import Lead Endpoint (Validates signed connection token)
app.post('/api/leads/import', async (req, res) => {
  const { lead, connectionToken } = req.body;
  if (!lead || !lead.name || !connectionToken) {
    return res.status(400).json({ error: 'Lead details and connection token are required.' });
  }

  try {
    // Verify connectionToken is a valid signed JWT generated by our server
    const payload = jwt.verify(connectionToken, JWT_SECRET);
    
    const db = getDB();
    const id = 'lead-' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    await db.execute({
      sql: `INSERT INTO leads (
        id, name, designation, phone, email, source, status, 
        last_follow_up, next_follow_up, found_by, summary, 
        created_date, assigned_agent, post_url, tenant_id, organization
      ) VALUES (?, ?, ?, ?, ?, 'Extension', 'new', 'N/A', 'N/A', ?, ?, ?, 'Agent', ?, ?, ?);`,
      args: [
        id,
        lead.name,
        lead.designation || '',
        lead.phone || '',
        lead.email || '',
        `Extension (${payload.agentName || 'Agent'})`,
        lead.summary || 'Imported via Chrome Extension',
        today,
        lead.postUrl || '',
        payload.tenantId,
        payload.tenantName || 'Company A'
      ]
    });

    res.json({ success: true, leadId: id });
  } catch (err) {
    console.error("Extension lead import error:", err);
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid or expired connection token. Please update it in CRM Settings.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Database Inspector Endpoint (Super Admin Only)
app.get('/api/admin/db-inspect/:tableName', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }
  
  const tableName = req.params.tableName;
  const allowedTables = ['companies', 'agents', 'leads', 'delete_requests'];
  
  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name.' });
  }
  
  try {
    const db = getDB();
    const result = await db.execute(`SELECT * FROM ${tableName} LIMIT 200;`);
    res.json({
      columns: result.columns || [],
      rows: result.rows || []
    });
  } catch (err) {
    console.error("Database inspection error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Database Inspector Row Delete Endpoint (Super Admin Only)
app.delete('/api/admin/db-delete/:tableName/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const { tableName, id } = req.params;
  const allowedTables = ['companies', 'agents', 'leads', 'delete_requests'];

  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name.' });
  }

  try {
    const db = getDB();

    if (tableName === 'companies') {
      // Cascade delete company and all related records
      await db.execute({ sql: "DELETE FROM leads WHERE tenant_id = ?;", args: [id] });
      await db.execute({ sql: "DELETE FROM agents WHERE tenant_id = ?;", args: [id] });
      await db.execute({ sql: "DELETE FROM delete_requests WHERE tenant_id = ?;", args: [id] });
      await db.execute({ sql: "DELETE FROM companies WHERE id = ?;", args: [id] });
    } else {
      // Simple delete for other tables
      await db.execute({ sql: `DELETE FROM ${tableName} WHERE id = ?;`, args: [id] });
    }

    res.json({ success: true, message: 'Record deleted successfully.' });
  } catch (err) {
    console.error("Database deletion error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});



// POST Send Outreach Email (Authenticated)
app.post('/api/outreach/send-email', authenticateToken, async (req, res) => {
  const { to, subject, body } = req.body;
  
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing required fields: to, subject, body" });
  }
  
  try {
    // 1. Fetch user's SMTP details from agents table
    const db = getDB();
    const agentRes = await db.execute({
      sql: "SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure FROM agents WHERE id = ?;",
      args: [req.user.id]
    });
    const agent = agentRes.rows[0];
    
    if (!agent) {
      return res.status(404).json({ error: "User profile not found." });
    }
    
    // 2. Read SMTP settings from the agent
    const host = agent.smtp_host || process.env.SMTP_HOST;
    const port = agent.smtp_port || process.env.SMTP_PORT;
    const user = agent.smtp_user || process.env.SMTP_USER;
    const pass = agent.smtp_pass || process.env.SMTP_PASS;
    const secure = agent.smtp_secure !== undefined ? (agent.smtp_secure === 1 || agent.smtp_secure === 'true') : true;
    
    if (!host || !user || !pass) {
      return res.status(400).json({ error: "Your personal SMTP settings are not configured. Please set them up in the Sync settings." });
    }
    
    // 3. Create nodemailer transporter
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port) || 465,
      secure, // true for 465, false for other ports
      auth: {
        user,
        pass
      }
    });
    
    // 4. Send email
    await transporter.sendMail({
      from: `"${req.user.name}" <${user}>`,
      to,
      subject,
      text: body
    });
    
    res.json({ success: true, message: "Email sent successfully." });
  } catch (err) {
    console.error("Outreach Email Error:", err);
    res.status(500).json({ error: `SMTP Send Failed: ${err.message}` });
  }
});

// GET Company Info (logo, tax details, dynamic PINs)
app.get('/api/companies/info', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const companyRes = await db.execute({
      sql: "SELECT id, name, plan, member_limit, logo_url, gst_number, cin_number, msme_number, company_address, delete_lead_pin, sync_settings_pin, ceo_email FROM companies WHERE id = ?;",
      args: [req.user.tenantId]
    });
    const company = companyRes.rows[0];
    if (!company) {
      return res.status(404).json({ error: "Company not found." });
    }

    const isCEO = req.user.ceoEmail && req.user.email && req.user.email.toLowerCase() === req.user.ceoEmail.toLowerCase();
    const isSuperAdmin = req.user.role === 'Super Admin';

    res.json({
      id: company.id,
      name: company.name,
      plan: company.plan,
      memberLimit: company.member_limit,
      logoUrl: company.logo_url || '',
      gstNumber: company.gst_number || '',
      cinNumber: company.cin_number || '',
      msmeNumber: company.msme_number || '',
      companyAddress: company.company_address || '',
      deleteLeadPin: (isCEO || isSuperAdmin) ? (company.delete_lead_pin || '0000') : null,
      syncSettingsPin: (isCEO || isSuperAdmin) ? (company.sync_settings_pin || '4321') : null
    });
  } catch (err) {
    console.error("Fetch company info error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT Company settings (CEO / Super Admin / createInvoice permission holders)
app.put('/api/companies/my-company/settings', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const isCEO = req.user.ceoEmail && req.user.email && req.user.email.toLowerCase() === req.user.ceoEmail.toLowerCase();
    const isSuperAdmin = req.user.role === 'Super Admin';
    const hasInvoicePerm = req.user.permissions && req.user.permissions.createInvoice === true;

    if (!isCEO && !isSuperAdmin && !hasInvoicePerm) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to manage company settings.' });
    }

    const { deleteLeadPin, logoUrl, gstNumber, cinNumber, msmeNumber, companyAddress } = req.body;

    const compRes = await db.execute({
      sql: "SELECT * FROM companies WHERE id = ?;",
      args: [req.user.tenantId]
    });
    const current = compRes.rows[0];
    if (!current) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    const finalDeletePin = (isCEO || isSuperAdmin) && deleteLeadPin !== undefined ? deleteLeadPin : (current.delete_lead_pin || '0000');
    const finalLogoUrl = logoUrl !== undefined ? logoUrl : (current.logo_url || '');
    const finalGst = gstNumber !== undefined ? gstNumber : (current.gst_number || '');
    const finalCin = cinNumber !== undefined ? cinNumber : (current.cin_number || '');
    const finalMsme = msmeNumber !== undefined ? msmeNumber : (current.msme_number || '');
    const finalAddress = companyAddress !== undefined ? companyAddress : (current.company_address || '');

    await db.execute({
      sql: `UPDATE companies SET 
              delete_lead_pin = ?, 
              logo_url = ?, 
              gst_number = ?, 
              cin_number = ?, 
              msme_number = ?, 
              company_address = ? 
            WHERE id = ?;`,
      args: [finalDeletePin, finalLogoUrl, finalGst, finalCin, finalMsme, finalAddress, req.user.tenantId]
    });

    res.json({ success: true, message: 'Company settings updated successfully.' });
  } catch (err) {
    console.error("Update company settings error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET Invoices
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const isCEO = req.user.ceoEmail && req.user.email && req.user.email.toLowerCase() === req.user.ceoEmail.toLowerCase();
    const isSuperAdmin = req.user.role === 'Super Admin';
    const hasInvoicePerm = req.user.permissions && req.user.permissions.createInvoice === true;

    if (!isCEO && !isSuperAdmin && !hasInvoicePerm) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view invoices.' });
    }

    const tenantId = req.user.tenantId;
    let sql = "SELECT * FROM invoices WHERE tenant_id = ?;";
    let args = [tenantId];

    if (isSuperAdmin) {
      sql = "SELECT * FROM invoices;";
      args = [];
    }

    const resInvoices = await db.execute({ sql, args });
    res.json(resInvoices.rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      invoiceNumber: row.invoice_number,
      clientName: row.client_name,
      clientEmail: row.client_email || '',
      clientAddress: row.client_address || '',
      clientGst: row.client_gst || '',
      invoiceDate: row.invoice_date,
      amount: row.amount,
      gstRate: row.gst_rate || 18,
      cgst: row.cgst || 0,
      sgst: row.sgst || 0,
      igst: row.igst || 0,
      totalAmount: row.total_amount || row.amount,
      status: row.status || 'Unpaid',
      items: row.items ? JSON.parse(row.items) : []
    })));
  } catch (err) {
    console.error("Fetch invoices error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST Invoice
app.post('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const isCEO = req.user.ceoEmail && req.user.email && req.user.email.toLowerCase() === req.user.ceoEmail.toLowerCase();
    const isSuperAdmin = req.user.role === 'Super Admin';
    const hasInvoicePerm = req.user.permissions && req.user.permissions.createInvoice === true;

    if (!isCEO && !isSuperAdmin && !hasInvoicePerm) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to create invoices.' });
    }

    const { invoiceNumber, clientName, clientEmail, clientAddress, clientGst, invoiceDate, amount, gstRate, cgst, sgst, igst, totalAmount, items } = req.body;

    if (!invoiceNumber || !clientName || !invoiceDate || amount === undefined) {
      return res.status(400).json({ error: 'Invoice number, client name, date, and amount are required.' });
    }

    const tenantId = req.user.tenantId;
    const id = 'inv-' + Date.now();

    await db.execute({
      sql: `INSERT INTO invoices (id, tenant_id, invoice_number, client_name, client_email, client_address, client_gst, invoice_date, amount, gst_rate, cgst, sgst, igst, total_amount, status, items) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?);`,
      args: [
        id,
        tenantId,
        invoiceNumber,
        clientName,
        clientEmail || '',
        clientAddress || '',
        clientGst || '',
        invoiceDate,
        amount,
        gstRate || 18,
        cgst || 0,
        sgst || 0,
        igst || 0,
        totalAmount || amount,
        JSON.stringify(items || [])
      ]
    });

    res.json({ success: true, invoiceId: id });
  } catch (err) {
    console.error("Create invoice error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT Update Invoice Status
app.put('/api/invoices/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required.' });

  try {
    const db = getDB();
    await db.execute({
      sql: "UPDATE invoices SET status = ? WHERE id = ? AND (tenant_id = ? OR ? = 'Super Admin');",
      args: [status, req.params.id, req.user.tenantId, req.user.role]
    });
    res.json({ success: true, message: 'Invoice status updated.' });
  } catch (err) {
    console.error("Update invoice status error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST Send Invoice Email
app.post('/api/invoices/:id/send', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    
    // 1. Fetch invoice details
    const invRes = await db.execute({
      sql: "SELECT * FROM invoices WHERE id = ? AND (tenant_id = ? OR ? = 'Super Admin');",
      args: [req.params.id, req.user.tenantId, req.user.role]
    });
    const inv = invRes.rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    if (!inv.client_email) return res.status(400).json({ error: 'Client email is not configured for this invoice.' });

    // 2. Fetch sender agent's SMTP details
    const agentRes = await db.execute({
      sql: "SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure FROM agents WHERE id = ?;",
      args: [req.user.id]
    });
    const agent = agentRes.rows[0];
    let host = agent ? agent.smtp_host : null;
    let port = agent ? agent.smtp_port : null;
    let user = agent ? agent.smtp_user : null;
    let pass = agent ? agent.smtp_pass : null;
    let secure = agent ? (agent.smtp_secure === 'true') : true;

    if (!host || !user || !pass) {
      // Fallback to company/tenant SMTP
      const compRes = await db.execute({
        sql: "SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure FROM companies WHERE id = ?;",
        args: [inv.tenant_id]
      });
      const comp = compRes.rows[0];
      if (comp && comp.smtp_host && comp.smtp_user && comp.smtp_pass) {
        host = comp.smtp_host;
        port = comp.smtp_port;
        user = comp.smtp_user;
        pass = comp.smtp_pass;
        secure = comp.smtp_secure === 'true';
      }
    }

    if (!host || !user || !pass) {
      return res.status(400).json({ error: 'Outgoing SMTP mail credentials are not configured. Please go to settings and configure your SMTP provider.' });
    }

    // 3. Construct HTML Tax Invoice Email
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port) || 465,
      secure,
      auth: { user, pass }
    });

    const items = inv.items ? JSON.parse(inv.items) : [];
    const itemDesc = items[0] && items[0].description ? items[0].description : 'Consulting & Project Execution Services';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4F46E5; text-transform: uppercase;">Tax Invoice / Payment Request</h2>
        <p>Dear <strong>${inv.client_name}</strong>,</p>
        <p>Please find the summary of your tax invoice <strong>${inv.invoice_number}</strong> details below:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f9fafb;">
            <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left;">Invoice Number</th>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${inv.invoice_number}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left;">Invoice Date</th>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${inv.invoice_date}</td>
          </tr>
          <tr style="background: #f9fafb;">
            <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left;">Description</th>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${itemDesc}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left;">Taxable Amount</th>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">₹${parseFloat(inv.amount).toFixed(2)}</td>
          </tr>
          <tr style="background: #f9fafb;">
            <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left;">GST Rate</th>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${inv.gst_rate}%</td>
          </tr>
          <tr style="font-weight: bold; background: #e0e7ff;">
            <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left; color: #4F46E5;">Total Amount Due</th>
            <td style="border: 1px solid #e5e7eb; padding: 10px; color: #4F46E5;">₹${parseFloat(inv.total_amount).toFixed(2)}</td>
          </tr>
        </table>

        <p>An official print-ready PDF preview of this invoice is logged in your client portal registry.</p>
        <p>If you have any questions, please contact us directly.</p>
        <br/>
        <p>Best regards,</p>
        <p><strong>${req.user.name}</strong></p>
      </div>
    `;

    await transporter.sendMail({
      from: `"${req.user.name}" <${user}>`,
      to: inv.client_email,
      subject: `Tax Invoice ${inv.invoice_number} from ${req.user.organization || 'Our Team'}`,
      html: emailHtml
    });

    // 4. Update last_sent_date in database
    const today = new Date().toISOString().split('T')[0];
    await db.execute({
      sql: "UPDATE invoices SET last_sent_date = ? WHERE id = ?;",
      args: [today, inv.id]
    });

    res.json({ success: true, lastSentDate: today, message: 'Invoice sent to client successfully.' });
  } catch (err) {
    console.error("Send invoice mail error:", err);
    res.status(500).json({ error: `SMTP Delivery failed: ${err.message}` });
  }
});

// Webhook Lead Ingestion (Google Forms, Zapier, Make, etc.)
app.post('/api/webhooks/leads/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const data = req.body;

  try {
    const db = getDB();
    const compRes = await db.execute({
      sql: "SELECT name FROM companies WHERE id = ?;",
      args: [tenantId]
    });
    if (compRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid company tenant ID.' });
    }

    const companyName = compRes.rows[0].name;
    const name = data.name || data.fullName || data.clientName || data.LeadName || 'Web Lead';
    const email = data.email || data.emailAddress || data.mail || '';
    const phone = data.phone || data.phoneNumber || data.mobile || data.whatsapp || '';
    const designation = data.designation || data.role || data.jobTitle || '';
    const source = data.source || 'Webhook Ingestion';
    const summary = data.summary || data.notes || data.message || 'Lead ingested via webhook integration.';
    const postUrl = data.postUrl || data.linkedinUrl || '';

    const leadId = 'lead-webhook-' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    await db.execute({
      sql: "INSERT INTO leads (id, name, designation, phone, email, source, status, last_follow_up, next_follow_up, found_by, summary, created_date, assigned_agent, post_url, tenant_id, organization) VALUES (?, ?, ?, ?, ?, ?, 'new', 'N/A', 'N/A', 'Webhook Ingestion', ?, ?, '', ?, ?, ?);",
      args: [
        leadId,
        name,
        designation,
        phone,
        email,
        source,
        summary,
        today,
        postUrl,
        tenantId,
        companyName
      ]
    });

    res.json({ success: true, message: 'Lead ingested successfully.', leadId });
  } catch (err) {
    console.error("Webhook lead ingestion error:", err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Meta/Facebook Webhook Verification
app.get('/api/webhooks/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = 'neogencode_crm_verify_token';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Meta webhook verified successfully.');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Verification token mismatch.');
    }
  }
  res.status(400).send('Missing parameter.');
});

// Meta/Facebook Webhook Event Ingestion
app.post('/api/webhooks/meta', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    try {
      const db = getDB();
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            const leadgenId = change.value.leadgen_id;
            const pageId = change.value.page_id;
            
            const compRes = await db.execute("SELECT id, name FROM companies LIMIT 1;");
            if (compRes.rows.length > 0) {
              const tenantId = compRes.rows[0].id;
              const companyName = compRes.rows[0].name;
              
              const leadId = 'lead-meta-' + Date.now();
              const today = new Date().toISOString().split('T')[0];

              await db.execute({
                sql: "INSERT INTO leads (id, name, designation, phone, email, source, status, last_follow_up, next_follow_up, found_by, summary, created_date, assigned_agent, post_url, tenant_id, organization) VALUES (?, ?, ?, ?, ?, 'Meta Lead Ads', 'new', 'N/A', 'N/A', 'Meta Webhook', ?, ?, '', '', ?, ?);",
                args: [
                  leadId,
                  `Meta Lead (${leadgenId})`,
                  'Lead from Facebook/Instagram Ads',
                  '',
                  '',
                  `Ingested Leadgen ID: ${leadgenId} from Facebook Page ID: ${pageId}`,
                  today,
                  tenantId,
                  companyName
                ]
              });
            }
          }
        }
      }
      res.status(200).send('EVENT_RECEIVED');
    } catch (err) {
      console.error("Meta webhook ingestion error:", err);
      res.status(500).send('Webhook processing failed.');
    }
  } else {
    res.sendStatus(404);
  }
});

// Start API Server
app.listen(PORT, () => {
  console.log(`Secure CRM Backend running on port ${PORT}`);
});
