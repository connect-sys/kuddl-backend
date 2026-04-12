import { addCorsHeaders } from '../utils/cors.js';

/**
 * Content Management System Controller
 * Handles blogs, job postings, and press releases
 */

// ==================== BLOG POSTS ====================

export async function createBlogPost(request, env) {
  try {
    const { title, slug, excerpt, content, category, author, featured_image, tags, status } = await request.json();

    if (!title || !content || !author) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Title, content, and author are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const id = `blog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generatedSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await env.KUDDL_DB.prepare(`
      INSERT INTO blog_posts (
        id, title, slug, excerpt, content, category, author, 
        featured_image, tags, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      id, title, generatedSlug, excerpt || '', content, category || 'General',
      author, featured_image || '', tags || '', status || 'draft'
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Blog post created successfully',
      id: id
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Create blog post error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create blog post',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function getBlogPosts(request, env) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'published';
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    const posts = await env.KUDDL_DB.prepare(`
      SELECT * FROM blog_posts 
      WHERE status = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).bind(status, limit, offset).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      posts: posts.results || []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get blog posts error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch blog posts',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function getBlogPost(request, env) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    const id = url.searchParams.get('id');

    if (!slug && !id) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Slug or ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const query = slug 
      ? 'SELECT * FROM blog_posts WHERE slug = ?'
      : 'SELECT * FROM blog_posts WHERE id = ?';
    
    const post = await env.KUDDL_DB.prepare(query).bind(slug || id).first();

    if (!post) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Blog post not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      post: post
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get blog post error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch blog post',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function updateBlogPost(request, env) {
  try {
    const { id, title, slug, excerpt, content, category, author, featured_image, tags, status } = await request.json();

    if (!id) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Blog post ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare(`
      UPDATE blog_posts 
      SET title = ?, slug = ?, excerpt = ?, content = ?, category = ?, 
          author = ?, featured_image = ?, tags = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(title, slug, excerpt, content, category, author, featured_image, tags, status, id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Blog post updated successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Update blog post error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update blog post',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function deleteBlogPost(request, env) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Blog post ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Blog post deleted successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Delete blog post error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete blog post',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// ==================== JOB POSTINGS ====================

export async function createJobPosting(request, env) {
  try {
    const { title, department, location, type, description, requirements, responsibilities, status } = await request.json();

    if (!title || !description) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Title and description are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const id = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await env.KUDDL_DB.prepare(`
      INSERT INTO job_postings (
        id, title, department, location, type, description, 
        requirements, responsibilities, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      id, title, department || '', location || 'Remote', type || 'Full-time',
      description, requirements || '', responsibilities || '', status || 'active'
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Job posting created successfully',
      id: id
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Create job posting error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create job posting',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function getJobPostings(request, env) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'active';

    const jobs = await env.KUDDL_DB.prepare(`
      SELECT * FROM job_postings 
      WHERE status = ? 
      ORDER BY created_at DESC
    `).bind(status).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      jobs: jobs.results || []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get job postings error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch job postings',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function updateJobPosting(request, env) {
  try {
    const { id, title, department, location, type, description, requirements, responsibilities, status } = await request.json();

    if (!id) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Job posting ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare(`
      UPDATE job_postings 
      SET title = ?, department = ?, location = ?, type = ?, description = ?, 
          requirements = ?, responsibilities = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(title, department, location, type, description, requirements, responsibilities, status, id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Job posting updated successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Update job posting error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update job posting',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function deleteJobPosting(request, env) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Job posting ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare('DELETE FROM job_postings WHERE id = ?').bind(id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Job posting deleted successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Delete job posting error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete job posting',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// ==================== PRESS RELEASES ====================

export async function createPressRelease(request, env) {
  try {
    const { title, date, excerpt, content, link, status } = await request.json();

    if (!title || !content) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Title and content are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    const id = `press_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await env.KUDDL_DB.prepare(`
      INSERT INTO press_releases (
        id, title, date, excerpt, content, link, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      id, title, date || new Date().toISOString().split('T')[0], 
      excerpt || '', content, link || '', status || 'published'
    ).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Press release created successfully',
      id: id
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Create press release error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create press release',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function getPressReleases(request, env) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'published';

    const releases = await env.KUDDL_DB.prepare(`
      SELECT * FROM press_releases 
      WHERE status = ? 
      ORDER BY date DESC, created_at DESC
    `).bind(status).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      releases: releases.results || []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Get press releases error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch press releases',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function updatePressRelease(request, env) {
  try {
    const { id, title, date, excerpt, content, link, status } = await request.json();

    if (!id) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Press release ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare(`
      UPDATE press_releases 
      SET title = ?, date = ?, excerpt = ?, content = ?, link = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(title, date, excerpt, content, link, status, id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Press release updated successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Update press release error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to update press release',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

export async function deletePressRelease(request, env) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Press release ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }

    await env.KUDDL_DB.prepare('DELETE FROM press_releases WHERE id = ?').bind(id).run();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Press release deleted successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Delete press release error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to delete press release',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}

// ==================== DATABASE SETUP ====================

export async function createContentTables(request, env) {
  try {
    console.log('📝 Creating content management tables...');

    // Create blog_posts table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        excerpt TEXT,
        content TEXT NOT NULL,
        category TEXT,
        author TEXT NOT NULL,
        featured_image TEXT,
        tags TEXT,
        status TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created blog_posts table');

    // Create job_postings table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS job_postings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        department TEXT,
        location TEXT,
        type TEXT,
        description TEXT NOT NULL,
        requirements TEXT,
        responsibilities TEXT,
        status TEXT CHECK (status IN ('active', 'closed', 'draft')) DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created job_postings table');

    // Create press_releases table
    await env.KUDDL_DB.prepare(`
      CREATE TABLE IF NOT EXISTS press_releases (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        excerpt TEXT,
        content TEXT NOT NULL,
        link TEXT,
        status TEXT CHECK (status IN ('published', 'draft', 'archived')) DEFAULT 'published',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Created press_releases table');

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Content management tables created successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  } catch (error) {
    console.error('Create content tables error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to create content tables',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  }
}
