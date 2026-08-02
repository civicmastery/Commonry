import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import pool from "./db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { ulid } from "ulid";
import crypto from "crypto";
import session from "express-session";
import { sendVerificationEmail } from "./email-service.js";
import { handleDiscourseSSORequest } from "./discourse-sso.js";
import syncRoutes from "./sync-routes.js";
import { createReviewEventRoutes } from "./review-event-routes.js";
import { createStudySessionRoutes } from "./study-session-routes.js";
import {
  createCardAnalysisRoutes,
  createAdminAnalysisRoutes,
} from "./card-analysis-routes.js";
import { AnalysisJobProcessor } from "./analysis-job-processor.js";
import { createResearchExportRoutes } from "./research-export-routes.js";
import { createResearchConsentRoutes } from "./research-consent-routes.js";
import { ResearchExportService } from "./research-export-service.js";
import { ResearchExportProcessor } from "./research-export-processor.js";
import { DataAnonymizer } from "./data-anonymizer.js";
import { createLearningAnalyticsRoutes } from "./learning-analytics-routes.js";

dotenv.config();

// Fail-closed: require critical secrets at startup
const requiredSecrets = ["JWT_SECRET", "SESSION_SECRET"];
const missingSecrets = requiredSecrets.filter(
  (key) => !process.env[key] || process.env[key].trim() === "",
);
if (missingSecrets.length > 0) {
  console.error(
    `FATAL: Missing required environment variable(s): ${missingSecrets.join(", ")}. ` +
      "The server cannot start without these secrets. " +
      "See .env.example for required configuration.",
  );
  process.exit(1); // skipcq: JS-0263 -- intentional fail-closed startup guard: halt boot when required secrets are absent
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy headers from Cloudflare Tunnel
// This is required for proper rate limiting and security when behind a reverse proxy
app.set("trust proxy", true);

// Security headers via helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: [
          "'self'",
          "https://forum.commonry.app",
          "https://fonts.googleapis.com",
          "https://sql.js.org",
        ],
        frameSrc: ["https://forum.commonry.app"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    // HSTS: 1 year, include subdomains, allow preload
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    // X-Content-Type-Options: nosniff (helmet default, explicit for clarity)
    xContentTypeOptions: true,
    // X-Frame-Options: DENY (supplements CSP frame-ancestors)
    xFrameOptions: { action: "deny" },
    // Referrer-Policy: strict-origin-when-cross-origin
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

const UPLOADS_DIR = path.resolve(__dirname, "uploads");
const upload = multer({ dest: UPLOADS_DIR });

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

/**
 * Validate that a file path is within the uploads directory
 * Prevents path traversal attacks
 */
function isPathSafe(filePath, baseDir) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  return (
    resolvedPath.startsWith(resolvedBase + path.sep) ||
    resolvedPath === resolvedBase
  );
}

/**
 * Sanitize user input before logging to prevent log injection attacks
 * Removes newlines and carriage returns that could be used to forge log entries
 */
function sanitizeForLog(input) {
  if (input === null || input === undefined) {
    return String(input);
  }
  return String(input).replace(/[\n\r]/g, "");
}

// General rate limiter: 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // We handle trust proxy at the app level
});

// Stricter rate limiter for file uploads: 5 uploads per 15 minutes per IP
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 upload requests per windowMs
  message: "Too many upload requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // We handle trust proxy at the app level
});

app.use(express.json());

// CORS configuration - allow multiple origins for dev and production
const allowedOrigins = [
  "http://localhost:5173", // Local development
  "https://commonry.app", // Production frontend
  "https://www.commonry.app", // Production with www
];

// Add any custom origin from environment variable
if (
  process.env.FRONTEND_URL &&
  !allowedOrigins.includes(process.env.FRONTEND_URL)
) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true, // Allow cookies to be sent
  }),
);
app.use(generalLimiter);

// Session middleware for Discourse SSO
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Use secure cookies in production
      httpOnly: true,
      sameSite: "lax", // Allow cookie to be sent on redirects from Discourse
      maxAge: 10 * 60 * 1000, // 10 minutes - enough time for SSO flow
    },
  }),
);

// CSRF protection via Origin/Referer validation (GIV-617, CodeQL alert #29)
// JWT auth uses the Authorization header, which browsers never attach cross-site,
// but the Discourse SSO session cookie IS ambient credential state. Token-based
// CSRF (lusca) breaks the cross-origin SPA, so instead we reject state-mutating
// requests whose browser-supplied Origin/Referer is not an allowed origin.
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
app.use((req, res, next) => {
  if (CSRF_SAFE_METHODS.has(req.method)) {
    return next();
  }

  let source = req.headers.origin;
  if (!source && req.headers.referer) {
    try {
      source = new URL(req.headers.referer).origin;
    } catch {
      return res.status(403).json({ error: "Invalid Referer header" });
    }
  }

  // No Origin and no Referer means a non-browser client (curl, mobile app,
  // server-to-server). Those carry no ambient cookie credentials, so CSRF
  // does not apply - allow them through to normal authentication.
  if (!source) {
    return next();
  }

  if (allowedOrigins.includes(source)) {
    return next();
  }

  console.warn(`CSRF blocked cross-site ${req.method} from origin: ${source}`);
  return res.status(403).json({ error: "Cross-site request rejected" });
});

// Root route - API info
app.get("/", (req, res) => {
  res.json({
    name: "Commonry API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      auth: "/api/auth/*",
      decks: "/api/decks/*",
      sync: "/api/sync/*",
      profile: "/api/profile/:username",
      research: "/api/user/research-consent/*",
    },
  });
});

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

// Discourse SSO configuration
const DISCOURSE_SSO_SECRET = process.env.DISCOURSE_SSO_SECRET;

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
    return null;
  } catch {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

// Admin authorization middleware
// Requires authenticateToken to be called first
const requireAdmin = async (req, res, next) => {
  try {
    // Check if user has admin role
    const result = await pool.query(
      "SELECT role FROM users WHERE user_id = $1",
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "User not found" });
    }

    const { role } = result.rows[0];
    if (role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
    return null;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return res.status(500).json({ error: "Failed to verify admin status" });
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get user by username from database
 */
async function getUserByUsername(username) {
  const result = await pool.query(
    "SELECT user_id FROM users WHERE username = $1",
    [username.toLowerCase()],
  );
  return result.rows[0] || null;
}

/**
 * Check if a specific privacy setting is enabled for a user
 */
async function checkPrivacySetting(userId, settingName) {
  const result = await pool.query(
    `SELECT ${settingName} FROM privacy_settings WHERE user_id = $1`,
    [userId],
  );
  // Default to true if no privacy settings exist
  return result.rows[0]?.[settingName] !== false;
}

/**
 * Generate ULID with prefix
 */
function generateULID(prefix) {
  return `${prefix}_${ulid()}`;
}

/**
 * Transform a deck database row into API response format
 * @param {object} deck - Raw deck row from database
 * @param {object} options - Transformation options
 * @param {boolean} [options.isFeatured] - Override isFeatured value (defaults to !!deck.featuredAt)
 * @returns {object} Transformed deck object
 */
function transformDeckResponse(deck, options = {}) {
  const isFeatured =
    options.isFeatured !== undefined
      ? options.isFeatured
      : Boolean(deck.featuredAt);

  return {
    ...deck,
    subscriberCount: parseInt(deck.subscriberCount) || 0,
    cardCount: parseInt(deck.cardCount) || 0,
    isFeatured,
    author: {
      username: deck.authorUsername,
      displayName: deck.authorDisplayName,
    },
  };
}

/**
 * Get user and check privacy setting - common pattern in profile routes
 * @returns {object|null} Returns user object or null, sends response if error
 */
async function getUserWithPrivacyCheck(
  username,
  privacySetting,
  res,
  errorMessage,
) {
  const user = await getUserByUsername(username);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }

  const showContent = await checkPrivacySetting(user.user_id, privacySetting);

  if (!showContent) {
    res.status(403).json({ error: errorMessage });
    return null;
  }

  return user;
}

/**
 * Get active user by username (includes is_active check)
 */
async function getActiveUserByUsername(username) {
  const result = await pool.query(
    "SELECT user_id FROM users WHERE username = $1 AND is_active = true",
    [username.toLowerCase()],
  );
  return result.rows[0] || null;
}

// ==================== AUTHENTICATION ENDPOINTS ====================

// User signup
app.post("/api/auth/signup", async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ error: "Username, email, and password are required" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }

  try {
    // Generate ULID for user
    const userId = generateULID("usr");

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate verification token (random 32-byte hex string)
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Set expiration to 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create user with verification fields
    const result = await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, display_name,
                         email_verified, verification_token, verification_token_expires)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
       RETURNING user_id, username, email, display_name, created_at`,
      [
        userId,
        username.toLowerCase(),
        email.toLowerCase(),
        passwordHash,
        displayName || username,
        verificationToken,
        expiresAt,
      ],
    );

    const user = result.rows[0];

    // Send verification email
    try {
      await sendVerificationEmail(
        user.email,
        user.display_name,
        verificationToken,
      );
      console.log(`✅ Verification email sent to ${user.email}`);
    } catch (emailError) {
      console.error("❌ Failed to send verification email:", emailError);
      // Don't fail signup if email fails, but log it
    }

    // Return success without JWT token
    res.status(201).json({
      message:
        "Account created successfully. Please check your email to verify your account.",
      email: user.email,
      requiresVerification: true,
    });
    return null;
  } catch (error) {
    if (error.constraint === "users_username_key") {
      return res.status(409).json({ error: "Username already taken" });
    }
    if (error.constraint === "users_email_key") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to create user" });
    return null;
  }
});

// Email verification
app.get("/api/auth/verify-email/:token", async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ error: "Verification token is required" });
  }

  try {
    // Find user with matching token
    const result = await pool.query(
      `SELECT user_id, username, email, display_name, email_verified,
              verification_token_expires
       FROM users
       WHERE verification_token = $1`,
      [token],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error:
          "This verification link is invalid or has already been used. If you already verified your email, please try logging in.",
        invalidToken: true,
      });
    }

    const user = result.rows[0];

    // Check if already verified
    if (user.email_verified) {
      return res.status(200).json({
        message: "Email already verified. You can now log in.",
        alreadyVerified: true,
      });
    }

    // Check if token expired
    const now = new Date();
    const expiresAt = new Date(user.verification_token_expires);

    if (now > expiresAt) {
      return res.status(400).json({
        error: "Verification link has expired. Please request a new one.",
        expired: true,
      });
    }

    // Mark email as verified and clear token
    await pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           verification_token = NULL,
           verification_token_expires = NULL
       WHERE user_id = $1`,
      [user.user_id],
    );

    console.log(`✅ Email verified for user: ${user.email}`);

    res.status(200).json({
      message: "Email verified successfully! You can now log in.",
      verified: true,
      username: user.username,
    });
    return null;
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({ error: "Failed to verify email" });
    return null;
  }
});

