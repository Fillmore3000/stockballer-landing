const fs = require('fs');
const path = require('path');

// Simple front matter parser (no external dependencies)
function parseFrontMatter(content) {
    const frontMatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontMatterRegex);
    
    if (!match) {
        return { data: {}, content };
    }
    
    const frontMatter = match[1];
    const body = match[2];
    const data = {};
    
    frontMatter.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim();
            let value = line.slice(colonIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            data[key] = value;
        }
    });
    
    return { data, content: body };
}

// Simple Markdown to HTML converter
function markdownToHtml(markdown) {
    let html = markdown;
    
    // Escape HTML entities first
    html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Headers
    html = html.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
    
    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Images (MUST be before links to avoid ! being left behind)
    // Handle images with any alt text including brackets: ![any text](url)
    html = html.replace(/!\[(.+?)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    
    // Links (after images)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Blockquotes
    html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote>$1</blockquote>');
    
    // Unordered lists
    html = html.replace(/^[\-\*]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Ordered lists
    html = html.replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>');
    
    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/^\*\*\*$/gm, '<hr>');
    
    // Paragraphs (lines not already wrapped)
    const lines = html.split('\n');
    const result = [];
    let inParagraph = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line === '') {
            if (inParagraph) {
                result.push('</p>');
                inParagraph = false;
            }
            continue;
        }
        
        // Skip if already a block element
        if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<ol') || 
            line.startsWith('<li') || line.startsWith('<blockquote') || line.startsWith('<hr') ||
            line.startsWith('</ul') || line.startsWith('</ol')) {
            if (inParagraph) {
                result.push('</p>');
                inParagraph = false;
            }
            result.push(line);
            continue;
        }
        
        if (!inParagraph) {
            result.push('<p>' + line);
            inParagraph = true;
        } else {
            result.push(' ' + line);
        }
    }
    
    if (inParagraph) {
        result.push('</p>');
    }
    
    return result.join('\n');
}

// Format date for display
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Generate slug from filename
function getSlug(filename) {
    return path.basename(filename, '.md');
}

