import { addCorsHeaders } from '../utils/cors.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Initialize service workers tables
export async function initializeServiceWorkersTables(request, env) {
  try {
    console.log('🚀 Starting service workers tables initialization...');

    // Create service_workers table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS service_workers (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        is_active INTEGER DEFAULT 1,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
    console.log('✅ service_workers table created');

    // Create service_worker_permissions table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS service_worker_permissions (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        permission_type TEXT NOT NULL CHECK (permission_type IN ('bookings', 'services', 'customers', 'all')),
        resource_id TEXT,
        can_view INTEGER DEFAULT 1,
        can_edit INTEGER DEFAULT 0,
        can_delete INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `).run();
    console.log('✅ service_worker_permissions table created');

    // Create provider_subscriptions table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS provider_subscriptions (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL UNIQUE,
        plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
        max_workers INTEGER DEFAULT 2,
        billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
        price_per_month REAL DEFAULT 0,
        subscription_start_date TEXT,
        subscription_end_date TEXT,
        is_active INTEGER DEFAULT 1,
        auto_renew INTEGER DEFAULT 0,
        payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')) DEFAULT 'paid',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
    console.log('✅ provider_subscriptions table created');

    // Create subscription_plans table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        plan_name TEXT NOT NULL,
        plan_type TEXT NOT NULL UNIQUE CHECK (plan_type IN ('free', 'basic', 'premium', 'enterprise')),
        max_workers INTEGER NOT NULL,
        monthly_price REAL NOT NULL,
        yearly_price REAL NOT NULL,
        features TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
    console.log('✅ subscription_plans table created');

    // Insert default subscription plans
    const plans = [
      {
        id: 'plan_free',
        name: 'Free Plan',
        type: 'free',
        max_workers: 2,
        monthly: 0,
        yearly: 0,
        features: JSON.stringify(['2 Service Workers', 'Basic Booking Management', 'Customer Access'])
      },
      {
        id: 'plan_basic',
        name: 'Basic Plan',
        type: 'basic',
        max_workers: 5,
        monthly: 499,
        yearly: 4990,
        features: JSON.stringify(['5 Service Workers', 'Advanced Booking Management', 'Customer Management', 'Priority Support'])
      },
      {
        id: 'plan_premium',
        name: 'Premium Plan',
        type: 'premium',
        max_workers: 15,
        monthly: 999,
        yearly: 9990,
        features: JSON.stringify(['15 Service Workers', 'Full Booking Control', 'Analytics Dashboard', '24/7 Support', 'Custom Branding'])
      },
      {
        id: 'plan_enterprise',
        name: 'Enterprise Plan',
        type: 'enterprise',
        max_workers: 999,
        monthly: 2499,
        yearly: 24990,
        features: JSON.stringify(['Unlimited Workers', 'Dedicated Account Manager', 'Custom Integrations', 'Advanced Analytics', 'White Label Solution'])
      }
    ];

    for (const plan of plans) {
      await env.KUDDL_DB.prepare(`
        INSERT OR REPLACE INTO subscription_plans 
        (id, plan_name, plan_type, max_workers, monthly_price, yearly_price, features, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).bind(plan.id, plan.name, plan.type, plan.max_workers, plan.monthly, plan.yearly, plan.features).run();
    }
    console.log('✅ Default subscription plans inserted');

    // Create indexes
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_service_workers_provider ON service_workers(provider_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_service_workers_username ON service_workers(username)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_worker_permissions_worker ON service_worker_permissions(worker_id)').run();
    await env.KUDDL_DB.prepare('CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_provider ON provider_subscriptions(provider_id)').run();
    console.log('✅ Indexes created');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Service workers tables initialized successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('❌ Initialization error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to initialize tables',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get available subscription plans
export async function getSubscriptionPlans(request, env) {
  try {
    const plans = await env.KUDDL_DB.prepare(`
      SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY monthly_price ASC
    `).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      plans: (plans.results || []).map(plan => ({
        ...plan,
        features: JSON.parse(plan.features || '[]')
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get subscription plans error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch subscription plans',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Get provider's current subscription
export async function getProviderSubscription(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;

    // Get or create subscription
    let subscription = await env.KUDDL_DB.prepare(`
      SELECT * FROM provider_subscriptions WHERE provider_id = ?
    `).bind(providerId).first();

    if (!subscription) {
      // Create free plan subscription for new provider
      const subId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await env.KUDDL_DB.prepare(`
        INSERT INTO provider_subscriptions 
        (id, provider_id, plan_type, max_workers, billing_cycle, price_per_month, is_active, payment_status, created_at, updated_at)
        VALUES (?, ?, 'free', 2, NULL, 0, 1, 'paid', datetime('now'), datetime('now'))
      `).bind(subId, providerId).run();

      subscription = await env.KUDDL_DB.prepare(`
        SELECT * FROM provider_subscriptions WHERE provider_id = ?
      `).bind(providerId).first();
    }

    // Get current worker count
    const workerCount = await env.KUDDL_DB.prepare(`
      SELECT COUNT(*) as count FROM service_workers WHERE provider_id = ?
    `).bind(providerId).first();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      subscription: {
        ...subscription,
        current_workers: workerCount.count,
        can_add_more: workerCount.count < subscription.max_workers
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get provider subscription error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch subscription',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Upgrade provider subscription
export async function upgradeSubscription(request, env) {
  try {
    const { plan_type, billing_cycle } = await request.json();

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const token = authHeader.replace('Bearer ', '');
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }

    const decoded = jwt.decode(token);
    const providerId = decoded.payload.partnerId || decoded.payload.id;

    // Get plan details
    const plan = await env.KUDDL_DB.prepare(`
      SELECT * FROM subscription_plans WHERE plan_type = ?
    `).bind(plan_type).first();

    if (!plan) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid plan type'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const price = billing_cycle === 'yearly' ? plan.yearly_price : plan.monthly_price;
    const startDate = new Date().toISOString();
    const endDate = new Date();
    if (billing_cycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Update or create subscription
    await env.KUDDL_DB.prepare(`
      INSERT OR REPLACE INTO provider_subscriptions 
      (id, provider_id, plan_type, max_workers, billing_cycle, price_per_month, subscription_start_date, subscription_end_date, is_active, auto_renew, payment_status, created_at, updated_at)
      VALUES (
        COALESCE((SELECT id FROM provider_subscriptions WHERE provider_id = ?), ?),
        ?, ?, ?, ?, ?, ?, ?, 1, 1, 'pending', 
        COALESCE((SELECT created_at FROM provider_subscriptions WHERE provider_id = ?), datetime('now')),
        datetime('now')
      )
    `).bind(
      providerId,
      `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      providerId,
      plan_type,
      plan.max_workers,
      billing_cycle,
      price,
      startDate,
      endDate.toISOString(),
      providerId
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Subscription upgraded successfully',
      plan: {
        plan_type,
        max_workers: plan.max_workers,
        billing_cycle,
        price,
        payment_status: 'pending'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Upgrade subscription error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to upgrade subscription',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// Check if provider can add more workers
export async function checkWorkerLimit(providerId, env) {
  try {
    console.log('🔍 Checking worker limit for provider:', providerId);
    
    let subscription;
    try {
      subscription = await env.KUDDL_DB.prepare(`
        SELECT max_workers FROM provider_subscriptions WHERE provider_id = ? AND is_active = 1
      `).bind(providerId).first();
      console.log('📋 Subscription found:', subscription);
    } catch (subError) {
      console.log('⚠️ No subscription found, using default free plan');
    }

    const maxWorkers = subscription ? subscription.max_workers : 2; // Default to free plan
    console.log('📊 Max workers allowed:', maxWorkers);

    let currentCount;
    try {
      currentCount = await env.KUDDL_DB.prepare(`
        SELECT COUNT(*) as count FROM service_workers WHERE provider_id = ?
      `).bind(providerId).first();
      console.log('👥 Current worker count:', currentCount);
    } catch (countError) {
      console.log('⚠️ Error counting workers (table may not exist), assuming 0:', countError.message);
      // If table doesn't exist, assume 0 workers and allow creation
      currentCount = { count: 0 };
    }

    const count = currentCount?.count || 0;
    const canAdd = count < maxWorkers;
    
    console.log(`✅ Can add worker: ${canAdd} (${count}/${maxWorkers})`);

    return {
      canAdd: canAdd,
      current: count,
      max: maxWorkers
    };
  } catch (error) {
    console.error('❌ Check worker limit error:', error);
    console.error('Error details:', error.message, error.stack);
    // On error, allow adding (fail open for free plan)
    return { canAdd: true, current: 0, max: 2 };
  }
}
