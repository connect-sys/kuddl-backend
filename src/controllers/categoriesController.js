// Categories Controller - handles category and subcategory management
import { addCorsHeaders } from '../utils/cors.js';
import { requireAdmin } from './authController.js';

// Idempotently make sure the taxonomy tables carry every column the admin
// manager reads/writes (image_url on both, color/icon/sort_order on categories,
// icon/slug/image_url/sort_order/is_active on subcategories). D1 has no
// "ADD COLUMN IF NOT EXISTS", so we diff against PRAGMA table_info first.
async function ensureTaxonomyColumns(env) {
  const addMissing = async (table, wanted) => {
    const info = await env.KUDDL_DB.prepare(`PRAGMA table_info(${table})`).all();
    const have = new Set((info.results || []).map((c) => c.name));
    for (const col of wanted) {
      if (!have.has(col.name)) {
        await env.KUDDL_DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`).run();
      }
    }
  };
  await addMissing('categories', [
    { name: 'color', type: 'TEXT' },
    { name: 'icon', type: 'TEXT' },
    { name: 'image_url', type: 'TEXT' },
    { name: 'sort_order', type: 'INTEGER DEFAULT 0' },
    { name: 'is_active', type: 'INTEGER DEFAULT 1' },
    { name: 'updated_at', type: 'TEXT' },
  ]);
  await addMissing('subcategories', [
    { name: 'icon', type: 'TEXT' },
    { name: 'slug', type: 'TEXT' },
    { name: 'image_url', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'sort_order', type: 'INTEGER DEFAULT 0' },
    { name: 'is_active', type: 'INTEGER DEFAULT 1' },
    { name: 'updated_at', type: 'TEXT' },
  ]);
}

// Admin gate helper: returns the admin user, or a Response to short-circuit.
async function gateAdmin(request, env) {
  const admin = await requireAdmin(request, env);
  return admin; // either the user object or an already-formed 403 Response
}

// Get all categories with their subcategories
export const getCategories = async (request, env) => {
  try {
    console.log('🔍 Getting categories...');
    
    // Get all categories with service count
    const categoriesResult = await env.KUDDL_DB.prepare(`
      SELECT c.*, COUNT(s.id) as service_count 
      FROM categories c
      LEFT JOIN subcategories sub ON c.id = sub.category_id
      LEFT JOIN services s ON sub.id = s.subcategory_id AND s.is_active = 1
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all();

    console.log('📊 Categories result:', categoriesResult);
    const categories = categoriesResult.results || [];

    // Only active subcategories — matches getSubcategories(), and keeps
    // deactivated/legacy rows out of every picker that hangs off this
    // endpoint (they were being shown alongside the real, current list).
    const subcategoriesResult = await env.KUDDL_DB.prepare(`
      SELECT * FROM subcategories
      WHERE is_active = 1
      ORDER BY category_id, name ASC
    `).all();

    console.log('📋 Subcategories result:', subcategoriesResult);
    const subcategories = subcategoriesResult.results || [];

    // Group subcategories by category
    const categoriesWithHierarchy = categories.map(category => {
      const categorySubcategories = subcategories
        .filter(sub => sub.category_id === category.id)
        .map(subcategory => ({
          id: subcategory.id,
          category_id: subcategory.category_id,
          name: subcategory.name,
          description: subcategory.description,
          icon: subcategory.icon,
          slug: subcategory.slug,
          image_url: subcategory.image_url
        }));

      console.log(`📂 Category ${category.id} (${category.name}) has ${categorySubcategories.length} subcategories`);

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        module: category.module,
        icon: category.icon,
        subcategories: categorySubcategories
      };
    });

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: categoriesWithHierarchy
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString()
      }
    }));

  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error message:', error.message);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