// Blog post HTML template
function generatePostHtml(post) {
    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${post.title} - StockBaller Insights</title>

    <meta name="description" content="${post.description || post.title}">
    <meta name="author" content="StockBaller">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://stockballer.app/blog-posts/${post.slug}.html">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://stockballer.app/blog-posts/${post.slug}.html">
    <meta property="og:title" content="${post.title}">
    <meta property="og:description" content="${post.description || post.title}">
    <meta property="og:image" content="${post.image || 'https://stockballer.app/og-image.png'}">
    <meta property="og:site_name" content="StockBaller">
    <meta property="article:published_time" content="${post.date}">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@StockBallerApp">
    <meta name="twitter:title" content="${post.title}">
    <meta name="twitter:description" content="${post.description || post.title}">
    <meta name="twitter:image" content="${post.image || 'https://stockballer.app/og-image.png'}">

    <meta name="theme-color" content="#0d2758">
    <link rel="icon" type="image/png" href="../favicon.png">
    <link href="https://fonts.googleapis.com/css2?family=Blinker:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: rgba(13, 39, 88, 1);
            color: #fff;
            line-height: 1.8;
        }

        h1, h2, h3, h4, h5, h6 {
            font-family: 'Blinker', sans-serif;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 0 24px;
        }

        /* Navigation */
        nav {
            padding: 10px 0;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 100;
            background: #0528F3;
            box-shadow: 0 4px 20px rgba(5, 40, 243, 0.3);
        }

        nav .container {
            max-width: 1200px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            display: flex;
            align-items: center;
        }

        .logo img {
            height: 30px;
            width: auto;
        }

        .nav-links {
            display: flex;
            align-items: center;
            gap: 24px;
        }

        .nav-links a {
            color: rgba(255, 255, 255, 0.9);
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
        }

        .nav-links a:hover {
            color: #F5CB3F;
        }

        .nav-cta {
            padding: 10px 24px;
            background: #F5CB3F;
            border: none;
            border-radius: 8px;
            color: #0d2758;
            font-family: 'DM Sans', sans-serif;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            text-decoration: none;
        }

        .nav-cta:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(245, 203, 63, 0.5);
            background: #fff;
        }

        /* Article */
        article {
            padding: 120px 0 80px;
        }

        .article-header {
            margin-bottom: 40px;
            padding-bottom: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .article-meta {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 16px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
        }

        .article-meta a {
            color: #F5CB3F;
            text-decoration: none;
        }

        .article-meta a:hover {
            text-decoration: underline;
        }

        .article-header h1 {
            font-size: 2.5rem;
            font-weight: 800;
            line-height: 1.2;
            color: #fff;
        }

        .article-content h2 {
            font-size: 1.75rem;
            font-weight: 700;
            margin-top: 48px;
            margin-bottom: 16px;
            color: #F5CB3F;
        }

        .article-content h3 {
            font-size: 1.4rem;
            font-weight: 600;
            margin-top: 32px;
            margin-bottom: 12px;
            color: #fff;
        }

        .article-content p {
            margin-bottom: 20px;
            color: rgba(255, 255, 255, 0.85);
            font-size: 1.1rem;
        }

        .article-content a {
            color: #F5CB3F;
        }

        .article-content a:hover {
            text-decoration: underline;
        }

        .article-content ul, .article-content ol {
            margin-bottom: 20px;
            padding-left: 24px;
        }

        .article-content li {
            margin-bottom: 8px;
            color: rgba(255, 255, 255, 0.85);
            font-size: 1.1rem;
        }

        .article-content blockquote {
            border-left: 4px solid #F5CB3F;
            padding-left: 20px;
            margin: 24px 0;
            font-style: italic;
            color: rgba(255, 255, 255, 0.7);
        }

        .article-content code {
            background: rgba(255, 255, 255, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
        }

        .article-content img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 24px 0;
        }

        .article-content hr {
            border: none;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
            margin: 40px 0;
        }

        /* CTA Box */
        .article-cta {
            background: rgba(5, 40, 243, 0.3);
            border: 1px solid rgba(5, 40, 243, 0.5);
            border-radius: 12px;
            padding: 32px;
            margin-top: 48px;
            text-align: center;
        }

        .article-cta h3 {
            font-size: 1.5rem;
            margin-bottom: 12px;
            color: #fff;
        }

        .article-cta p {
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 20px;
        }

        .article-cta .nav-cta {
            display: inline-block;
        }

        /* Footer */
        footer {
            background: rgba(0, 0, 0, 0.3);
            padding: 40px 0;
            text-align: center;
        }

        footer .container {
            max-width: 1200px;
        }

        footer p {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
        }

        footer a {
            color: rgba(255, 255, 255, 0.8);
            text-decoration: none;
            margin: 0 12px;
        }

        footer a:hover {
            color: #F5CB3F;
        }

        .footer-links {
            margin-bottom: 20px;
        }

        @media (max-width: 768px) {
            .article-header h1 {
                font-size: 1.8rem;
            }

            .article-content h2 {
                font-size: 1.4rem;
            }

            .nav-links {
                display: none;
            }
        }
    </style>
</head>

<body>
    <nav>
        <div class="container">
            <a href="../index.html" class="logo">
                <img src="../NewLogo.png" alt="StockBaller">
            </a>
            <div class="nav-links">
                <a href="../blog.html">Insights</a>
                <a href="../index.html#how-it-works">How It Works</a>
                <a href="../index.html#faq">FAQ</a>
            </div>
            <a href="../index.html#waitlist" class="nav-cta">Join Waitlist</a>
        </div>
    </nav>

    <article>
        <div class="container">
            <header class="article-header">
                <div class="article-meta">
                    <a href="../blog.html">← Back to Insights</a>
                    <span>•</span>
                    <time datetime="${post.date}">${formatDate(post.date)}</time>
                </div>
                <h1>${post.title}</h1>
            </header>

            <div class="article-content">
                ${post.htmlContent}
            </div>

            <div class="article-cta">
                <h3>Ready to Start Investing in Athletes?</h3>
                <p>Join thousands waiting for StockBaller to launch. Be first to know when we go live.</p>
                <a href="../index.html#waitlist" class="nav-cta">Join the Waitlist</a>
            </div>
        </div>
    </article>

    <footer>
        <div class="container">
            <div class="footer-links">
                <a href="../index.html">Home</a>
                <a href="../blog.html">Insights</a>
                <a href="../terms.html">Terms of Service</a>
                <a href="../privacy.html">Privacy Policy</a>
                <a href="mailto:support@stockballer.app">Contact</a>
            </div>
            <p>© 2026 Apaw Holdings Ltd. All rights reserved.</p>
        </div>
    </footer>
</body>

</html>`;
}

// Blog index HTML template
function generateIndexHtml(posts) {
    const postCards = posts.map(post => `
                <a href="blog-posts/${post.slug}.html" class="blog-card">
                    <div class="blog-card-content">
                        <time datetime="${post.date}">${formatDate(post.date)}</time>
                        <h2>${post.title}</h2>
                        <p>${post.description || ''}</p>
                        <span class="read-more">Read more →</span>
                    </div>
                </a>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Insights - StockBaller</title>

    <meta name="description" content="Insights on athlete investing, Premier League performance analysis, and the future of sports tokenization.">
    <meta name="author" content="StockBaller">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://stockballer.app/blog.html">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://stockballer.app/blog.html">
    <meta property="og:title" content="StockBaller Insights - Athlete Investing">
    <meta property="og:description" content="Insights on athlete investing, Premier League performance analysis, and the future of sports tokenization.">
    <meta property="og:image" content="https://stockballer.app/og-image.png">
    <meta property="og:site_name" content="StockBaller">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@StockBallerApp">
    <meta name="twitter:title" content="StockBaller Insights - Athlete Investing">
    <meta name="twitter:description" content="Insights on athlete investing, Premier League performance analysis, and the future of sports tokenization.">
    <meta name="twitter:image" content="https://stockballer.app/og-image.png">

    <meta name="theme-color" content="#0d2758">
    <link rel="icon" type="image/png" href="favicon.png">
    <link href="https://fonts.googleapis.com/css2?family=Blinker:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: rgba(13, 39, 88, 1);
            color: #fff;
            line-height: 1.7;
        }

        h1, h2, h3, h4, h5, h6 {
            font-family: 'Blinker', sans-serif;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 0 24px;
        }

        /* Navigation */
        nav {
            padding: 10px 0;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 100;
            background: #0528F3;
            box-shadow: 0 4px 20px rgba(5, 40, 243, 0.3);
        }

        nav .container {
            max-width: 1200px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            display: flex;
            align-items: center;
        }

        .logo img {
            height: 30px;
            width: auto;
        }

        .nav-links {
            display: flex;
            align-items: center;
            gap: 24px;
        }

        .nav-links a {
            color: rgba(255, 255, 255, 0.9);
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
        }

        .nav-links a:hover {
            color: #F5CB3F;
        }

        .nav-cta {
            padding: 10px 24px;
            background: #F5CB3F;
            border: none;
            border-radius: 8px;
            color: #0d2758;
            font-family: 'DM Sans', sans-serif;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            text-decoration: none;
        }

        .nav-cta:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(245, 203, 63, 0.5);
            background: #fff;
        }

        /* Blog Header */
        .blog-header {
            padding: 140px 0 60px;
            text-align: center;
        }

        .blog-header h1 {
            font-size: 3rem;
            font-weight: 800;
            margin-bottom: 16px;
        }

        .blog-header h1 span {
            color: #F5CB3F;
        }

        .blog-header p {
            font-size: 1.2rem;
            color: rgba(255, 255, 255, 0.7);
            max-width: 600px;
            margin: 0 auto;
        }

        /* Blog Grid */
        .blog-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 24px;
            padding-bottom: 80px;
        }

        .blog-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            overflow: hidden;
            text-decoration: none;
            color: inherit;
            transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        }

        .blog-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
            border-color: rgba(245, 203, 63, 0.3);
        }

        .blog-card-content {
            padding: 24px;
        }

        .blog-card time {
            font-size: 0.85rem;
            color: rgba(255, 255, 255, 0.5);
        }

        .blog-card h2 {
            font-size: 1.3rem;
            font-weight: 700;
            margin: 12px 0;
            color: #fff;
            line-height: 1.3;
        }

        .blog-card p {
            color: rgba(255, 255, 255, 0.7);
            font-size: 0.95rem;
            margin-bottom: 16px;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .blog-card .read-more {
            color: #F5CB3F;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .no-posts {
            text-align: center;
            padding: 60px 24px;
            color: rgba(255, 255, 255, 0.6);
        }

        .no-posts h2 {
            font-size: 1.5rem;
            margin-bottom: 12px;
            color: #fff;
        }

        /* Footer */
        footer {
            background: rgba(0, 0, 0, 0.3);
            padding: 40px 0;
            text-align: center;
        }

        footer .container {
            max-width: 1200px;
        }

        footer p {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
        }

        footer a {
            color: rgba(255, 255, 255, 0.8);
            text-decoration: none;
            margin: 0 12px;
        }

        footer a:hover {
            color: #F5CB3F;
        }

        .footer-links {
            margin-bottom: 20px;
        }

        @media (max-width: 768px) {
            .blog-header h1 {
                font-size: 2rem;
            }

            .blog-grid {
                grid-template-columns: 1fr;
            }

            .nav-links {
                display: none;
            }
        }
    </style>
</head>

<body>
    <nav>
        <div class="container">
            <a href="index.html" class="logo">
                <img src="NewLogo.png" alt="StockBaller">
            </a>
            <div class="nav-links">
                <a href="blog.html">Insights</a>
                <a href="index.html#how-it-works">How It Works</a>
                <a href="index.html#faq">FAQ</a>
            </div>
            <a href="index.html#waitlist" class="nav-cta">Join Waitlist</a>
        </div>
    </nav>

    <main>
        <div class="container">
            <header class="blog-header">
                <h1>The <span>StockBaller</span> Insights</h1>
                <p>Insights on athlete investing, Premier League performance analysis, and the future of sports tokenization.</p>
            </header>

            <div class="blog-grid">
${posts.length > 0 ? postCards : `
                <div class="no-posts">
                    <h2>Coming Soon</h2>
                    <p>Our first blog posts are on the way. Check back soon!</p>
                </div>`}
            </div>
        </div>
    </main>

    <footer>
        <div class="container">
            <div class="footer-links">
                <a href="index.html">Home</a>
                <a href="blog.html">Insights</a>
                <a href="terms.html">Terms of Service</a>
                <a href="privacy.html">Privacy Policy</a>
                <a href="mailto:support@stockballer.app">Contact</a>
            </div>
            <p>© 2026 Apaw Holdings Ltd. All rights reserved.</p>
        </div>
    </footer>
</body>

</html>`;
}

// Main build function
function buildBlog() {
    const blogDir = path.join(__dirname, 'blog');
    const outputDir = path.join(__dirname, 'blog-posts');
    
    // Create directories if they don't exist
    if (!fs.existsSync(blogDir)) {
        fs.mkdirSync(blogDir, { recursive: true });
        console.log('Created blog/ directory');
    }
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('Created blog-posts/ directory');
    }
    
    // Read all markdown files
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));
    
    console.log(`Found ${files.length} markdown file(s)`);
    
    const posts = [];
    
    for (const file of files) {
        const filePath = path.join(blogDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const { data, content: markdown } = parseFrontMatter(content);
        
        const slug = getSlug(file);
        const htmlContent = markdownToHtml(markdown);
        
        const post = {
            slug,
            title: data.title || slug.replace(/-/g, ' '),
            date: data.date || new Date().toISOString().split('T')[0],
            description: data.description || '',
            image: data.image || '',
            htmlContent
        };
        
        posts.push(post);
        
        // Generate individual post HTML
        const postHtml = generatePostHtml(post);
        const outputPath = path.join(outputDir, `${slug}.html`);
        fs.writeFileSync(outputPath, postHtml);
        console.log(`Generated: blog-posts/${slug}.html`);
    }
    
    // Sort posts by date (newest first)
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Generate blog index
    const indexHtml = generateIndexHtml(posts);
    fs.writeFileSync(path.join(__dirname, 'blog.html'), indexHtml);
    console.log('Generated: blog.html');
    
    console.log(`\nBuild complete! ${posts.length} post(s) generated.`);
}

// Run the build
buildBlog();
