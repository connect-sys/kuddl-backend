// Categories Controller - handles category and subcategory management
import { addCorsHeaders } from '../utils/cors.js';

// Get all categories with their subcategories
export const getCategories = async (request, env) => {
  try {
    console.log('🔍 Getting categories...');
    
    // Get all categories with service count
    const categories = await env.KUDDL_DB.prepare(`
      SELECT c.*, COUNT(s.id) as service_count 
      FROM categories c
      LEFT JOIN subcategories sub ON c.id = sub.category_id
      LEFT JOIN services s ON sub.id = s.subcategory_id AND s.is_active = 1
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all();

    console.log('📊 Categories result:', categories);

    // Get all subcategories
    const subcategories = await env.KUDDL_DB.prepare(`
      SELECT * FROM subcategories 
      ORDER BY category_id, name ASC
    `).all();

    console.log('📋 Subcategories result:', subcategories);

    // Group subcategories by category
    const categoriesWithHierarchy = (categories.results || categories).map(category => {
      const categorySubcategories = (subcategories.results || subcategories)
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
    const { id, name, description, module, icon, sort_order } = await request.json();
    
    if (!id || !name || !module) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'ID, name, and module are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    await env.KUDDL_DB.prepare(`
      INSERT INTO categories (id, name, description, module, icon, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, name, description || '', module.toUpperCase(), icon || '', sort_order || 0).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Category created successfully'
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
    const { id, category_id, name, description, sort_order } = await request.json();
    
    if (!id || !category_id || !name) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'ID, category_id, and name are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    await env.KUDDL_DB.prepare(`
      INSERT INTO subcategories (id, category_id, name, description, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, category_id, name, description || '', sort_order || 0).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Subcategory created successfully'
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
    const url = new URL(request.url);
    const categoryId = url.pathname.split('/').pop();
    const { name, description, module, icon, sort_order, is_active } = await request.json();
    
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
    const url = new URL(request.url);
    const categoryId = url.pathname.split('/').pop();
    
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