// Get categories by module (CARE, BLOOM, EVENTS, DISCOVER)
export const getCategoriesByModule = async (request, env) => {
  try {
    const url = new URL(request.url);
    const module = url.searchParams.get('module');
    
    if (!module) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Module parameter is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const categories = await env.KUDDL_DB.prepare(`
      SELECT * FROM categories 
      WHERE is_active = 1 AND module = ?
      ORDER BY sort_order ASC, name ASC
    `).bind(module.toUpperCase()).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: categories
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error fetching categories by module:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch categories'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

// Get subcategories for a specific category
export const getSubcategories = async (request, env) => {
  try {
    const url = new URL(request.url);
    const categoryId = url.searchParams.get('categoryId');
    
    if (!categoryId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Category ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const subcategories = await env.KUDDL_DB.prepare(`
      SELECT * FROM subcategories 
      WHERE is_active = 1 AND category_id = ?
      ORDER BY sort_order ASC, name ASC
    `).bind(categoryId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: subcategories
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error fetching subcategories:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch subcategories'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

// Get child subcategories for a specific subcategory
export const getChildSubcategories = async (request, env) => {
  try {
    const url = new URL(request.url);
    const subcategoryId = url.searchParams.get('subcategoryId');
    
    if (!subcategoryId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Subcategory ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const childSubcategories = await env.KUDDL_DB.prepare(`
      SELECT * FROM child_subcategories 
      WHERE is_active = 1 AND subcategory_id = ?
      ORDER BY sort_order ASC, name ASC
    `).bind(subcategoryId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: childSubcategories.results || childSubcategories
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error fetching child subcategories:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch child subcategories'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

// Create a new category (Admin only)
export const createCategory = async (request, env) => {
  try {
    const admin = await gateAdmin(request, env);
    if (admin instanceof Response) return admin;
    await ensureTaxonomyColumns(env);

    const body = await request.json();
    const { name, description, module, icon, color, image_url, sort_order } = body;
    if (!name || !module) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'name and module are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    // Allow the caller to pass an explicit id; otherwise derive a stable one.
    const id = body.id || `cat_${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

    await env.KUDDL_DB.prepare(`
      INSERT INTO categories (id, name, description, module, icon, color, image_url, sort_order, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).bind(
      id, name, description || '', module.toUpperCase(),
      icon || '', color || '', image_url || '', sort_order || 0
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Category created successfully',
      data: { id }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error creating category:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create category'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

// Create a new subcategory (Admin only)
export const createSubcategory = async (request, env) => {
  try {
    const admin = await gateAdmin(request, env);
    if (admin instanceof Response) return admin;
    await ensureTaxonomyColumns(env);

    const body = await request.json();
    const { category_id, name, description, icon, slug, image_url, sort_order } = body;
    if (!category_id || !name) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'category_id and name are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    const cleanName = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const id = body.id || `${category_id}_${cleanName}`;
    const finalSlug = slug || cleanName;

    await env.KUDDL_DB.prepare(`
      INSERT INTO subcategories (id, category_id, name, description, icon, slug, image_url, sort_order, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).bind(
      id, category_id, name, description || '',
      icon || '', finalSlug, image_url || '', sort_order || 0
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Subcategory created successfully',
      data: { id }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error creating subcategory:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create subcategory'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

// Update category (Admin only)
export const updateCategory = async (request, env) => {
  try {
    const admin = await gateAdmin(request, env);
    if (admin instanceof Response) return admin;
    await ensureTaxonomyColumns(env);

    const categoryId = request.params?.id || new URL(request.url).pathname.split('/').pop();
    const { name, description, module, icon, color, image_url, sort_order, is_active } = await request.json();

    if (!categoryId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Category ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const updateFields = [];
    const values = [];

    if (name !== undefined) { updateFields.push('name = ?'); values.push(name); }
    if (description !== undefined) { updateFields.push('description = ?'); values.push(description); }
    if (module !== undefined) { updateFields.push('module = ?'); values.push(module.toUpperCase()); }
    if (icon !== undefined) { updateFields.push('icon = ?'); values.push(icon); }
    if (color !== undefined) { updateFields.push('color = ?'); values.push(color); }
    if (image_url !== undefined) { updateFields.push('image_url = ?'); values.push(image_url); }
    if (sort_order !== undefined) { updateFields.push('sort_order = ?'); values.push(sort_order); }
    if (is_active !== undefined) { updateFields.push('is_active = ?'); values.push(is_active); }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(categoryId);
    
    await env.KUDDL_DB.prepare(`
      UPDATE categories 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).bind(...values).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Category updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error updating category:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update category'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

// Delete category (Admin only)
export const deleteCategory = async (request, env) => {
  try {
    const admin = await gateAdmin(request, env);
    if (admin instanceof Response) return admin;
    await ensureTaxonomyColumns(env);

    const categoryId = request.params?.id || new URL(request.url).pathname.split('/').pop();

    if (!categoryId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Category ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Soft delete by setting is_active to 0
    await env.KUDDL_DB.prepare(`
      UPDATE categories 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(categoryId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Category deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('Error deleting category:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete category'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

// Admin view: every category + every subcategory (INCLUDING inactive) so the
// admin manager can show, edit, re-enable and delete the whole taxonomy
// section-by-section. Unlike getCategories() this does not filter is_active.
export const getCategoriesAdmin = async (request, env) => {
  try {
    const admin = await gateAdmin(request, env);
    if (admin instanceof Response) return admin;
    await ensureTaxonomyColumns(env);

    const cats = (await env.KUDDL_DB.prepare(`
      SELECT * FROM categories ORDER BY sort_order ASC, name ASC
    `).all()).results || [];

    const subs = (await env.KUDDL_DB.prepare(`
      SELECT * FROM subcategories ORDER BY sort_order ASC, name ASC
    `).all()).results || [];

    // Live service counts per subcategory (active services only).
    let counts = {};
    try {
      const rows = (await env.KUDDL_DB.prepare(`
        SELECT subcategory_id, COUNT(*) AS n
        FROM services WHERE is_active = 1
        GROUP BY subcategory_id
      `).all()).results || [];
      counts = Object.fromEntries(rows.map((r) => [r.subcategory_id, Number(r.n) || 0]));
    } catch { /* services table shape varies; counts are best-effort */ }

    const data = cats.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      module: c.module || '',
      icon: c.icon || '',
      color: c.color || '',
      image_url: c.image_url || '',
      sort_order: c.sort_order ?? 0,
      is_active: c.is_active ?? 1,
      subcategories: subs
        .filter((s) => s.category_id === c.id)
        .map((s) => ({
          id: s.id,
          category_id: s.category_id,
          name: s.name,
          description: s.description || '',
          icon: s.icon || '',
          slug: s.slug || '',
          image_url: s.image_url || '',
          sort_order: s.sort_order ?? 0,
          is_active: s.is_active ?? 1,
          service_count: counts[s.id] || 0,
        })),
    }));

    return addCorsHeaders(new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }));
  } catch (error) {
    console.error('Error fetching admin categories:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to fetch categories', error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
};

// Update a subcategory (Admin only)
export const updateSubcategory = async (request, env) => {
  try {
    const admin = await gateAdmin(request, env);
    if (admin instanceof Response) return admin;
    await ensureTaxonomyColumns(env);

    const subId = request.params?.id || new URL(request.url).pathname.split('/').pop();
    if (!subId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false, message: 'Subcategory ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const { name, description, icon, slug, image_url, category_id, sort_order, is_active } = await request.json();
    const updateFields = [];
    const values = [];
    if (name !== undefined) { updateFields.push('name = ?'); values.push(name); }
    if (description !== undefined) { updateFields.push('description = ?'); values.push(description); }
    if (icon !== undefined) { updateFields.push('icon = ?'); values.push(icon); }
    if (slug !== undefined) { updateFields.push('slug = ?'); values.push(slug); }
    if (image_url !== undefined) { updateFields.push('image_url = ?'); values.push(image_url); }
    if (category_id !== undefined) { updateFields.push('category_id = ?'); values.push(category_id); }
    if (sort_order !== undefined) { updateFields.push('sort_order = ?'); values.push(sort_order); }
    if (is_active !== undefined) { updateFields.push('is_active = ?'); values.push(is_active); }

    if (!updateFields.length) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false, message: 'No fields to update'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(subId);

    await env.KUDDL_DB.prepare(`
      UPDATE subcategories SET ${updateFields.join(', ')} WHERE id = ?
    `).bind(...values).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true, message: 'Subcategory updated successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Error updating subcategory:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to update subcategory'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
};

// Delete a subcategory (Admin only) — soft delete so existing services keep
// their reference; the admin can re-enable it later.
export const deleteSubcategory = async (request, env) => {
  try {
    const admin = await gateAdmin(request, env);
    if (admin instanceof Response) return admin;
    await ensureTaxonomyColumns(env);

    const subId = request.params?.id || new URL(request.url).pathname.split('/').pop();
    if (!subId) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false, message: 'Subcategory ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare(`
      UPDATE subcategories SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(subId).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true, message: 'Subcategory deleted successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false, message: 'Failed to delete subcategory'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
};