// Resend verification email
app.post("/api/auth/resend-verification", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // Find user by email
    const result = await pool.query(
      `SELECT user_id, username, email, display_name, email_verified
       FROM users
       WHERE email = $1`,
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists or not for security
      return res.status(200).json({
        message:
          "If an account with that email exists and is not verified, a new verification email will be sent.",
      });
    }

    const user = result.rows[0];

    // Check if already verified
    if (user.email_verified) {
      return res.status(400).json({
        error: "This email is already verified. Please log in.",
        alreadyVerified: true,
      });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update token in database
    await pool.query(
      `UPDATE users
       SET verification_token = $1,
           verification_token_expires = $2
       WHERE user_id = $3`,
      [verificationToken, expiresAt, user.user_id],
    );

    // Send verification email
    try {
      await sendVerificationEmail(
        user.email,
        user.display_name,
        verificationToken,
      );
      console.log(`✅ Resent verification email to: ${user.email}`);
    } catch (emailError) {
      console.error("❌ Failed to send verification email:", emailError);
      // Don't fail the request if email fails
    }

    res.status(200).json({
      message:
        "A new verification email has been sent. Please check your inbox.",
      email: user.email,
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ error: "Failed to resend verification email" });
  }
  return null;
});

// User login
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  try {
    const result = await pool.query(
      `SELECT user_id, username, email, password_hash, display_name, is_active, email_verified
       FROM users
       WHERE username = $1 OR email = $1`,
      [username.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: "Account is disabled" });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if email is verified
    if (!user.email_verified) {
      return res.status(403).json({
        error:
          "Please verify your email before logging in. Check your inbox for the verification link.",
        emailNotVerified: true,
        email: user.email,
      });
    }

    // Update last login
    await pool.query(
      "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = $1",
      [user.user_id],
    );

    // Generate JWT token
    const token = jwt.sign({ userId: user.user_id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({
      user: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }

  return null;
});

// Get current user
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, username, email, display_name, created_at, last_login_at
       FROM users
       WHERE user_id = $1`,
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: result.rows[0] });
    return null;
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
    return null;
  }
});

// ==================== DISCOURSE SSO ENDPOINTS ====================

/**
 * Prepare SSO Endpoint
 *
 * This endpoint is called before redirecting to Discourse to establish a session.
 * The frontend calls this with the JWT token to store the user ID in the session,
 * then redirects to Discourse. When Discourse redirects back to the SSO endpoint,
 * we can identify the user from the session.
 *
 * Flow:
 * 1. Frontend calls this endpoint with JWT token
 * 2. We validate token and store userId in session
 * 3. Frontend redirects to Discourse
 * 4. Discourse redirects to /api/discourse/sso with sso/sig params
 * 5. We read userId from session to complete SSO
 */
app.post("/api/discourse/prepare-sso", authenticateToken, (req, res) => {
  try {
    // Store user ID in session
    req.session.userId = req.userId;
    console.log(
      `[SSO] Preparing session for user: ${sanitizeForLog(req.userId)}, Session ID: ${sanitizeForLog(req.sessionID)}`,
    );
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Failed to create session" });
      }
      console.log(
        `[SSO] Session saved successfully for user: ${sanitizeForLog(req.userId)}`,
      );
      return res.json({ success: true, message: "Session established" });
    });
  } catch (error) {
    console.error("Prepare SSO error:", error);
    res.status(500).json({ error: "Failed to prepare SSO" });
  }
});

/**
 * Complete pending SSO after login
 * Called by frontend after user logs in with sso_return=true
 */
app.post("/api/discourse/complete-sso", authenticateToken, async (req, res) => {
  try {
    // Store user ID in session
    req.session.userId = req.userId;

    // Check if there's a pending SSO request
    const pendingSso = req.session.pendingSso;
    if (!pendingSso || !pendingSso.sso || !pendingSso.sig) {
      res.status(400).json({ error: "No pending SSO request" });
      return;
    }

    // Get user profile
    const userResult = await pool.query(
      `SELECT user_id, username, email, display_name, avatar_url, bio, email_verified
       FROM users
       WHERE user_id = $1 AND is_active = true`,
      [req.userId],
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const user = userResult.rows[0];

    if (!user.email_verified) {
      res.status(403).json({ error: "Email not verified" });
      return;
    }

    // Process SSO
    const ssoResult = handleDiscourseSSORequest(
      pendingSso.sso,
      pendingSso.sig,
      user,
      DISCOURSE_SSO_SECRET,
    );

    if (!ssoResult) {
      res.status(400).json({ error: "Invalid SSO request" });
      return;
    }

    // Clear pending SSO
    delete req.session.pendingSso;
    req.session.save();

    console.log(
      `[SSO] Completed pending SSO for user: ${sanitizeForLog(user.username)}`,
    );
    res.json({ redirectUrl: ssoResult.redirectUrl });
  } catch (error) {
    console.error("Complete SSO error:", error);
    res.status(500).json({ error: "Failed to complete SSO" });
  }
});

/**
 * Discourse SSO (DiscourseConnect) Endpoint
 *
 * This endpoint handles Single Sign-On requests from Discourse forum.
 * When users click "Login" on Discourse, they're redirected here with a signed payload.
 * We validate the request, authenticate the user, and redirect them back with user data.
 *
 * Flow:
 * 1. Discourse redirects to this endpoint with sso and sig query params
 * 2. We validate the signature using our shared secret
 * 3. We read the userId from the session (set by prepare-sso endpoint)
 * 4. We generate a signed response with user data
 * 5. We redirect back to Discourse with the signed response
 *
 * @see https://meta.discourse.org/t/discourseconnect-official-single-sign-on-for-discourse-sso/13045
 */
app.get("/api/discourse/sso", async (req, res) => {
  const { sso, sig } = req.query;

  console.log(
    `[SSO] Received SSO request - Session ID: ${sanitizeForLog(req.sessionID)}`,
  );
  console.log(`[SSO] Session userId: ${sanitizeForLog(req.session.userId)}`);
  // Note: Not logging full session object to prevent log injection

  // Authenticate user - read userId from session
  const userId = req.session.userId;

  if (!userId) {
    console.log("[SSO] No userId in session - redirecting to login");
    // Store SSO params in session so we can complete the flow after login
    req.session.pendingSso = { sso, sig };
    req.session.save((err) => {
      if (err) {
        console.error("[SSO] Failed to save session:", err);
      }
      // Redirect to frontend login page with SSO return flag
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      return res.redirect(`${frontendUrl}/login?sso_return=true`);
    });
    return;
  }

  // Validate required parameters
  if (!sso || !sig) {
    res.status(400).json({
      error: "Missing SSO parameters. Required: sso and sig query params.",
    });
    return;
  }

  // Validate Discourse SSO secret is configured
  if (!DISCOURSE_SSO_SECRET) {
    console.error("DISCOURSE_SSO_SECRET not configured");
    res.status(500).json({
      error: "SSO not configured on server",
    });
    return;
  }

  try {
    // Get the authenticated user's full profile
    const userResult = await pool.query(
      `SELECT user_id, username, email, display_name, avatar_url, bio, email_verified
       FROM users
       WHERE user_id = $1 AND is_active = true`,
      [userId],
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const user = userResult.rows[0];

    // Ensure email is verified before allowing SSO
    if (!user.email_verified) {
      res.status(403).json({
        error: "Email must be verified before accessing the forum",
      });
      return;
    }

    // Handle the SSO request and generate redirect URL
    const ssoResponse = handleDiscourseSSORequest(
      sso,
      sig,
      user,
      DISCOURSE_SSO_SECRET,
    );

    if (!ssoResponse) {
      res.status(400).json({
        error: "Invalid SSO signature or payload",
      });
      return;
    }

    // Redirect user back to Discourse with signed response
    res.redirect(ssoResponse.redirectUrl);
  } catch (error) {
    console.error("Discourse SSO error:", error);
    res.status(500).json({ error: "Failed to process SSO request" });
  }
});

// ==================== PROFILE ENDPOINTS ====================

// Get user profile by username
app.get("/api/profile/:username", async (req, res) => {
  const { username } = req.params;

  try {
    // Get user basic info and profile fields
    const userResult = await pool.query(
      `SELECT user_id, username, display_name, bio, pronouns, location,
              avatar_url, learning_topics, created_at
       FROM users
       WHERE username = $1 AND is_active = true`,
      [username.toLowerCase()],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Get privacy settings to determine what to show
    const privacyResult = await pool.query(
      `SELECT privacy_preset, show_statistics, show_decks, show_forum_activity,
              show_followers, show_achievements, show_goals
       FROM privacy_settings
       WHERE user_id = $1`,
      [user.user_id],
    );

    const privacy = privacyResult.rows[0] || {
      show_statistics: true,
      show_decks: true,
      show_forum_activity: true,
      show_followers: true,
      show_achievements: true,
      show_goals: false,
    };

    res.json({
      profile: {
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
        bio: user.bio,
        pronouns: user.pronouns,
        location: user.location,
        avatarUrl: user.avatar_url,
        learningTopics: user.learning_topics,
        memberSince: user.created_at,
      },
      privacy,
    });
    return null;
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
    return null;
  }
});

// Update current user's profile
app.put("/api/profile", authenticateToken, async (req, res) => {
  const { displayName, bio, pronouns, location, avatarUrl, learningTopics } =
    req.body;

  // Validate bio length
  if (bio && bio.length > 300) {
    return res
      .status(400)
      .json({ error: "Bio must be 300 characters or less" });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           bio = COALESCE($2, bio),
           pronouns = COALESCE($3, pronouns),
           location = COALESCE($4, location),
           avatar_url = COALESCE($5, avatar_url),
           learning_topics = COALESCE($6, learning_topics)
       WHERE user_id = $7
       RETURNING user_id, username, display_name, bio, pronouns, location,
                 avatar_url, learning_topics`,
      [
        displayName,
        bio,
        pronouns,
        location,
        avatarUrl,
        learningTopics,
        req.userId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ profile: result.rows[0] });
    return null;
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
    return null;
  }
});

