# Branding Implementation Guide

## Quick Start

1. **Place your images** in `/public/images/branding/`:
   - `favicon.ico` (32x32 or 64x64)
   - `logo-dark.png` (48x48)
   - `mascot-full.png` (256x256+)
   - `mascot-small.png` (128x128)
   - `mascot-error.png` (256x256+)

2. **They'll automatically appear:**
   - Favicon in browser tab
   - Logo can be added to header
   - Mascot for loading states, empty states, errors

## Using Branding Components

### JavaScript API

The `branding-config.js` file exposes a global `BRANDING` object with helper functions:

#### Loader (for "Loading..." states)
```javascript
const loader = createMascotLoader('Loading submissions...');
element.appendChild(loader);
```

#### Empty State
```javascript
const emptyState = createEmptyState(
  'No submissions yet',
  'Submissions will appear here once applicants submit the form.'
);
element.appendChild(emptyState);
```

#### Error State
```javascript
const errorState = createErrorState(
  'Failed to load data',
  'Please try again or contact support.'
);
element.appendChild(errorState);
```

### CSS Classes

**Sidebar Mascot** — Shows in bottom-left corner:
```html
<div class="sidebar-mascot">
  <img src="/images/branding/mascot-small.png" alt="Mascot">
</div>
```

**Empty State Card** — For empty lists/sections:
```html
<div class="empty-state-mascot">
  <img src="/images/branding/mascot-full.png" alt="Empty">
  <h3>No data</h3>
</div>
```

**Brand Logo** — For headers/titles:
```html
<a href="/" class="brand-logo">
  <img src="/images/branding/logo-dark.png" alt="Logo" class="brand-logo-image">
  <span>Dashboard</span>
</a>
```

**Card with Branding Accent** — Subtle mascot watermark:
```html
<div class="card card-branding">
  <h3>My Content</h3>
  <!-- Background shows mascot watermark -->
</div>
```

## Configuration

Edit `BRANDING` object in `/public/js/branding-config.js`:

```javascript
const BRANDING = {
  images: {
    favicon: '/images/branding/favicon.ico',
    logoDark: '/images/branding/logo-dark.png',
    mascotFull: '/images/branding/mascot-full.png',
    mascotSmall: '/images/branding/mascot-small.png',
    mascotError: '/images/branding/mascot-error.png',
  },
  colors: {
    primary: '#3b82f6',
    accent: '#22d3ee',
    secondary: '#fbbf24',
    // ... more colors
  },
  text: {
    empty: 'Nothing here yet',
    loading: 'Loading...',
    // ... more text
  },
};
```

## Where to Place Images

- **Navigation**: Update `views/partials/nav.ejs` logo src
- **Dashboard header**: Add `brand-logo` class to logo link
- **Empty states**: Use `createEmptyState()` or `empty-state-mascot` class
- **Loading states**: Use `createMascotLoader()` or `mascot-loader` class
- **Error pages**: Use `createErrorState()` or `error-mascot` class
- **Sidebar**: Overlay as sticky mascot in sidebar
- **Card accents**: Use `card-branding` class for watermark effect

## Image Format Recommendations

- **Format**: PNG with transparency
- **Optimization**: Compress with TinyPNG before uploading
- **Naming**: Lowercase with hyphens
- **Sizing**: Provide at least 2x resolution for retina displays

## Color Palette

The dashboard uses a blue/cyan theme that matches the character:
- **Primary**: `#3b82f6` (Blue)
- **Accent**: `#22d3ee` (Cyan)
- **Secondary**: `#fbbf24` (Yellow/Gold)

Update `BRANDING.colors` if your mascot uses different colors.

## Next Steps

1. Generate/commission your mascot images
2. Export as PNG with transparency
3. Optimize file sizes
4. Place in `/public/images/branding/`
5. Update any custom paths in `BRANDING` config
6. Test on all pages to ensure proper display