// Get user statistics
app.get("/api/profile/:username/stats", async (req, res) => {
  const { username } = req.params;

  try {
    // Get user ID from username
    const user = await getUserByUsername(username);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user.user_id;

    // Check privacy settings
    const showStats = await checkPrivacySetting(userId, "show_statistics");

    if (!showStats) {
      return res.status(403).json({ error: "User statistics are private" });
    }

    // Get or create statistics record
    let statsResult = await pool.query(
      "SELECT * FROM user_statistics WHERE user_id = $1",
      [userId],
    );

    if (statsResult.rows.length === 0) {
      // Create default statistics record
      const statId = generateULID("stat");
      await pool.query(
        `INSERT INTO user_statistics (stat_id, user_id)
         VALUES ($1, $2)`,
        [statId, userId],
      );

      statsResult = await pool.query(
        "SELECT * FROM user_statistics WHERE user_id = $1",
        [userId],
      );
    }

    res.json({ stats: statsResult.rows[0] });
    return null;
  } catch (error) {
    console.error("Get user stats error:", error);
    res.status(500).json({ error: "Failed to get statistics" });
    return null;
  }
});

// Get user privacy settings
app.get(
  "/api/profile/:username/privacy",
  authenticateToken,
  async (req, res) => {
    const { username } = req.params;

    try {
      // Get user ID from username
      const userResult = await pool.query(
        "SELECT user_id FROM users WHERE username = $1",
        [username.toLowerCase()],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const userId = userResult.rows[0].user_id;

      // Only allow users to see their own privacy settings
      if (userId !== req.userId) {
        return res
          .status(403)
          .json({ error: "Cannot view other users' privacy settings" });
      }

      const result = await pool.query(
        "SELECT * FROM privacy_settings WHERE user_id = $1",
        [userId],
      );

      if (result.rows.length === 0) {
        // Create default privacy settings
        const settingId = generateULID("priv");
        await pool.query(
          `INSERT INTO privacy_settings (setting_id, user_id)
         VALUES ($1, $2)`,
          [settingId, userId],
        );

        const newResult = await pool.query(
          "SELECT * FROM privacy_settings WHERE user_id = $1",
          [userId],
        );

        return res.json({ privacy: newResult.rows[0] });
      }

      return res.json({ privacy: result.rows[0] });
    } catch (error) {
      console.error("Get privacy settings error:", error);
      return res.status(500).json({ error: "Failed to get privacy settings" });
    }
  },
);

// Update user privacy settings
app.put("/api/profile/privacy", authenticateToken, async (req, res) => {
  const {
    privacyPreset,
    showStatistics,
    showDecks,
    showForumActivity,
    showFollowers,
    showAchievements,
    showGoals,
  } = req.body;

  try {
    // Check if privacy settings exist
    const existingResult = await pool.query(
      "SELECT setting_id FROM privacy_settings WHERE user_id = $1",
      [req.userId],
    );

    let result = null;

    if (existingResult.rows.length === 0) {
      // Create new privacy settings
      const settingId = generateULID("priv");
      result = await pool.query(
        `INSERT INTO privacy_settings (
           setting_id, user_id, privacy_preset, show_statistics, show_decks,
           show_forum_activity, show_followers, show_achievements, show_goals
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          settingId,
          req.userId,
          privacyPreset || "community_member",
          showStatistics !== undefined ? showStatistics : true,
          showDecks !== undefined ? showDecks : true,
          showForumActivity !== undefined ? showForumActivity : true,
          showFollowers !== undefined ? showFollowers : true,
          showAchievements !== undefined ? showAchievements : true,
          showGoals !== undefined ? showGoals : false,
        ],
      );
    } else {
      // Update existing privacy settings
      result = await pool.query(
        `UPDATE privacy_settings
         SET privacy_preset = COALESCE($1, privacy_preset),
             show_statistics = COALESCE($2, show_statistics),
             show_decks = COALESCE($3, show_decks),
             show_forum_activity = COALESCE($4, show_forum_activity),
             show_followers = COALESCE($5, show_followers),
             show_achievements = COALESCE($6, show_achievements),
             show_goals = COALESCE($7, show_goals),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $8
         RETURNING *`,
        [
          privacyPreset,
          showStatistics,
          showDecks,
          showForumActivity,
          showFollowers,
          showAchievements,
          showGoals,
          req.userId,
        ],
      );
    }

    res.json({ privacy: result.rows[0] });
  } catch (error) {
    console.error("Update privacy settings error:", error);
    res.status(500).json({ error: "Failed to update privacy settings" });
  }
});

// Get all achievements
app.get("/api/achievements", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT achievement_id, name, description, category, badge_icon,
              criteria, display_order, rarity
       FROM achievements
       ORDER BY display_order ASC`,
    );

    res.json({ achievements: result.rows });
  } catch (error) {
    console.error("Get achievements error:", error);
    res.status(500).json({ error: "Failed to get achievements" });
  }
});

// Get user achievements
app.get("/api/profile/:username/achievements", async (req, res) => {
  const { username } = req.params;

  try {
    // Get user ID from username
    const user = await getUserByUsername(username);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user.user_id;

    // Check privacy settings
    const showAchievements = await checkPrivacySetting(
      userId,
      "show_achievements",
    );

    if (!showAchievements) {
      return res.status(403).json({ error: "User achievements are private" });
    }

    // Get user achievements with achievement details
    const result = await pool.query(
      `SELECT ua.user_achievement_id, ua.progress, ua.target, ua.unlocked,
              ua.unlocked_at, a.achievement_id, a.name, a.description,
              a.category, a.badge_icon, a.criteria, a.rarity
       FROM user_achievements ua
       JOIN achievements a ON ua.achievement_id = a.achievement_id
       WHERE ua.user_id = $1
       ORDER BY ua.unlocked DESC, a.display_order ASC`,
      [userId],
    );

    res.json({ achievements: result.rows });
    return null;
  } catch (error) {
    console.error("Get user achievements error:", error);
    res.status(500).json({ error: "Failed to get user achievements" });
    return null;
  }
});

// Follow a user
app.post(
  "/api/profile/follow/:username",
  authenticateToken,
  async (req, res) => {
    const { username } = req.params;

    try {
      // Get user ID from username
      const user = await getActiveUserByUsername(username);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const followingId = user.user_id;

      // Cannot follow yourself
      if (followingId === req.userId) {
        return res.status(400).json({ error: "Cannot follow yourself" });
      }

      // Check if already following
      const existingFollow = await pool.query(
        "SELECT follow_id FROM user_follows WHERE follower_id = $1 AND following_id = $2",
        [req.userId, followingId],
      );

      if (existingFollow.rows.length > 0) {
        return res.status(400).json({ error: "Already following this user" });
      }

      // Create follow relationship
      const followId = generateULID("flw");
      const result = await pool.query(
        `INSERT INTO user_follows (follow_id, follower_id, following_id)
       VALUES ($1, $2, $3)
       RETURNING follow_id, created_at`,
        [followId, req.userId, followingId],
      );

      return res.status(201).json({
        success: true,
        follow: result.rows[0],
      });
    } catch (error) {
      console.error("Follow user error:", error);
      return res.status(500).json({ error: "Failed to follow user" });
    }
  },
);

// Unfollow a user
app.delete(
  "/api/profile/follow/:username",
  authenticateToken,
  async (req, res) => {
    const { username } = req.params;

    try {
      // Get user ID from username
      const user = await getUserByUsername(username);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const followingId = user.user_id;

      // Delete follow relationship
      const result = await pool.query(
        `DELETE FROM user_follows
       WHERE follower_id = $1 AND following_id = $2
       RETURNING follow_id`,
        [req.userId, followingId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Not following this user" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Unfollow user error:", error);
      return res.status(500).json({ error: "Failed to unfollow user" });
    }
  },
);

// Get user's followers
app.get("/api/profile/:username/followers", async (req, res) => {
  const { username } = req.params;

  try {
    const user = await getUserWithPrivacyCheck(
      username,
      "show_followers",
      res,
      "User followers list is private",
    );
    if (!user) return;

    // Get followers
    const result = await pool.query(
      `SELECT u.user_id, u.username, u.display_name, u.avatar_url,
              uf.created_at as followed_at
       FROM user_follows uf
       JOIN users u ON uf.follower_id = u.user_id
       WHERE uf.following_id = $1 AND u.is_active = true
       ORDER BY uf.created_at DESC`,
      [user.user_id],
    );

    res.json({ followers: result.rows });
  } catch (error) {
    console.error("Get followers error:", error);
    res.status(500).json({ error: "Failed to get followers" });
  }
});

// Get users that a user is following
app.get("/api/profile/:username/following", async (req, res) => {
  const { username } = req.params;

  try {
    const user = await getUserWithPrivacyCheck(
      username,
      "show_followers",
      res,
      "User following list is private",
    );
    if (!user) return;

    // Get following
    const result = await pool.query(
      `SELECT u.user_id, u.username, u.display_name, u.avatar_url,
              uf.created_at as followed_at
       FROM user_follows uf
       JOIN users u ON uf.following_id = u.user_id
       WHERE uf.follower_id = $1 AND u.is_active = true
       ORDER BY uf.created_at DESC`,
      [user.user_id],
    );

    res.json({ following: result.rows });
  } catch (error) {
    console.error("Get following error:", error);
    res.status(500).json({ error: "Failed to get following list" });
  }
});

// ==================== SYNC ENDPOINTS ====================

// Mount sync routes with authentication
app.use("/api/sync", authenticateToken, syncRoutes);

// ==================== REVIEW EVENT ENDPOINTS ====================

// Mount review event lifecycle routes
// POST   /api/reviews/events/start         - Start a new review event
// PATCH  /api/reviews/events/:id/interaction - Append interaction data
// POST   /api/reviews/events/:id/complete  - Complete a review event
// POST   /api/reviews/events               - Record complete event (single request)
// POST   /api/reviews/events/batch         - Batch record complete events
app.use(
  "/api/reviews/events",
  createReviewEventRoutes(pool, authenticateToken, requireAdmin),
);

// ==================== STUDY SESSION LIFECYCLE ENDPOINTS ====================

// Mount study session lifecycle routes (new robust session tracking)
// POST   /api/sessions/start         - Start a new session
// POST   /api/sessions/:id/heartbeat - Send heartbeat (every 30s)
// POST   /api/sessions/:id/break     - Record break start/end
// POST   /api/sessions/:id/complete  - Complete session
// POST   /api/sessions/:id/beacon    - Browser close handler (sendBeacon)
// GET    /api/sessions/active        - Get current active session
// GET    /api/sessions/recent        - Get recent sessions
// GET    /api/sessions/:id           - Get session details
app.use("/api/sessions", createStudySessionRoutes(pool, authenticateToken));

// ==================== CARD ANALYSIS ENDPOINTS ====================

// Mount card analysis routes
// GET    /api/analysis/cards/:cardId - Get analysis results
// POST   /api/analysis/cards/:cardId - Trigger analysis (immediate or queued)
// POST   /api/analysis/decks/:deckId - Queue deck for batch analysis
// GET    /api/analysis/backlog - Get job queue status
app.use("/api/analysis", createCardAnalysisRoutes(pool, authenticateToken));

// Mount admin analysis routes
// POST   /api/admin/analysis/reanalyze - Re-analyze cards by criteria
// GET    /api/admin/analysis/stats - Get analysis statistics
app.use(
  "/api/admin/analysis",
  createAdminAnalysisRoutes(pool, authenticateToken),
);

// ==================== RESEARCH DATA EXPORT ENDPOINTS ====================

// Initialize research export services
const dataAnonymizer = new DataAnonymizer(pool);
const researchExportService = new ResearchExportService(pool, dataAnonymizer);

// Mount research admin routes (requires authentication + admin role)
// POST   /api/admin/research/exports              - Create export job
// GET    /api/admin/research/exports              - List exports
// GET    /api/admin/research/exports/:id          - Get export status
// GET    /api/admin/research/exports/:id/download - Download export file
// POST   /api/admin/research/exports/:id/cancel   - Cancel export
// GET    /api/admin/research/dictionary           - Get data dictionary
// GET    /api/admin/research/consent-stats        - Get consent statistics
// POST   /api/admin/research/rotate-alids         - Rotate anonymous IDs
// GET    /api/admin/research/schemas              - Get schema versions
app.use(
  "/api/admin/research",
  createResearchExportRoutes(
    pool,
    researchExportService,
    authenticateToken,
    requireAdmin,
  ),
);

// Mount user research consent routes
// GET    /api/user/research-consent      - Get current consent status
// POST   /api/user/research-consent      - Update consent (opt-in/out)
// GET    /api/user/research-consent/info - Get research program information
app.use("/api/user", createResearchConsentRoutes(pool, authenticateToken));

// ==================== LEARNING ANALYTICS ENDPOINTS ====================

// Mount learning analytics routes
// GET    /api/analytics/users/:userId/profile              - Comprehensive learning profile
// GET    /api/analytics/users/:userId/velocity             - Velocity history
// GET    /api/analytics/users/:userId/daily-summary        - Daily learning summary
// GET    /api/analytics/users/:userId/struggling-cards     - Struggling cards
// GET    /api/analytics/users/:userId/struggling-cards/by-deck - Struggling cards by deck
// GET    /api/analytics/users/:userId/patterns/interference    - Interference patterns
// GET    /api/analytics/users/:userId/patterns/prerequisites   - Prerequisite gaps
// GET    /api/analytics/users/:userId/patterns/fatigue         - Fatigue decay analysis
// GET    /api/analytics/users/:userId/patterns/time-of-day     - Circadian effects
// GET    /api/analytics/cards/:cardId/difficulty           - Card difficulty metrics
// GET    /api/analytics/decks/:deckId/hardest              - Hardest cards in deck
// GET    /api/analytics/sessions/:sessionId/health         - Session health analysis
// GET    /api/analytics/sessions/:sessionId/health/live    - Live session health
app.use(
  "/api/analytics",
  createLearningAnalyticsRoutes(pool, authenticateToken),
);

// ==================== STUDY SESSION ENDPOINTS (LEGACY) ====================

// Record a study session
app.post("/api/study-sessions", authenticateToken, async (req, res) => {
  const { cardId, timeSpentMs, rating, difficultyRating } = req.body;

  if (!cardId || timeSpentMs === undefined || !rating) {
    return res
      .status(400)
      .json({ error: "cardId, timeSpentMs, and rating are required" });
  }

  if (rating < 1 || rating > 4) {
    return res.status(400).json({ error: "Rating must be between 1 and 4" });
  }

  try {
    // Generate ULID for session
    const sessionId = generateULID("rev");

    const result = await pool.query(
      `INSERT INTO study_sessions (session_id, user_id, card_id, time_spent_ms, rating, difficulty_rating)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING session_id, studied_at, was_correct`,
      [
        sessionId,
        req.userId,
        cardId,
        timeSpentMs,
        rating,
        difficultyRating || null,
      ],
    );

    res.status(201).json({
      success: true,
      session: result.rows[0],
    });
  } catch (error) {
    console.error("Record session error:", error);
    res.status(500).json({ error: "Failed to record study session" });
  }

  return null;
});

// Batch record study sessions
app.post("/api/study-sessions/batch", authenticateToken, async (req, res) => {
  const { sessions } = req.body;

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return res.status(400).json({ error: "sessions array is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const results = [];
    for (const studySession of sessions) {
      const { cardId, timeSpentMs, rating, difficultyRating } = studySession;

      // Generate ULID for each session
      const sessionId = generateULID("rev");

      const result = await client.query(
        `INSERT INTO study_sessions (session_id, user_id, card_id, time_spent_ms, rating, difficulty_rating)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING session_id, studied_at`,
        [
          sessionId,
          req.userId,
          cardId,
          timeSpentMs,
          rating,
          difficultyRating || null,
        ],
      );

      results.push(result.rows[0]);
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      count: results.length,
      sessions: results,
    });
    return null;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Batch record error:", error);
    res.status(500).json({ error: "Failed to record study sessions" });
    return null;
  } finally {
    client.release();
  }
});

// ==================== REVIEW EVENTS ENDPOINTS ====================
// Enriched review data for AI/ML analytics (separate from study_sessions)

// SQL query for inserting review events (shared between single and batch endpoints)
const REVIEW_EVENT_INSERT_QUERY = `
  INSERT INTO review_events (
    event_id, user_id, card_id, deck_id, session_id, rating,
    time_to_first_interaction_ms, time_to_answer_ms, total_duration_ms,
    hesitation_before_rating_ms, position_in_session, time_since_session_start_ms,
    local_hour, local_day_of_week, timezone_offset_minutes, preceding_reviews,
    response_type, user_response_text, expected_response_text, response_similarity_score,
    keystroke_count, backspace_count, paste_count, edit_count, option_interactions,
    device_type, viewport_width, viewport_height, was_backgrounded, time_backgrounded_ms,
    input_method, client_version, platform,
    card_state_before, card_state_after, predicted_recall_probability,
    actual_interval_days, scheduled_interval_days, overdue_days,
    ease_factor_before, ease_factor_after, interval_before_days, interval_after_days,
    repetition_count, lapse_count,
    front_content_length, back_content_length, has_media, media_types, card_tags,
    legacy_session_id
  ) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12,
    $13, $14, $15, $16,
    $17, $18, $19, $20, $21, $22, $23, $24, $25,
    $26, $27, $28, $29, $30, $31, $32, $33,
    $34, $35, $36, $37, $38, $39, $40, $41, $42, $43,
    $44, $45, $46, $47, $48, $49, $50,
    $51
  )
  RETURNING event_id, created_at`;

/**
 * Build params array for review event INSERT query
 */
function buildReviewEventParams(event, userId) {
  return [
    event.event_id,
    userId,
    event.card_id,
    event.deck_id,
    event.session_id || null,
    event.rating,
    event.time_to_first_interaction_ms,
    event.time_to_answer_ms,
    event.total_duration_ms,
    event.hesitation_before_rating_ms,
    event.position_in_session,
    event.time_since_session_start_ms,
    event.local_hour,
    event.local_day_of_week,
    event.timezone_offset_minutes,
    JSON.stringify(event.preceding_reviews || []),
    event.response_type || "self_rating",
    event.user_response_text,
    event.expected_response_text,
    event.response_similarity_score,
    event.keystroke_count,
    event.backspace_count,
    event.paste_count,
    event.edit_count,
    event.option_interactions
      ? JSON.stringify(event.option_interactions)
      : null,
    event.device_type || "unknown",
    event.viewport_width,
    event.viewport_height,
    event.was_backgrounded || false,
    event.time_backgrounded_ms,
    event.input_method,
    event.client_version,
    event.platform,
    event.card_state_before,
    event.card_state_after,
    event.predicted_recall_probability,
    event.actual_interval_days,
    event.scheduled_interval_days,
    event.overdue_days,
    event.ease_factor_before,
    event.ease_factor_after,
    event.interval_before_days,
    event.interval_after_days,
    event.repetition_count,
    event.lapse_count,
    event.front_content_length,
    event.back_content_length,
    event.has_media || false,
    event.media_types || [],
    event.card_tags || [],
    event.legacy_session_id,
  ];
}

// Record a single review event
app.post("/api/review-events", authenticateToken, async (req, res) => {
  const event = req.body;

  // Validate required fields
  if (
    !event.event_id ||
    !event.card_id ||
    !event.deck_id ||
    event.rating === undefined
  ) {
    return res.status(400).json({
      error: "event_id, card_id, deck_id, and rating are required",
    });
  }

  if (event.rating < 1 || event.rating > 4) {
    return res.status(400).json({ error: "Rating must be between 1 and 4" });
  }

  try {
    const result = await pool.query(
      REVIEW_EVENT_INSERT_QUERY,
      buildReviewEventParams(event, req.userId),
    );

    res.status(201).json({
      success: true,
      event: result.rows[0],
    });
  } catch (error) {
    console.error("Record review event error:", error);
    res.status(500).json({ error: "Failed to record review event" });
  }

  return null;
});

// Batch record review events
app.post("/api/review-events/batch", authenticateToken, async (req, res) => {
  const { events } = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: "events array is required" });
  }

  // Limit batch size to prevent abuse
  if (events.length > 100) {
    return res.status(400).json({ error: "Maximum 100 events per batch" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const results = [];
    for (const event of events) {
      const result = await client.query(
        REVIEW_EVENT_INSERT_QUERY,
        buildReviewEventParams(event, req.userId),
      );

      results.push(result.rows[0]);
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      count: results.length,
      events: results,
    });
    return null;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Batch record review events error:", error);
    res.status(500).json({ error: "Failed to record review events" });
    return null;
  } finally {
    client.release();
  }
});

// ==================== STATISTICS ENDPOINTS ====================

// Get user statistics
app.get("/api/statistics/user/:userId", authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const { period } = req.query; // 'today', 'week', 'month', 'all'

  try {
    let stats = null;

    if (period === "today") {
      const result = await pool.query(
        `SELECT date, cards_studied, unique_cards, total_time_ms,
                correct_answers, total_answers, retention_rate
         FROM user_statistics_daily
         WHERE user_id = $1 AND date = CURRENT_DATE`,
        [userId],
      );
      stats = result.rows[0] || {
        cards_studied: 0,
        unique_cards: 0,
        total_time_ms: 0,
        correct_answers: 0,
        total_answers: 0,
        retention_rate: 0,
      };
    } else if (period === "week") {
      const result = await pool.query(
        `SELECT
          SUM(cards_studied) as cards_studied,
          SUM(unique_cards) as unique_cards,
          SUM(total_time_ms) as total_time_ms,
          SUM(correct_answers) as correct_answers,
          SUM(total_answers) as total_answers,
          CASE
            WHEN SUM(total_answers) > 0
            THEN (SUM(correct_answers)::DECIMAL / SUM(total_answers) * 100)
            ELSE 0
          END as retention_rate
         FROM user_statistics_daily
         WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days'`,
        [userId],
      );
      stats = result.rows[0];
    } else if (period === "month") {
      const result = await pool.query(
        `SELECT
          SUM(cards_studied) as cards_studied,
          SUM(unique_cards) as unique_cards,
          SUM(total_time_ms) as total_time_ms,
          SUM(correct_answers) as correct_answers,
          SUM(total_answers) as total_answers,
          CASE
            WHEN SUM(total_answers) > 0
            THEN (SUM(correct_answers)::DECIMAL / SUM(total_answers) * 100)
            ELSE 0
          END as retention_rate
         FROM user_statistics_daily
         WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'`,
        [userId],
      );
      stats = result.rows[0];
    } else {
      // All-time stats
      const result = await pool.query(
        "SELECT * FROM user_statistics_total WHERE user_id = $1",
        [userId],
      );
      stats = result.rows[0] || {
        total_cards_studied: 0,
        total_time_ms: 0,
        total_correct: 0,
        total_attempts: 0,
        retention_rate: 0,
        current_streak: 0,
        longest_streak: 0,
      };
    }

    res.json({ stats });
  } catch (error) {
    console.error("Get statistics error:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

// Get daily statistics for a date range
app.get(
  "/api/statistics/daily/:userId",
  authenticateToken,
  async (req, res) => {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    try {
      const result = await pool.query(
        `SELECT date, cards_studied, unique_cards, total_time_ms,
              correct_answers, total_answers, retention_rate
       FROM user_statistics_daily
       WHERE user_id = $1
         AND date >= $2
         AND date <= $3
       ORDER BY date ASC`,
        [userId, startDate || "1970-01-01", endDate || "2099-12-31"],
      );

      res.json({ dailyStats: result.rows });
    } catch (error) {
      console.error("Get daily statistics error:", error);
      res.status(500).json({ error: "Failed to get daily statistics" });
    }
  },
);

// ==================== LEADERBOARD ENDPOINTS ====================

// Get leaderboard for a specific metric
app.get("/api/leaderboard/:metric", async (req, res) => {
  const { metric } = req.params;
  const { limit } = req.query;

  const validMetrics = [
    "total_cards",
    "total_time",
    "retention_rate",
    "current_streak",
  ];
  if (!validMetrics.includes(metric)) {
    return res.status(400).json({ error: "Invalid metric type" });
  }

  try {
    // First, refresh the leaderboard cache
    await pool.query("SELECT refresh_leaderboard($1, $2)", [
      metric,
      parseInt(limit) || 100,
    ]);

    // Then fetch the cached results
    const result = await pool.query(
      `SELECT rank, user_id, username, display_name, value, updated_at
       FROM leaderboard_cache
       WHERE metric_type = $1
       ORDER BY rank ASC`,
      [metric],
    );

    res.json({
      metric,
      leaderboard: result.rows,
    });
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
  return null;
});

// Get user's rank for a specific metric
app.get(
  "/api/statistics/rank/:userId/:metric",
  authenticateToken,
  async (req, res) => {
    const { userId, metric } = req.params;

    const validMetrics = [
      "total_cards",
      "total_time",
      "retention_rate",
      "current_streak",
    ];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({ error: "Invalid metric type" });
    }

    try {
      let column = "";
      let table = "";
      let whereClause = "";

      if (metric === "total_cards") {
        column = "total_cards_studied";
        table = "user_statistics_total";
        whereClause = "total_cards_studied > 0";
      } else if (metric === "total_time") {
        column = "total_time_ms";
        table = "user_statistics_total";
        whereClause = "total_time_ms > 0";
      } else if (metric === "retention_rate") {
        column = "retention_rate";
        table = "user_statistics_total";
        whereClause = "total_attempts >= 50";
      } else if (metric === "current_streak") {
        column = "current_streak";
        table = "user_statistics_total";
        whereClause = "current_streak > 0";
      }

      const result = await pool.query(
        `WITH ranked_users AS (
        SELECT
          user_id,
          ${column} as value,
          ROW_NUMBER() OVER (ORDER BY ${column} DESC) as rank
        FROM ${table}
        WHERE ${whereClause}
      )
      SELECT rank, value
      FROM ranked_users
      WHERE user_id = $1`,
        [userId],
      );

      if (result.rows.length === 0) {
        return res.json({ rank: null, value: 0 });
      }

      return res.json({
        metric,
        rank: result.rows[0].rank,
        value: result.rows[0].value,
      });
    } catch (error) {
      console.error("Get rank error:", error);
      return res.status(500).json({ error: "Failed to get rank" });
    }
  },
);

// Upload and import Anki deck
app.post(
  "/api/decks/import",
  uploadLimiter,
  upload.single("deck"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Validate uploaded file path is within uploads directory
    if (!isPathSafe(req.file.path, UPLOADS_DIR)) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    const client = await pool.connect();
    const tempDir = path.join(UPLOADS_DIR, `temp_${Date.now()}`);
    let ankiDb = null;

    try {
      const zip = new AdmZip(req.file.path);
      zip.extractAllTo(tempDir, true);

      // Validate temp directory is within uploads directory
      if (!isPathSafe(tempDir, UPLOADS_DIR)) {
        throw new Error("Invalid temp directory path");
      }

      // Open Anki's SQLite database (try different versions)
      let collectionPath = path.join(tempDir, "collection.anki21");
      if (!fs.existsSync(collectionPath)) {
        collectionPath = path.join(tempDir, "collection.anki21b");
      }
      if (!fs.existsSync(collectionPath)) {
        collectionPath = path.join(tempDir, "collection.anki2");
      }
      if (!fs.existsSync(collectionPath)) {
        throw new Error("Invalid .apkg file: no collection file found");
      }

      ankiDb = new Database(collectionPath, { readonly: true });

      await client.query("BEGIN");

      // Validate that the uploaded file is a proper Anki database (throws if col table is missing)
      ankiDb.prepare("SELECT * FROM col").get();
      const deckName = req.body.deckName || "Imported Deck";

      // Create deck in our database
      const deckResult = await client.query(
        `
      INSERT INTO decks (name, description, metadata)
      VALUES ($1, $2, $3)
      RETURNING deck_id
    `,
        [deckName, "Imported from Anki", JSON.stringify({})],
      );

      const deckId = deckResult.rows[0].deck_id;

      // Get all notes (cards) from Anki
      const notes = ankiDb.prepare("SELECT * FROM notes").all();

      let cardCount = 0;
      for (const note of notes) {
        const fields = note.flds.split("\x1f"); // Anki uses \x1f as separator

        if (fields.length >= 2) {
          await client.query(
            `
          INSERT INTO cards (deck_id, card_type, front_content, back_content, tags)
          VALUES ($1, $2, $3, $4, $5)
        `,
            [
              deckId,
              "basic",
              JSON.stringify({ html: fields[0], media: [] }),
              JSON.stringify({ html: fields[1], media: [] }),
              note.tags ? note.tags.split(" ") : [],
            ],
          );
          cardCount++;
        }
      }

      await client.query("COMMIT");

      return res.json({
        success: true,
        deckId,
        deckName,
        cardsImported: cardCount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Import error:", error);
      return res.status(500).json({ error: error.message });
    } finally {
      // Close database connection if opened
      if (ankiDb) {
        try {
          ankiDb.close();
        } catch (e) {
          console.error("Error closing Anki database:", e);
        }
      }

      // Clean up temporary files - validate paths before deletion
      // Define a helper that robustly checks whether filePath is strictly inside dirPath:
      const isPathContained = (filePath, dirPath) => {
        try {
          const fileReal = fs.realpathSync(filePath);
          let dirReal = fs.realpathSync(dirPath);
          // Ensure consistent separator at end of directory real path
          if (!dirReal.endsWith(path.sep)) {
            dirReal = dirReal + path.sep;
          }
          return fileReal.startsWith(dirReal);
        } catch {
          // Could not resolve path; treat as not contained
          return false;
        }
      };

      // Clean up temporary directory
      try {
        if (fs.existsSync(tempDir) && isPathContained(tempDir, UPLOADS_DIR)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error("Error cleaning up temp directory:", e);
      }

      // Clean up uploaded file
      try {
        if (req.file?.path) {
          // Initialize variable on declaration to satisfy DeepSource JS-0119
          let uploadedFileRealPath = null;
          try {
            // Always resolve the file path as a child of UPLOADS_DIR to prevent traversal
            const absUploadedPath = path.resolve(
              UPLOADS_DIR,
              path.basename(req.file.path),
            );
            // Get the canonical path for symlink protection
            uploadedFileRealPath = fs.realpathSync(absUploadedPath);
          } catch {
            // If realpathSync fails, keep as null
            uploadedFileRealPath = null;
          }
          // Only delete if path is valid and contained within UPLOADS_DIR
          if (
            uploadedFileRealPath &&
            fs.existsSync(uploadedFileRealPath) &&
            isPathContained(uploadedFileRealPath, UPLOADS_DIR)
          ) {
            fs.unlinkSync(uploadedFileRealPath);
          }
        }
      } catch (e) {
        console.error("Error cleaning up uploaded file:", e);
      }

      client.release();
    }
  },
);

// Get all decks
app.get("/api/decks", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM decks ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get deck with cards
app.get("/api/decks/:id", async (req, res) => {
  try {
    const deck = await pool.query("SELECT * FROM decks WHERE deck_id = $1", [
      req.params.id,
    ]);
    const cards = await pool.query("SELECT * FROM cards WHERE deck_id = $1", [
      req.params.id,
    ]);

    res.json({
      deck: deck.rows[0],
      cards: cards.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BROWSE API ENDPOINTS (The Commons)
// ============================================

// Get all categories with deck counts
app.get("/api/browse/categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c.icon_emoji as "iconEmoji",
        c.display_order as "displayOrder",
        COUNT(dc.deck_id) FILTER (WHERE d.is_public = true) as "deckCount"
      FROM categories c
      LEFT JOIN deck_categories dc ON c.id = dc.category_id
      LEFT JOIN decks d ON dc.deck_id = d.deck_id
      GROUP BY c.id, c.name, c.slug, c.description, c.icon_emoji, c.display_order
      ORDER BY c.display_order ASC
    `);
    res.json(
      result.rows.map((row) => ({
        ...row,
        deckCount: parseInt(row.deckCount) || 0,
      })),
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Get decks in a category with sorting and filtering
app.get("/api/browse/categories/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { sort = "community", tags, page = 1, limit = 20 } = req.query;

    // Get category
    const categoryResult = await pool.query(
      "SELECT * FROM categories WHERE slug = $1",
      [slug],
    );
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    const category = categoryResult.rows[0];

    // Build sort clause
    let orderBy = "";
    switch (sort) {
      case "newest":
        orderBy = "d.created_at DESC";
        break;
      case "popular":
        orderBy = "d.subscriber_count DESC, d.created_at DESC";
        break;
      case "rating":
        orderBy = "d.average_rating DESC NULLS LAST, d.subscriber_count DESC";
        break;
      case "updated":
        orderBy = "d.last_activity_at DESC NULLS LAST";
        break;
      case "cards":
        orderBy = "(SELECT COUNT(*) FROM cards WHERE deck_id = d.deck_id) DESC";
        break;
      case "community":
      default:
        orderBy = "d.trending_score DESC, d.subscriber_count DESC";
        break;
    }

    // Parse tags filter
    const tagSlugs = tags ? tags.split(",").filter(Boolean) : [];

    // Build query with optional tag filtering
    let deckQuery = "";
    let queryParams = [];
    const offset = (parseInt(page) - 1) * parseInt(limit);

    if (tagSlugs.length > 0) {
      // Filter by tags (AND logic - deck must have ALL specified tags)
      deckQuery = `
        SELECT
          d.deck_id as id,
          d.name,
          d.description,
          d.subscriber_count as "subscriberCount",
          d.average_rating as "averageRating",
          d.last_activity_at as "lastActivityAt",
          d.featured_at as "featuredAt",
          d.created_at as "createdAt",
          d.trending_score as "trendingScore",
          u.username as "authorUsername",
          u.display_name as "authorDisplayName",
          (SELECT COUNT(*) FROM cards WHERE deck_id = d.deck_id) as "cardCount"
        FROM decks d
        JOIN deck_categories dc ON d.deck_id = dc.deck_id
        JOIN users u ON d.author_id = u.user_id
        WHERE dc.category_id = $1
          AND d.is_public = true
          AND d.deck_id IN (
            SELECT dt.deck_id
            FROM deck_tags dt
            JOIN tags t ON dt.tag_id = t.id
            WHERE t.slug = ANY($2)
            GROUP BY dt.deck_id
            HAVING COUNT(DISTINCT t.slug) = $3
          )
        ORDER BY ${orderBy}
        LIMIT $4 OFFSET $5
      `;
      queryParams = [
        category.id,
        tagSlugs,
        tagSlugs.length,
        parseInt(limit),
        offset,
      ];
    } else {
      deckQuery = `
        SELECT
          d.deck_id as id,
          d.name,
          d.description,
          d.subscriber_count as "subscriberCount",
          d.average_rating as "averageRating",
          d.last_activity_at as "lastActivityAt",
          d.featured_at as "featuredAt",
          d.created_at as "createdAt",
          d.trending_score as "trendingScore",
          u.username as "authorUsername",
          u.display_name as "authorDisplayName",
          (SELECT COUNT(*) FROM cards WHERE deck_id = d.deck_id) as "cardCount"
        FROM decks d
        JOIN deck_categories dc ON d.deck_id = dc.deck_id
        JOIN users u ON d.author_id = u.user_id
        WHERE dc.category_id = $1 AND d.is_public = true
        ORDER BY ${orderBy}
        LIMIT $2 OFFSET $3
      `;
      queryParams = [category.id, parseInt(limit), offset];
    }

    const decksResult = await pool.query(deckQuery, queryParams);

    // Get total count for pagination
    let countQuery = "";
    let countParams = [];
    if (tagSlugs.length > 0) {
      countQuery = `
        SELECT COUNT(DISTINCT d.deck_id)
        FROM decks d
        JOIN deck_categories dc ON d.deck_id = dc.deck_id
        WHERE dc.category_id = $1
          AND d.is_public = true
          AND d.deck_id IN (
            SELECT dt.deck_id
            FROM deck_tags dt
            JOIN tags t ON dt.tag_id = t.id
            WHERE t.slug = ANY($2)
            GROUP BY dt.deck_id
            HAVING COUNT(DISTINCT t.slug) = $3
          )
      `;
      countParams = [category.id, tagSlugs, tagSlugs.length];
    } else {
      countQuery = `
        SELECT COUNT(*)
        FROM decks d
        JOIN deck_categories dc ON d.deck_id = dc.deck_id
        WHERE dc.category_id = $1 AND d.is_public = true
      `;
      countParams = [category.id];
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // Get tags used in this category
    const tagsResult = await pool.query(
      `
      SELECT DISTINCT t.id, t.name, t.slug, t.usage_count as "usageCount"
      FROM tags t
      JOIN deck_tags dt ON t.id = dt.tag_id
      JOIN deck_categories dc ON dt.deck_id = dc.deck_id
      JOIN decks d ON dt.deck_id = d.deck_id
      WHERE (dc.category_id = $1 OR t.category_id = $1)
        AND d.is_public = true
      ORDER BY t.usage_count DESC
      LIMIT 30
    `,
      [category.id],
    );

    return res.json({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        iconEmoji: category.icon_emoji,
      },
      decks: decksResult.rows.map((deck) => transformDeckResponse(deck)),
      tags: tagsResult.rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error fetching category decks:", error);
    return res.status(500).json({ error: "Failed to fetch decks" });
  }
});

// Get featured decks (optionally filtered by category)
app.get("/api/browse/featured", async (req, res) => {
  try {
    const { categorySlug, limit = 6 } = req.query;

    let query = "";
    let params = [];

    if (categorySlug) {
      query = `
        SELECT
          d.deck_id as id,
          d.name,
          d.description,
          d.subscriber_count as "subscriberCount",
          d.average_rating as "averageRating",
          d.featured_at as "featuredAt",
          u.username as "authorUsername",
          u.display_name as "authorDisplayName",
          (SELECT COUNT(*) FROM cards WHERE deck_id = d.deck_id) as "cardCount"
        FROM decks d
        JOIN users u ON d.author_id = u.user_id
        JOIN deck_categories dc ON d.deck_id = dc.deck_id
        JOIN categories c ON dc.category_id = c.id
        WHERE d.is_public = true
          AND d.featured_at IS NOT NULL
          AND c.slug = $1
        ORDER BY d.featured_at DESC
        LIMIT $2
      `;
      params = [categorySlug, parseInt(limit)];
    } else {
      query = `
        SELECT
          d.deck_id as id,
          d.name,
          d.description,
          d.subscriber_count as "subscriberCount",
          d.average_rating as "averageRating",
          d.featured_at as "featuredAt",
          u.username as "authorUsername",
          u.display_name as "authorDisplayName",
          (SELECT COUNT(*) FROM cards WHERE deck_id = d.deck_id) as "cardCount"
        FROM decks d
        JOIN users u ON d.author_id = u.user_id
        WHERE d.is_public = true AND d.featured_at IS NOT NULL
        ORDER BY d.featured_at DESC
        LIMIT $1
      `;
      params = [parseInt(limit)];
    }

    const result = await pool.query(query, params);
    res.json(
      result.rows.map((deck) =>
        transformDeckResponse(deck, { isFeatured: true }),
      ),
    );
  } catch (error) {
    console.error("Error fetching featured decks:", error);
    res.status(500).json({ error: "Failed to fetch featured decks" });
  }
});

// Get public deck details
app.get("/api/browse/decks/:deckId", async (req, res) => {
  try {
    const { deckId } = req.params;

    const deckResult = await pool.query(
      `
      SELECT
        d.deck_id as id,
        d.name,
        d.description,
        d.subscriber_count as "subscriberCount",
        d.average_rating as "averageRating",
        d.last_activity_at as "lastActivityAt",
        d.featured_at as "featuredAt",
        d.created_at as "createdAt",
        d.is_public as "isPublic",
        u.username as "authorUsername",
        u.display_name as "authorDisplayName",
        (SELECT COUNT(*) FROM cards WHERE deck_id = d.deck_id) as "cardCount"
      FROM decks d
      JOIN users u ON d.author_id = u.user_id
      WHERE d.deck_id = $1 AND d.is_public = true
    `,
      [deckId],
    );

    if (deckResult.rows.length === 0) {
      return res.status(404).json({ error: "Deck not found or not public" });
    }

    const deck = deckResult.rows[0];

    // Get categories
    const categoriesResult = await pool.query(
      `
      SELECT c.id, c.name, c.slug, dc.is_primary as "isPrimary"
      FROM categories c
      JOIN deck_categories dc ON c.id = dc.category_id
      WHERE dc.deck_id = $1
      ORDER BY dc.is_primary DESC
    `,
      [deckId],
    );

    // Get tags
    const tagsResult = await pool.query(
      `
      SELECT t.id, t.name, t.slug
      FROM tags t
      JOIN deck_tags dt ON t.id = dt.tag_id
      WHERE dt.deck_id = $1
    `,
      [deckId],
    );

    // Get sample cards (first 5)
    const cardsResult = await pool.query(
      `
      SELECT card_id as id, front_content as "frontContent", back_content as "backContent"
      FROM cards
      WHERE deck_id = $1
      LIMIT 5
    `,
      [deckId],
    );

    return res.json({
      ...transformDeckResponse(deck),
      categories: categoriesResult.rows,
      tags: tagsResult.rows,
      sampleCards: cardsResult.rows,
    });
  } catch (error) {
    console.error("Error fetching deck details:", error);
    return res.status(500).json({ error: "Failed to fetch deck details" });
  }
});

// Publish a deck to The Commons (protected)
app.post("/api/decks/:deckId/publish", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { deckId } = req.params;
    const { categoryId, tags = [] } = req.body;
    const userId = req.userId;

    if (!categoryId) {
      return res.status(400).json({ error: "Category is required" });
    }

    await client.query("BEGIN");

    // Verify deck exists and user owns it
    const deckResult = await client.query(
      "SELECT deck_id, author_id FROM decks WHERE deck_id = $1",
      [deckId],
    );

    if (deckResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Deck not found" });
    }

    // If deck has no author_id, set it (for existing decks)
    if (!deckResult.rows[0].author_id) {
      await client.query("UPDATE decks SET author_id = $1 WHERE deck_id = $2", [
        userId,
        deckId,
      ]);
    } else if (deckResult.rows[0].author_id !== userId) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "You can only publish your own decks" });
    }

    // Verify category exists
    const categoryResult = await client.query(
      "SELECT id FROM categories WHERE id = $1",
      [categoryId],
    );
    if (categoryResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid category" });
    }

    // Update deck to public
    await client.query(
      `
      UPDATE decks
      SET is_public = true,
          last_activity_at = CURRENT_TIMESTAMP,
          trending_score = calculate_trending_score($1)
      WHERE deck_id = $1
    `,
      [deckId],
    );

    // Add primary category
    await client.query(
      `
      INSERT INTO deck_categories (deck_id, category_id, is_primary)
      VALUES ($1, $2, true)
      ON CONFLICT (deck_id, category_id) DO UPDATE SET is_primary = true
    `,
      [deckId, categoryId],
    );

    // Add tags (create if they don't exist)
    for (const tagName of tags) {
      const slug = tagName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      // Insert or get tag
      const tagResult = await client.query(
        `
        INSERT INTO tags (id, name, slug)
        VALUES ($1, $2, $3)
        ON CONFLICT (slug) DO UPDATE SET name = tags.name
        RETURNING id
      `,
        [`tag_${ulid()}`, tagName.toLowerCase(), slug],
      );

      // Link tag to deck
      await client.query(
        `
        INSERT INTO deck_tags (deck_id, tag_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
        [deckId, tagResult.rows[0].id],
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Deck published to The Commons",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error publishing deck:", error);
    return res.status(500).json({ error: "Failed to publish deck" });
  } finally {
    client.release();
  }
});

// Subscribe to a deck (protected)
app.post(
  "/api/decks/:deckId/subscribe",
  authenticateToken,
  async (req, res) => {
    try {
      const { deckId } = req.params;
      const userId = req.userId;

      // Verify deck is public
      const deckResult = await pool.query(
        "SELECT deck_id FROM decks WHERE deck_id = $1 AND is_public = true",
        [deckId],
      );
      if (deckResult.rows.length === 0) {
        return res.status(404).json({ error: "Deck not found or not public" });
      }

      // Add subscription
      await pool.query(
        `
      INSERT INTO deck_subscriptions (user_id, deck_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `,
        [userId, deckId],
      );

      res.json({ success: true, message: "Subscribed to deck" });
    } catch (error) {
      console.error("Error subscribing to deck:", error);
      res.status(500).json({ error: "Failed to subscribe" });
    }
    return null;
  },
);

// Unsubscribe from a deck (protected)
app.delete(
  "/api/decks/:deckId/subscribe",
  authenticateToken,
  async (req, res) => {
    try {
      const { deckId } = req.params;
      const userId = req.userId;

      await pool.query(
        "DELETE FROM deck_subscriptions WHERE user_id = $1 AND deck_id = $2",
        [userId, deckId],
      );

      res.json({ success: true, message: "Unsubscribed from deck" });
    } catch (error) {
      console.error("Error unsubscribing from deck:", error);
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  },
);

// Check if user is subscribed to a deck (protected)
app.get(
  "/api/decks/:deckId/subscription",
  authenticateToken,
  async (req, res) => {
    try {
      const { deckId } = req.params;
      const userId = req.userId;

      const result = await pool.query(
        "SELECT 1 FROM deck_subscriptions WHERE user_id = $1 AND deck_id = $2",
        [userId, deckId],
      );

      res.json({ isSubscribed: result.rows.length > 0 });
    } catch (error) {
      console.error("Error checking subscription:", error);
      res.status(500).json({ error: "Failed to check subscription" });
    }
  },
);

// Flag a deck for inappropriate content (protected, rate limited)
const flagLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 flags per hour per IP
  message: "Too many flag requests, please try again later.",
  validate: { trustProxy: false }, // We handle trust proxy at the app level
});

app.post(
  "/api/decks/:deckId/flag",
  authenticateToken,
  flagLimiter,
  async (req, res) => {
    try {
      const { deckId } = req.params;
      const { reason } = req.body;
      const userId = req.userId;

      if (!reason || reason.trim().length < 10) {
        return res.status(400).json({
          error: "Please provide a detailed reason (at least 10 characters)",
        });
      }

      // Verify deck exists and is public
      const deckResult = await pool.query(
        "SELECT deck_id FROM decks WHERE deck_id = $1 AND is_public = true",
        [deckId],
      );
      if (deckResult.rows.length === 0) {
        return res.status(404).json({ error: "Deck not found or not public" });
      }

      // Check if user already flagged this deck
      const existingFlag = await pool.query(
        "SELECT id FROM deck_flags WHERE deck_id = $1 AND reporter_id = $2 AND status = 'pending'",
        [deckId, userId],
      );
      if (existingFlag.rows.length > 0) {
        return res
          .status(400)
          .json({ error: "You have already flagged this deck" });
      }

      // Create flag
      await pool.query(
        `
      INSERT INTO deck_flags (id, deck_id, reporter_id, reason)
      VALUES ($1, $2, $3, $4)
    `,
        [`flag_${ulid()}`, deckId, userId, reason.trim()],
      );

      res.json({
        success: true,
        message: "Thank you for your report. We will review it shortly.",
      });
    } catch (error) {
      console.error("Error flagging deck:", error);
      res.status(500).json({ error: "Failed to submit flag" });
    }
    return null;
  },
);

// Get user's subscribed decks (protected)
app.get("/api/browse/subscriptions", authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `
      SELECT
        d.deck_id as id,
        d.name,
        d.description,
        d.subscriber_count as "subscriberCount",
        d.average_rating as "averageRating",
        d.last_activity_at as "lastActivityAt",
        u.username as "authorUsername",
        u.display_name as "authorDisplayName",
        (SELECT COUNT(*) FROM cards WHERE deck_id = d.deck_id) as "cardCount",
        ds.subscribed_at as "subscribedAt"
      FROM deck_subscriptions ds
      JOIN decks d ON ds.deck_id = d.deck_id
      JOIN users u ON d.author_id = u.user_id
      WHERE ds.user_id = $1 AND d.is_public = true
      ORDER BY ds.subscribed_at DESC
    `,
      [userId],
    );

    res.json(result.rows.map((deck) => transformDeckResponse(deck)));
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

// ==================== JOB PROCESSORS ====================

// Start the analysis job processor for background card analysis
const analysisProcessor = new AnalysisJobProcessor(pool);
analysisProcessor.start();

// Start the research export processor for background data exports
const researchExportProcessor = new ResearchExportProcessor(
  pool,
  researchExportService,
  { pollInterval: 30000 }, // Poll every 30 seconds
);
researchExportProcessor.start();

// ==================== SERVER STARTUP ====================

const PORT = 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// ==================== GRACEFUL SHUTDOWN ====================

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log("HTTP server closed");
  });

  // Stop the analysis job processor
  await analysisProcessor.stop();

  // Stop the research export processor
  await researchExportProcessor.stop();

  // Close database pool
  await pool.end();
  console.log("Database pool closed");
  console.log("Graceful shutdown complete");
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
